import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Scale, X, RefreshCw, Copy, Check, MapPin, Users2, User, Zap,
  AlertTriangle, Info, ArrowLeftRight,
} from 'lucide-react';
import type { DiscoveryOutcome } from '@/types/discovery';
import type { Group } from '@/types/group';
import type { FairMixItem, FairMixPlan } from '@/types/fair-mix';
import {
  buildFairMixPlan, rebalanceFairMixPlan, removeFromFairMixPlan,
  restoreToFairMixPlan, generatePlanSummaryText, sourceLabelFor,
} from '@/services/fair-mix-planner';
import { ImageWithFallback, Badge } from '@/components/ui';

interface FairMixPlanSectionProps {
  outcome: DiscoveryOutcome;
  group: Group;
}

export function FairMixPlanSection({ outcome, group }: FairMixPlanSectionProps) {
  const input = useMemo(() => ({
    rankedCandidates: outcome.rankedCandidates,
    tasteBridgeCandidates: outcome.tasteBridge?.candidates ?? [],
    tasteBridgeStatus: outcome.tasteBridge?.status ?? 'skipped',
    memberRetrievals: outcome.memberRetrievals,
    destination: group.destination ?? '',
    group,
  }), [outcome, group]);

  const [plan, setPlan] = useState<FairMixPlan>(() => buildFairMixPlan(input));
  const [copied, setCopied] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const planRef = useRef(plan);

  // Keep ref in sync for rebalance
  planRef.current = plan;

  const handleRemove = useCallback((key: string) => {
    setPlan((prev) => removeFromFairMixPlan(prev, key));
  }, []);

  const handleRestore = useCallback((key: string) => {
    setPlan((prev) => restoreToFairMixPlan(prev, input, key));
  }, [input]);

  const handleRebalance = useCallback(() => {
    setPlan(rebalanceFairMixPlan(input));
    setShowRestore(false);
  }, [input]);

  const handleCopy = useCallback(async () => {
    const text = generatePlanSummaryText(planRef.current);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: show the text in a selectable textarea
      setShowCopyFallback(text);
    }
  }, []);

  const [copyFallbackText, setShowCopyFallback] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="card border-accent-200 bg-accent-50">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white">
            <Scale size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-ink-900">Fair Mix Plan</h3>
            <p className="mt-1 text-sm text-ink-600">
              A balanced shortlist of up to 5 recommendations, selected from your existing
              discovery results. Fair Mix prioritizes genuine shared discoveries, then fills
              in underrepresented members, and includes Taste Bridge group-profile finds.
              No additional Qloo requests are made.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="ocean">
                <MapPin size={10} className="inline mr-1" />
                {plan.destination}
              </Badge>
              <Badge variant="accent">{plan.items.length} selected</Badge>
              {plan.eligible.length > plan.items.length && (
                <Badge>{plan.eligible.length - plan.items.length} more available</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Partial data warnings */}
      {plan.failedMemberNames.length > 0 && (
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 text-warning-600" />
            <div className="text-sm text-warning-800">
              <p className="font-medium">Partial data</p>
              <p className="mt-1">
                Retrieval failed for {plan.failedMemberNames.join(', ')}. The plan is based on
                successful results only and may not fully represent those members' tastes.
              </p>
            </div>
          </div>
        </div>
      )}

      {plan.tasteBridgeUnavailable && (
        <div className="rounded-lg border border-ink-100 bg-ink-50 p-4">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 text-ink-400" />
            <div className="text-sm text-ink-500">
              <p className="font-medium text-ink-600">Taste Bridge unavailable</p>
              <p className="mt-1">
                Taste Bridge results were not available. The plan is built from per-member
                discoveries only.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {plan.items.length === 0 && (
        <div className="card text-center py-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100">
            <Scale className="text-ink-400" size={24} />
          </div>
          <h4 className="text-lg font-medium text-ink-900">No recommendations for Fair Mix</h4>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
            No candidates were available to build a shortlist. Try rerunning discovery,
            adding more interests, or changing the destination.
          </p>
        </div>
      )}

      {/* Plan summary */}
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-600">{plan.summary}</p>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={handleRebalance}
            className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50 transition-colors"
          >
            <RefreshCw size={14} /> Rebalance plan
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-accent-200 bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-100 transition-colors"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy plan summary'}
          </button>
        </div>
      </div>

      {/* Clipboard fallback */}
      {copyFallbackText && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-ink-700">Copy this summary:</p>
            <button
              onClick={() => setShowCopyFallback(null)}
              className="text-ink-400 hover:text-ink-600"
            >
              <X size={16} />
            </button>
          </div>
          <textarea
            readOnly
            value={copyFallbackText}
            className="w-full rounded-lg border border-ink-200 bg-ink-50 p-3 text-xs text-ink-700"
            rows={Math.min(15, copyFallbackText.split('\n').length)}
            onFocus={(e) => e.target.select()}
          />
          <p className="mt-2 text-xs text-ink-400">Select all and copy manually.</p>
        </div>
      )}

      {/* Shortlist items */}
      {plan.items.length > 0 && (
        <div className="space-y-4">
          {plan.items.map((item) => (
            <FairMixCard
              key={item.key}
              item={item}
              onRemove={() => handleRemove(item.key)}
            />
          ))}
        </div>
      )}

      {/* Removed items — restore panel */}
      {plan.removedKeys.length > 0 && (
        <div className="card">
          <button
            onClick={() => setShowRestore((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-medium text-ink-600 hover:text-ink-800 transition-colors"
          >
            <span className="flex items-center gap-2">
              <ArrowLeftRight size={14} />
              {plan.removedKeys.length} removed item(s) — restore?
            </span>
            {showRestore ? <X size={16} /> : <Info size={16} />}
          </button>
          {showRestore && (
            <div className="mt-4 space-y-2">
              {plan.removedKeys.map((key) => {
                const eligible = plan.eligible.find((e) => e.key === key);
                if (!eligible) return null;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-ink-100 bg-ink-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-700">{eligible.name}</p>
                      <p className="text-xs text-ink-400">{sourceLabelFor(eligible.source)}</p>
                    </div>
                    <button
                      onClick={() => handleRestore(key)}
                      className="flex items-center gap-1 rounded-lg border border-accent-200 bg-white px-2.5 py-1 text-xs font-medium text-accent-600 hover:bg-accent-50 transition-colors shrink-0"
                    >
                      <ArrowLeftRight size={12} /> Restore
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Fair Mix card ──────────────────────────────────────────────────

function FairMixCard({
  item,
  onRemove,
}: {
  item: FairMixItem;
  onRemove: () => void;
}) {
  const sourceIcon = item.source === 'shared' ? <Users2 size={12} /> :
    item.source === 'individual' ? <User size={12} /> :
    <Zap size={12} />;

  const sourceBadgeClass = item.source === 'shared' ? 'bg-accent-600' :
    item.source === 'individual' ? 'bg-ink-700' :
    'bg-ocean-600';

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* Image */}
        <div className="relative h-40 sm:h-auto sm:w-48 shrink-0">
          <ImageWithFallback
            src={item.image}
            alt={item.name}
            category={item.category}
            className="h-full w-full"
            rounded="rounded-none"
            iconSize={32}
          />
          <div className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-sm font-bold text-ink-50 shadow-md">
            {item.position}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="font-medium text-ink-900 truncate">{item.name}</h4>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                <span className="capitalize">
                  {item.category.replace('urn:entity:', '').replace(/_/g, ' ')}
                </span>
                {item.city && (
                  <span className="flex items-center gap-0.5">
                    <MapPin size={10} /> {item.city}
                    {item.metro && item.metro !== item.city && ` (${item.metro})`}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onRemove}
              className="text-ink-300 hover:text-error-500 transition-colors shrink-0"
              aria-label={`Remove ${item.name} from plan`}
            >
              <X size={18} />
            </button>
          </div>

          {/* Source label */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`flex items-center gap-1 rounded-full ${sourceBadgeClass} px-2.5 py-0.5 text-xs font-medium text-white`}>
              {sourceIcon} {sourceLabelFor(item.source)}
            </span>
            {item.memberAssociationVerified && item.memberNames.length > 0 && (
              <span className="rounded-full bg-ocean-100 px-2.5 py-0.5 text-xs text-ocean-700">
                <Users2 size={10} className="inline mr-1" />
                {item.memberNames.join(', ')}
              </span>
            )}
            {item.source === 'taste_bridge' && !item.memberAssociationVerified && (
              <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs text-ink-500">
                Individual contributions unknown
              </span>
            )}
          </div>

          {/* Description */}
          {item.description && (
            <p className="mt-3 text-sm text-ink-500 line-clamp-2">{item.description}</p>
          )}

          {/* Selection reason */}
          <div className="mt-3 rounded-lg border border-accent-100 bg-accent-50 px-3 py-2">
            <p className="text-xs text-accent-700">
              <Scale size={10} className="inline mr-1" />
              {item.selectionReason}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
