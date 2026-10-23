import { useState, useCallback, useRef } from 'react';
import {
  Compass, Sparkles, ArrowLeft, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, Info, ChevronDown, ChevronUp, MapPin, TrendingUp,
  Layers, Search, AlertTriangle, Users2, User, Bridge, Zap,
} from 'lucide-react';
import type { Group } from '@/types/group';
import type { AgentStep, DiscoveryOutcome, RankedCandidate, TasteBridgeCandidate, TasteBridgeResult } from '@/types/discovery';
import { runDiscovery, retrieveTasteBridge } from '@/services/discovery-agent';
import { ErrorBanner, EmptyState, Badge, Spinner, ImageWithFallback, SkeletonCard } from '@/components/ui';

interface DiscoveryWorkspaceProps {
  group: Group;
  onBack: () => void;
}

type WorkspaceState =
  | { status: 'idle' }
  | { status: 'running'; trace: AgentStep[] }
  | { status: 'done'; outcome: DiscoveryOutcome }
  | { status: 'error'; message: string; kind: string };

type FilterMode = 'all' | 'shared' | 'individual' | 'taste_bridge';
type SortMode = 'consensus' | 'coverage' | 'name';

export function DiscoveryWorkspace({ group, onBack }: DiscoveryWorkspaceProps) {
  const [state, setState] = useState<WorkspaceState>({ status: 'idle' });
  const [sortMode, setSortMode] = useState<SortMode>('consensus');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tasteBridgeOverride, setTasteBridgeOverride] = useState<TasteBridgeResult | null>(null);
  const [tasteBridgeRetrying, setTasteBridgeRetrying] = useState(false);
  const runningRef = useRef(false);

  const retryTasteBridge = useCallback(async () => {
    if (!group.destination || tasteBridgeRetrying) return;
    setTasteBridgeRetrying(true);
    const result = await retrieveTasteBridge(group, group.destination.trim(), undefined);
    setTasteBridgeOverride(result);
    setTasteBridgeRetrying(false);
  }, [group, tasteBridgeRetrying]);

  const startDiscovery = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState({ status: 'running', trace: [] });
    setTasteBridgeOverride(null);

    const outcome = await runDiscovery(
      group,
      {},
      (trace) => setState({ status: 'running', trace }),
    );

    if (outcome.run.status === 'failed') {
      setState({
        status: 'error',
        message: outcome.run.errorDetails || 'Discovery failed.',
        kind: 'planning',
      });
    } else {
      setState({ status: 'done', outcome });
    }
    runningRef.current = false;
  }, [group]);

  const resolvedInterestCount = group.members.reduce(
    (sum, m) => sum + m.culturalInterests.filter((ci) => ci.resolutionStatus === 'resolved').length,
    0,
  );
  const unresolvedInterestCount = group.members.reduce(
    (sum, m) => sum + m.culturalInterests.filter((ci) => ci.resolutionStatus !== 'resolved').length,
    0,
  );

  const allCandidates = state.status === 'done' ? state.outcome.rankedCandidates : [];
  const sharedCandidates = allCandidates.filter((c) => c.isShared);
  const individualCandidates = allCandidates.filter((c) => !c.isShared);
  const tasteBridge = tasteBridgeOverride ?? (state.status === 'done' ? state.outcome.tasteBridge : null);
  const tasteBridgeCandidates = tasteBridge?.candidates ?? [];

  const filteredCandidates = (() => {
    let list = allCandidates;
    if (filterMode === 'shared') list = sharedCandidates;
    else if (filterMode === 'individual') list = individualCandidates;
    return sortCandidates(list, sortMode);
  })();

  const topCandidate = allCandidates.length > 0 ? allCandidates[0] : null;
  const restCandidates = filteredCandidates.filter((c) => c !== topCandidate || filterMode !== 'all');

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <button onClick={onBack} className="btn-secondary">
          <ArrowLeft size={18} /> Back to group
        </button>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-ink-50">
            <Compass size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-medium text-ink-900">Discovery workspace</h1>
            <p className="text-sm text-ink-500">Group: {group.name}</p>
          </div>
        </div>
      </div>

      {/* Group summary with destination */}
      <div className="card mb-8">
        {group.destination && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-ocean-50 px-3 py-2 text-sm text-ocean-700">
            <MapPin size={16} />
            <span className="font-medium">Destination: {group.destination}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
          <Badge variant="ocean">{resolvedInterestCount} resolved interests</Badge>
          {unresolvedInterestCount > 0 && (
            <Badge>{unresolvedInterestCount} unresolved (not sent to Qloo)</Badge>
          )}
          <span>·</span>
          <span>{group.members.length} members</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {group.members.map((member) => {
            const resolved = member.culturalInterests.filter((ci) => ci.resolutionStatus === 'resolved');
            const unresolved = member.culturalInterests.filter((ci) => ci.resolutionStatus !== 'resolved');
            return (
              <div key={member.id} className="rounded-lg border border-ink-100 p-4">
                <p className="font-medium text-ink-900">{member.displayName}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {member.culturalInterests.map((interest) => (
                    <span key={interest.id} className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                      {interest.displayName || interest.originalInput}
                      {interest.resolutionStatus === 'resolved' && (
                        <span className="text-accent-600" title="Resolved via Qloo"> ●</span>
                      )}
                      {interest.resolutionStatus === 'unresolved' && (
                        <span className="text-ink-300" title="Not resolved via Qloo"> ○</span>
                      )}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-400">
                  {resolved.length} resolved · {unresolved.length} unresolved
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Idle state — start discovery */}
      {state.status === 'idle' && (
        <div className="card text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-100">
            <Sparkles className="text-accent-600" size={24} />
          </div>
          <h3 className="text-lg font-medium text-ink-900">Discover shared experiences in {group.destination || 'your area'}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
            The discovery agent will query Qloo's cultural intelligence API for each
            member, scoped to {group.destination || 'your destination'}, then merge and
            rank candidates by group consensus. Real recommendations — no fabricated data.
          </p>
          <button onClick={startDiscovery} className="btn-accent mt-6 mx-auto">
            <Sparkles size={18} /> Start discovery
          </button>
        </div>
      )}

      {/* Running state — live trace + skeletons */}
      {state.status === 'running' && (
        <div className="space-y-6">
          <div className="card flex items-center gap-3">
            <Spinner size={20} />
            <span className="text-sm text-ink-600">
              {state.trace.length > 0
                ? state.trace[state.trace.length - 1].explanation
                : 'Starting...'}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <LiveTracePanel steps={state.trace} />
        </div>
      )}

      {/* Error state */}
      {state.status === 'error' && (
        <div>
          <ErrorBanner message={state.message} onRetry={startDiscovery} />
          <div className="mt-4 rounded-lg border border-ink-100 bg-ink-50 p-4">
            <div className="flex items-start gap-2">
              <Info size={16} className="mt-0.5 text-ink-400" />
              <div className="text-sm text-ink-500">
                <p className="font-medium text-ink-600">Error type: {state.kind}</p>
                <p className="mt-1">
                  CommonGround never fabricates cultural results. Try adding more
                  interests with specific categories, check that your destination is
                  a real city name, or verify Qloo API connectivity.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Done state — results */}
      {state.status === 'done' && (
        <div className="space-y-8 animate-slide-up">
          {/* Summary banner */}
          <div className="flex items-center gap-2 rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
            <CheckCircle2 size={18} />
            <span>
              Discovery {runStatusLabel(state.outcome.run.status)} — {state.outcome.rankedCandidates.length} candidate(s) ranked.
              {state.outcome.adaptiveTriggered && ' Adaptive pass was used.'}
            </span>
            <button onClick={startDiscovery} className="ml-auto text-accent-600 hover:text-accent-700">
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Warnings */}
          {state.outcome.warnings.length > 0 && (
            <div className="rounded-lg border border-warning-200 bg-warning-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 text-warning-600" />
                <div className="text-sm text-warning-800">
                  {state.outcome.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Consensus explanation */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={18} className="text-ink-400" />
              <h3 className="text-lg font-medium text-ink-900">How rankings were calculated</h3>
            </div>
            <p className="text-sm text-ink-600">{state.outcome.consensusExplanation}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant="ocean">70% member coverage</Badge>
              <Badge variant="ocean">30% rank support</Badge>
              <Badge>CommonGround derived score</Badge>
              {sharedCandidates.length > 0 && (
                <Badge variant="accent">{sharedCandidates.length} shared by group</Badge>
              )}
              {individualCandidates.length > 0 && (
                <Badge>{individualCandidates.length} individual discoveries</Badge>
              )}
            </div>
          </div>

          {/* Featured top recommendation */}
          {topCandidate && filterMode === 'all' && (
            <FeaturedCandidate candidate={topCandidate} expanded={expandedId === topCandidate.entityId} onToggle={() => setExpandedId(expandedId === topCandidate.entityId ? null : topCandidate.entityId)} />
          )}

          {/* Filter + Sort controls */}
          {(allCandidates.length > 0 || (tasteBridge && tasteBridge.status !== 'skipped')) && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink-500">Show:</span>
                <div className="flex flex-wrap gap-2">
                  {([
                    { mode: 'all' as const, label: 'All', icon: <Layers size={12} /> },
                    { mode: 'shared' as const, label: `Shared (${sharedCandidates.length})`, icon: <Users2 size={12} /> },
                    { mode: 'individual' as const, label: `Individual (${individualCandidates.length})`, icon: <User size={12} /> },
                    ...(tasteBridge && tasteBridge.status !== 'skipped'
                      ? [{ mode: 'taste_bridge' as const, label: `Taste Bridge (${tasteBridgeCandidates.length})`, icon: <Bridge size={12} /> }]
                      : []),
                  ] as const).map(({ mode, label, icon }) => (
                    <button
                      key={mode}
                      onClick={() => setFilterMode(mode)}
                      className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        filterMode === mode
                          ? 'bg-ink-900 text-ink-50'
                          : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                      }`}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </div>
              {filterMode !== 'taste_bridge' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-500">Sort by:</span>
                  <div className="flex gap-2">
                    {(['consensus', 'coverage', 'name'] as SortMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setSortMode(mode)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          sortMode === mode
                            ? 'bg-ink-900 text-ink-50'
                            : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                        }`}
                      >
                        {mode === 'consensus' ? 'Consensus' : mode === 'coverage' ? 'Coverage' : 'Name'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No shared candidates message */}
          {filterMode === 'shared' && sharedCandidates.length === 0 && individualCandidates.length > 0 && (
            <div className="rounded-lg border border-warning-200 bg-warning-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 text-warning-600" />
                <div className="text-sm text-warning-800">
                  <p className="font-medium">No shared candidates found</p>
                  <p className="mt-1">
                    Qloo found individual discoveries for this group, but the current results
                    do not establish a strong shared match. Try adding more interests or
                    adjusting the destination.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Candidate grid */}
          {filteredCandidates.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(filterMode === 'all' ? restCandidates : filteredCandidates).map((candidate) => (
                <CandidateCard
                  key={candidate.entityId}
                  candidate={candidate}
                  expanded={expandedId === candidate.entityId}
                  onToggle={() =>
                    setExpandedId(expandedId === candidate.entityId ? null : candidate.entityId)
                  }
                />
              ))}
            </div>
          ) : allCandidates.length > 0 ? (
            <EmptyState
              icon={<AlertCircle size={32} />}
              title="No candidates in this filter"
              description={`No ${filterMode} candidates match the current filter. Try switching to "All" to see all results.`}
              action={
                <button onClick={() => setFilterMode('all')} className="btn-secondary">
                  Show all candidates
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<AlertCircle size={32} />}
              title="No candidates found"
              description="Qloo returned no place recommendations for this group's interests in this destination. Try adding more diverse interests or a different destination."
              action={
                <button onClick={startDiscovery} className="btn-secondary">
                  <RefreshCw size={16} /> Retry discovery
                </button>
              }
            />
          )}

          {/* Edit action */}
          <div className="card flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <Info size={16} />
              <span>Want different results? Edit your destination or interests and rerun.</span>
            </div>
            <button onClick={onBack} className="btn-secondary">
              <ArrowLeft size={16} /> Edit group
            </button>
          </div>

          {/* Decision trace */}
          <DecisionTracePanel steps={state.outcome.run.traceSteps} />
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function sortCandidates(candidates: RankedCandidate[], mode: SortMode): RankedCandidate[] {
  const sorted = [...candidates];
  if (mode === 'consensus') {
    sorted.sort((a, b) => b.consensusScore - a.consensusScore || b.memberCount - a.memberCount);
  } else if (mode === 'coverage') {
    sorted.sort((a, b) => b.memberCoverage - a.memberCoverage || b.consensusScore - a.consensusScore);
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}

function runStatusLabel(status: string): string {
  switch (status) {
    case 'completed': return 'complete';
    case 'partial': return 'partial';
    default: return status;
  }
}

// ─── Featured candidate (top result) ───────────────────────────────

function FeaturedCandidate({
  candidate,
  expanded,
  onToggle,
}: {
  candidate: RankedCandidate;
  expanded: boolean;
  onToggle: () => void;
}) {
  const coveragePct = Math.round(candidate.memberCoverage * 100);
  const evidenceMembers = [...new Set(candidate.evidence.map((e) => e.memberName))];

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-md transition-all hover:shadow-lg">
      <div className="grid md:grid-cols-2">
        {/* Image */}
        <div className="relative h-56 md:h-full min-h-[220px]">
          <ImageWithFallback
            src={candidate.image}
            alt={candidate.name}
            category={candidate.category}
            className="h-full w-full"
            rounded="rounded-none"
            iconSize={40}
          />
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 text-sm font-bold text-ink-50 shadow-lg">
              {candidate.rank}
            </div>
            {candidate.isShared ? (
              <span className="flex items-center gap-1 rounded-full bg-accent-600 px-3 py-1 text-xs font-medium text-white shadow-lg">
                <Users2 size={12} /> Top match
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-ink-700 px-3 py-1 text-xs font-medium text-ink-50 shadow-lg">
                <User size={12} /> Top result
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col p-6">
          <div>
            <h3 className="text-xl font-medium text-ink-900">{candidate.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <span className="capitalize">
                {candidate.category.replace('urn:entity:', '').replace(/_/g, ' ')}
              </span>
              {candidate.city && (
                <span className="flex items-center gap-0.5">
                  <MapPin size={10} /> {candidate.city}
                  {candidate.metro && candidate.metro !== candidate.city && ` (${candidate.metro})`}
                </span>
              )}
            </div>
          </div>

          {candidate.description && (
            <p className="mt-3 text-sm leading-relaxed text-ink-600 line-clamp-3">
              {candidate.description}
            </p>
          )}

          {/* Score bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-ink-400 mb-1">
              <span>Member coverage</span>
              <span>{coveragePct}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-ink-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-500 transition-all duration-700"
                style={{ width: `${coveragePct}%` }}
              />
            </div>
          </div>

          {/* Evidence tags */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {evidenceMembers.map((name) => (
              <span key={name} className="rounded-full bg-ocean-100 px-2.5 py-0.5 text-xs text-ocean-700">
                <Search size={10} className="inline mr-1" />
                {name}
              </span>
            ))}
            {candidate.qlooAffinity !== null && candidate.qlooAffinity !== undefined && (
              <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs text-ink-500">
                Qloo affinity: {candidate.qlooAffinity.toFixed(2)}
              </span>
            )}
            <Badge variant="accent">
              {(candidate.consensusScore * 100).toFixed(0)}% consensus
            </Badge>
            <span className="text-xs text-ink-400">
              {candidate.memberCount}/{candidate.totalMembersWithResults} members
            </span>
          </div>

          {/* Expand */}
          <button
            onClick={onToggle}
            className="mt-auto flex items-center gap-1 pt-4 text-xs font-medium text-ink-500 hover:text-ink-700 transition-colors"
          >
            {expanded ? (
              <><ChevronUp size={14} /> Hide evidence</>
            ) : (
              <><ChevronDown size={14} /> Show evidence & metrics</>
            )}
          </button>
        </div>
      </div>

      {/* Expanded evidence */}
      {expanded && (
        <EvidencePanel candidate={candidate} coveragePct={coveragePct} evidenceMembers={evidenceMembers} />
      )}
    </div>
  );
}

// ─── Candidate card ─────────────────────────────────────────────────

function CandidateCard({
  candidate,
  expanded,
  onToggle,
}: {
  candidate: RankedCandidate;
  expanded: boolean;
  onToggle: () => void;
}) {
  const coveragePct = Math.round(candidate.memberCoverage * 100);
  const evidenceMembers = [...new Set(candidate.evidence.map((e) => e.memberName))];

  return (
    <div className="card overflow-hidden">
      {/* Image header */}
      <div className="relative h-44 overflow-hidden">
        <ImageWithFallback
          src={candidate.image}
          alt={candidate.name}
          category={candidate.category}
          className="h-full w-full"
          rounded="rounded-none"
          iconSize={32}
        />
        <div className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-ink-50 shadow-md">
          {candidate.rank}
        </div>
        <div className="absolute right-3 top-3">
          {candidate.isShared ? (
            <span className="flex items-center gap-1 rounded-full bg-accent-600 px-2.5 py-0.5 text-xs font-medium text-white shadow-md">
              <Users2 size={10} /> Shared
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-ink-700 px-2.5 py-0.5 text-xs font-medium text-ink-50 shadow-md">
              <User size={10} /> Individual
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-medium text-ink-900 truncate">{candidate.name}</h4>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <span className="capitalize">
                {candidate.category.replace('urn:entity:', '').replace(/_/g, ' ')}
              </span>
              {candidate.city && (
                <span className="flex items-center gap-0.5">
                  <MapPin size={10} /> {candidate.city}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="accent">
              {(candidate.consensusScore * 100).toFixed(0)}%
            </Badge>
            <span className="text-xs text-ink-400">
              {candidate.memberCount}/{candidate.totalMembersWithResults}
            </span>
          </div>
        </div>

        {candidate.description && (
          <p className="mt-2 text-sm text-ink-500 line-clamp-2">
            {candidate.description}
          </p>
        )}

        {/* Coverage bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-ink-400 mb-1">
            <span>Member coverage</span>
            <span>{coveragePct}%</span>
          </div>
          <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-500 transition-all duration-500"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
        </div>

        {/* Evidence tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {evidenceMembers.map((name) => (
            <span key={name} className="rounded-full bg-ocean-100 px-2 py-0.5 text-xs text-ocean-700">
              <Search size={10} className="inline mr-1" />
              {name}
            </span>
          ))}
          {candidate.qlooAffinity !== null && candidate.qlooAffinity !== undefined && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-500">
              Qloo affinity: {candidate.qlooAffinity.toFixed(2)}
            </span>
          )}
        </div>

        {/* Expand/collapse */}
        <button
          onClick={onToggle}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-700 transition-colors"
        >
          {expanded ? (
            <><ChevronUp size={14} /> Hide evidence</>
          ) : (
            <><ChevronDown size={14} /> Show evidence & metrics</>
          )}
        </button>
      </div>

      {/* Expanded evidence panel */}
      {expanded && (
        <EvidencePanel candidate={candidate} coveragePct={coveragePct} evidenceMembers={evidenceMembers} />
      )}
    </div>
  );
}

// ─── Shared evidence panel (used by both FeaturedCandidate and CandidateCard) ──

function EvidencePanel({
  candidate,
  coveragePct,
  evidenceMembers,
}: {
  candidate: RankedCandidate;
  coveragePct: number;
  evidenceMembers: string[];
}) {
  return (
    <div className="mt-4 border-t border-ink-100 pt-4 animate-slide-down">
      {/* Metrics breakdown */}
      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <MetricBox
          label="Member coverage"
          value={`${coveragePct}%`}
          detail={`${candidate.memberCount} of ${candidate.totalMembersWithResults} members with results`}
        />
        <MetricBox
          label="Rank support"
          value={candidate.rankSupport.toFixed(3)}
          detail="Average position weight across member queries"
        />
        <MetricBox
          label="Consensus score"
          value={candidate.consensusScore.toFixed(3)}
          detail="70% coverage + 30% rank support (CommonGround derived)"
        />
      </div>

      {/* Per-member evidence table */}
      <div className="rounded-lg border border-ink-100">
        <div className="border-b border-ink-100 bg-ink-50 px-3 py-2 text-xs font-medium text-ink-600">
          <Layers size={12} className="inline mr-1" />
          Retrieval evidence ({candidate.evidence.length} appearance(s))
        </div>
        <div className="divide-y divide-ink-100">
          {candidate.evidence.map((ev, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="text-ink-700">{ev.memberName}</span>
              <div className="flex items-center gap-3 text-ink-400">
                <span>Pass {ev.passNumber}</span>
                <span>Rank #{ev.rankInMemberList + 1}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Qloo explainability */}
      {candidate.qlooExplainability != null && (
        <div className="mt-3 rounded-lg border border-ocean-100 bg-ocean-50 p-3">
          <div className="flex items-center gap-1 text-xs font-medium text-ocean-700">
            <Info size={12} /> Qloo explainability
          </div>
          <p className="mt-1 text-xs text-ocean-600">
            Qloo provided explainability data for this recommendation, indicating
            which input entities contributed to the match.
          </p>
        </div>
      )}

      {/* Retrieval path (fallback explanation) */}
      {candidate.qlooExplainability == null && (
        <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50 p-3">
          <p className="text-xs text-ink-400">
            <Info size={12} className="inline mr-1" />
            This candidate was surfaced by {evidenceMembers.length} member-specific
            Qloo Insights {candidate.evidence.length > 1 ? 'queries' : 'query'}.
            No Qloo explainability data was returned for this result.
            Coverage and rank support are CommonGround's derived metrics, not Qloo scores.
          </p>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-ink-100 p-3">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-400">{detail}</p>
    </div>
  );
}

// ─── Decision trace panel ───────────────────────────────────────────

function DecisionTracePanel({ steps }: { steps: AgentStep[] }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Info size={18} className="text-ink-400" />
        <h3 className="text-lg font-medium text-ink-900">Decision trace</h3>
        <Badge>Live</Badge>
      </div>
      <p className="text-sm text-ink-500 mb-4">
        Each step of the agent's execution, with real status, counts, and evidence references.
      </p>
      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`rounded-lg border p-3 ${
              step.status === 'completed'
                ? 'border-accent-200 bg-accent-50'
                : step.status === 'failed'
                  ? 'border-error-200 bg-error-50'
                  : step.status === 'running'
                    ? 'border-ocean-200 bg-ocean-50'
                    : 'border-ink-100 bg-ink-50'
            }`}
          >
            <div className="flex items-center gap-2">
              {step.status === 'running' && <Loader2 size={14} className="animate-spin text-ocean-600" />}
              {step.status === 'completed' && <CheckCircle2 size={14} className="text-accent-600" />}
              {step.status === 'failed' && <AlertCircle size={14} className="text-error-500" />}
              <span className="text-sm font-medium text-ink-700">
                {step.stepType.replace(/_/g, ' ')}
              </span>
              <span className={`text-xs uppercase tracking-wide ${
                step.status === 'completed' ? 'text-accent-600' :
                step.status === 'failed' ? 'text-error-600' :
                step.status === 'running' ? 'text-ocean-600' :
                'text-ink-400'
              }`}>
                {step.status}
              </span>
              <span className="ml-auto text-xs text-ink-300">
                {new Date(step.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-600">{step.explanation}</p>
            {step.evidenceRefs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {step.evidenceRefs.map((ref, i) => (
                  <span key={i} className="rounded bg-white px-2 py-0.5 text-xs text-ink-400">
                    {ref.length > 30 ? ref.slice(0, 30) + '...' : ref}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Live trace panel (during execution) ────────────────────────────

function LiveTracePanel({ steps }: { steps: AgentStep[] }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Loader2 size={18} className="animate-spin text-ocean-600" />
        <h3 className="text-lg font-medium text-ink-900">Agent execution</h3>
      </div>
      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`rounded-lg border p-3 ${
              step.status === 'completed'
                ? 'border-accent-200 bg-accent-50'
                : step.status === 'failed'
                  ? 'border-error-200 bg-error-50'
                  : step.status === 'running'
                    ? 'border-ocean-200 bg-ocean-50'
                    : 'border-ink-100 bg-ink-50'
            }`}
          >
            <div className="flex items-center gap-2">
              {step.status === 'running' && <Loader2 size={14} className="animate-spin text-ocean-600" />}
              {step.status === 'completed' && <CheckCircle2 size={14} className="text-accent-600" />}
              {step.status === 'failed' && <AlertCircle size={14} className="text-error-500" />}
              <span className="text-sm font-medium text-ink-700">
                {step.stepType.replace(/_/g, ' ')}
              </span>
              <span className={`text-xs uppercase tracking-wide ${
                step.status === 'completed' ? 'text-accent-600' :
                step.status === 'failed' ? 'text-error-600' :
                step.status === 'running' ? 'text-ocean-600' : 'text-ink-400'
              }`}>
                {step.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-600">{step.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
