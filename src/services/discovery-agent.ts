/**
 * CommonGround Discovery Agent
 *
 * A bounded, deterministic orchestration engine that:
 *   A) Assesses group inputs and builds a retrieval plan
 *   B) Retrieves per-member recommendations from Qloo Insights
 *   C) Merges and deduplicates candidates by entity ID
 *   D) Ranks candidates using group-consensus metrics
 *   E) Optionally runs one adaptive exploration pass
 *   F) Produces a typed outcome with ranked candidates, evidence, and trace
 *
 * No LLM provider, no external service beyond the existing Qloo proxy.
 * The API key stays server-side in the edge function.
 */

import type { Group } from '@/types/group';
import type { QlooEntity, QlooResult } from '@/types/qloo';
import type {
  AgentStep,
  DiscoveryPlan,
  DiscoveryOutcome,
  DiscoveryRun,
  MemberRetrievalResult,
  CandidateEvidence,
  RankedCandidate,
  TasteBridgeCandidate,
  TasteBridgeResult,
  TasteBridgeContribution,
} from '@/types/discovery';
import { getInsights } from '@/lib/qloo-client';

// ─── Configuration ──────────────────────────────────────────────────

const TARGET_CATEGORY = 'urn:entity:place';
const DEFAULT_TAKE = 20;
const MAX_CONCURRENCY = 3;
const COVERAGE_WEIGHT = 0.7;
const RANK_SUPPORT_WEIGHT = 0.3;
const ADAPTIVE_MIN_CANDIDATES = 3;
const ADAPTIVE_MIN_COVERAGE = 0.5;

// Taste Bridge configuration
const TB_MAX_ENTITIES_PER_MEMBER = 3;
const TB_MAX_COMBINED_IDS = 12;
const TB_MIN_MEMBERS_WITH_RESOLVED = 2;

/** Function type for Qloo Insights retrieval (injectable for testing). */
export type InsightsFn = (params: {
  filterType: string;
  signalInterestsEntities?: string[];
  filterLocationQuery?: string;
  take?: number;
  sortBy?: string;
  featureExplainability?: boolean;
}) => Promise<QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string }; query?: unknown }>>;

export interface DiscoveryConfig {
  take?: number;
  coverageWeight?: number;
  rankSupportWeight?: number;
  adaptiveMinCandidates?: number;
  adaptiveMinCoverage?: number;
  insightsFn?: InsightsFn;
}

// ─── Trace helpers ──────────────────────────────────────────────────

let stepCounter = 0;

function nextStepId(): string {
  stepCounter += 1;
  return `step-${stepCounter}`;
}

function makeStep(
  stepType: AgentStep['stepType'],
  status: AgentStep['status'],
  explanation: string,
  evidenceRefs: string[] = [],
): AgentStep {
  return {
    id: nextStepId(),
    stepType,
    status,
    explanation,
    timestamp: new Date().toISOString(),
    evidenceRefs,
  };
}

// ─── Stage A: Assess and plan ───────────────────────────────────────

export function buildRetrievalPlan(group: Group): DiscoveryPlan {
  const memberPlans = group.members.map((member) => {
    const resolved = member.culturalInterests.filter(
      (ci) => ci.resolutionStatus === 'resolved' && ci.resolvedEntityId,
    );
    const unresolved = member.culturalInterests.filter(
      (ci) => ci.resolutionStatus !== 'resolved',
    );
    return {
      memberId: member.id,
      memberName: member.displayName,
      entityIds: resolved.map((ci) => ci.resolvedEntityId!),
      hasUnresolvedInterests: unresolved.length > 0,
    };
  });

  const totalResolvedEntities = memberPlans.reduce((sum, mp) => sum + mp.entityIds.length, 0);
  const totalUnresolved = group.members.reduce(
    (sum, m) => sum + m.culturalInterests.filter((ci) => ci.resolutionStatus !== 'resolved').length,
    0,
  );

  const membersWithEntities = memberPlans.filter((mp) => mp.entityIds.length > 0).length;
  const sufficientForDiscovery = membersWithEntities >= 1 && totalResolvedEntities >= 1;

  let guidance: string | null = null;
  if (!sufficientForDiscovery) {
    if (totalResolvedEntities === 0) {
      guidance =
        'No interests have been resolved to Qloo entities yet. Add interests with a selected category so they can be matched to real cultural entities.';
    } else {
      guidance =
        'Not enough resolved interests for discovery. Try adding more interests with specific categories.';
    }
  }

  return {
    targetCategory: TARGET_CATEGORY,
    memberPlans,
    totalResolvedEntities,
    totalUnresolved,
    sufficientForDiscovery,
    guidance,
  };
}

// ─── Stage B: Per-member retrieval ──────────────────────────────────

export interface RetrievalRequest {
  memberId: string;
  memberName: string;
  entityIds: string[];
  passNumber: number;
}

async function retrieveForOneMember(
  req: RetrievalRequest,
  take: number,
  insightsFn: InsightsFn,
  destination: string | null,
): Promise<MemberRetrievalResult> {
  const start = Date.now();

  if (req.entityIds.length === 0) {
    return {
      memberId: req.memberId,
      memberName: req.memberName,
      status: 'skipped',
      entityIds: [],
      candidates: [],
      candidateCount: 0,
      elapsedMs: 0,
      error: null,
      passNumber: req.passNumber,
    };
  }

  const result: QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string }; query?: unknown }> =
    await insightsFn({
      filterType: TARGET_CATEGORY,
      signalInterestsEntities: req.entityIds,
      filterLocationQuery: destination || undefined,
      take,
      sortBy: 'affinity',
      featureExplainability: true,
    });

  const elapsedMs = Date.now() - start;

  if (!result.success) {
    return {
      memberId: req.memberId,
      memberName: req.memberName,
      status: 'failed',
      entityIds: req.entityIds,
      candidates: [],
      candidateCount: 0,
      elapsedMs,
      error: result.error.message,
      passNumber: req.passNumber,
    };
  }

  const candidates = result.data.results;

  return {
    memberId: req.memberId,
    memberName: req.memberName,
    status: 'success',
    entityIds: req.entityIds,
    candidates,
    candidateCount: candidates.length,
    elapsedMs,
    error: null,
    passNumber: req.passNumber,
  };
}

/**
 * Run retrievals for multiple members with bounded concurrency.
 */
export async function retrieveForMembers(
  requests: RetrievalRequest[],
  take: number,
  insightsFn: InsightsFn = getInsights as InsightsFn,
  destination: string | null = null,
): Promise<MemberRetrievalResult[]> {
  const results: MemberRetrievalResult[] = [];
  const queue = [...requests];

  async function worker() {
    while (queue.length > 0) {
      const req = queue.shift();
      if (!req) break;
      const result = await retrieveForOneMember(req, take, insightsFn, destination);
      results.push(result);
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, requests.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}

// ─── Stage C: Merge and normalize ───────────────────────────────────

export interface MergedCandidate {
  entityId: string;
  entity: QlooEntity;
  evidence: CandidateEvidence[];
}

export function mergeCandidates(
  retrievals: MemberRetrievalResult[],
): Map<string, MergedCandidate> {
  const merged = new Map<string, MergedCandidate>();

  for (const retrieval of retrievals) {
    if (retrieval.status !== 'success') continue;

    retrieval.candidates.forEach((entity, index) => {
      const entityId = entity.entity_id || entity.id;
      if (!entityId) return;

      const evidence: CandidateEvidence = {
        entityId,
        memberId: retrieval.memberId,
        memberName: retrieval.memberName,
        rankInMemberList: index,
        passNumber: retrieval.passNumber,
      };

      const existing = merged.get(entityId);
      if (existing) {
        existing.evidence.push(evidence);
      } else {
        merged.set(entityId, {
          entityId,
          entity,
          evidence: [evidence],
        });
      }
    });
  }

  return merged;
}

// ─── Stage D: Consensus ranking ─────────────────────────────────────

/**
 * Calculate member coverage: the proportion of members with successful
 * retrievals whose results include this candidate.
 */
export function calculateMemberCoverage(
  evidence: CandidateEvidence[],
  totalMembersWithResults: number,
): number {
  if (totalMembersWithResults === 0) return 0;
  const uniqueMembers = new Set(evidence.map((e) => e.memberId));
  return uniqueMembers.size / totalMembersWithResults;
}

/**
 * Calculate rank support: a normalized measure derived from the candidate's
 * positions in member-specific result lists. Position 0 gets weight 1.0,
 * decaying linearly. The average across all member appearances is returned.
 */
export function calculateRankSupport(evidence: CandidateEvidence[], take: number): number {
  if (evidence.length === 0) return 0;

  const weights = evidence.map((e) => {
    const position = e.rankInMemberList;
    if (position < 0) return 0;
    return Math.max(0, 1 - position / take);
  });

  return weights.reduce((sum, w) => sum + w, 0) / weights.length;
}

/**
 * Calculate consensus score using configurable weights.
 * Default: 70% member coverage + 30% rank support.
 */
export function calculateConsensusScore(
  memberCoverage: number,
  rankSupport: number,
  coverageWeight: number = COVERAGE_WEIGHT,
  rankSupportWeight: number = RANK_SUPPORT_WEIGHT,
): number {
  return memberCoverage * coverageWeight + rankSupport * rankSupportWeight;
}

export function rankCandidates(
  merged: Map<string, MergedCandidate>,
  retrievals: MemberRetrievalResult[],
  config: DiscoveryConfig = {},
): RankedCandidate[] {
  const coverageWeight = config.coverageWeight ?? COVERAGE_WEIGHT;
  const rankSupportWeight = config.rankSupportWeight ?? RANK_SUPPORT_WEIGHT;
  const take = config.take ?? DEFAULT_TAKE;

  const membersWithResults = new Set(
    retrievals.filter((r) => r.status === 'success').map((r) => r.memberId),
  );
  const totalMembersWithResults = membersWithResults.size;

  const ranked: RankedCandidate[] = [];

  for (const [entityId, merged2] of merged) {
    const { entity, evidence } = merged2;

    const memberCoverage = calculateMemberCoverage(evidence, totalMembersWithResults);
    const rankSupport = calculateRankSupport(evidence, take);
    const consensusScore = calculateConsensusScore(
      memberCoverage,
      rankSupport,
      coverageWeight,
      rankSupportWeight,
    );

    const memberCount = new Set(evidence.map((e) => e.memberId)).size;
    const geocode = entity.properties?.geocode;

    ranked.push({
      source: 'qloo_insights',
      entityId,
      category: entity.subtype || entity.type || TARGET_CATEGORY,
      name: entity.name || entity.properties?.name || 'Unknown',
      description:
        entity.properties?.short_description ||
        entity.description ||
        entity.properties?.description ||
        null,
      image:
        entity.properties?.images?.[0]?.url ||
        entity.properties?.image?.url ||
        entity.image ||
        null,
      metadata: entity.metadata || {},
      retrievalMeta: {
        endpoint: '/v2/insights',
        retrievedAt: new Date().toISOString(),
        affinityScore: entity.affinity ?? null,
        explainability: entity.explainability ?? null,
      },
      memberCoverage,
      memberCount,
      totalMembersWithResults,
      rankSupport,
      consensusScore,
      rank: 0,
      evidence,
      qlooAffinity: entity.affinity ?? null,
      qlooExplainability: entity.explainability ?? null,
      isShared: memberCount >= 2,
      city: geocode?.city ?? geocode?.name ?? null,
      metro: geocode?.metro ?? null,
    });
  }

  // Sort by consensus score descending, then by member count, then by name
  ranked.sort((a, b) => {
    if (b.consensusScore !== a.consensusScore) return b.consensusScore - a.consensusScore;
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    return a.name.localeCompare(b.name);
  });

  ranked.forEach((c, i) => {
    c.rank = i + 1;
  });

  return ranked;
}

// ─── Stage E: Adaptive exploration ──────────────────────────────────

/**
 * Determine if adaptive exploration should be triggered.
 * Returns members who have additional unused resolved interests.
 */
const MAX_ENTITIES_PER_MEMBER_FIRST_PASS = 3;

export function shouldTriggerAdaptive(
  ranked: RankedCandidate[],
  plan: DiscoveryPlan,
  retrievals: MemberRetrievalResult[],
  config: DiscoveryConfig = {},
): { trigger: boolean; reason: string; membersForRetry: string[] } {
  const minCandidates = config.adaptiveMinCandidates ?? ADAPTIVE_MIN_CANDIDATES;
  const minCoverage = config.adaptiveMinCoverage ?? ADAPTIVE_MIN_COVERAGE;

  if (ranked.length >= minCandidates && ranked.length > 0) {
    const maxCoverage = ranked[0].memberCoverage;
    if (maxCoverage >= minCoverage) {
      return { trigger: false, reason: 'Coverage is sufficient', membersForRetry: [] };
    }
  }

  // Find members whose first-pass retrieval returned few candidates
  const weakMembers = new Set(
    retrievals
      .filter((r) => r.passNumber === 1 && r.candidateCount < 3)
      .map((r) => r.memberId),
  );

  // Check if weak members have additional interests not sent in the first pass
  // The first pass sends at most MAX_ENTITIES_PER_MEMBER_FIRST_PASS entities per member.
  // Members with more interests have leftovers for the adaptive pass.
  const firstPassEntityIdsByMember = new Map<string, Set<string>>();
  for (const r of retrievals) {
    if (r.passNumber === 1) {
      firstPassEntityIdsByMember.set(r.memberId, new Set(r.entityIds));
    }
  }

  const membersWithUnused: string[] = [];
  for (const memberPlan of plan.memberPlans) {
    if (!weakMembers.has(memberPlan.memberId)) continue;
    const usedIds = firstPassEntityIdsByMember.get(memberPlan.memberId) ?? new Set<string>();
    const hasMore = memberPlan.entityIds.some((id) => !usedIds.has(id));
    if (hasMore) {
      membersWithUnused.push(memberPlan.memberId);
    }
  }

  if (membersWithUnused.length === 0) {
    return {
      trigger: false,
      reason: 'No members with additional unused interests for a second pass',
      membersForRetry: [],
    };
  }

  return {
    trigger: true,
    reason: `Low coverage or few candidates — retrying ${membersWithUnused.length} member(s) with additional interests`,
    membersForRetry: membersWithUnused,
  };
}

// ─── Stage F: Taste Bridge group-level retrieval ────────────────────

/** Maps entity IDs to the members who share that interest. */
interface EntityMemberMap {
  entityId: string;
  interestNames: string[];
  memberNames: string[];
}

/**
 * Build a balanced, deduplicated set of resolved entity IDs for the group-level
 * Taste Bridge request. Selects up to TB_MAX_ENTITIES_PER_MEMBER distinct
 * resolved interests per member, with a total cap of TB_MAX_COMBINED_IDS.
 * Preserves member associations for explainability mapping.
 */
export function buildGroupInterestSet(group: Group): {
  entityIds: string[];
  entityMap: Map<string, EntityMemberMap>;
  membersWithResolved: number;
} {
  const entityMap = new Map<string, EntityMemberMap>();

  for (const member of group.members) {
    const resolved = member.culturalInterests.filter(
      (ci) => ci.resolutionStatus === 'resolved' && ci.resolvedEntityId,
    );
    const selected = resolved.slice(0, TB_MAX_ENTITIES_PER_MEMBER);

    for (const interest of selected) {
      const eid = interest.resolvedEntityId!;
      const existing = entityMap.get(eid);
      if (existing) {
        if (!existing.memberNames.includes(member.displayName)) {
          existing.memberNames.push(member.displayName);
        }
        if (interest.displayName && !existing.interestNames.includes(interest.displayName)) {
          existing.interestNames.push(interest.displayName);
        }
      } else {
        entityMap.set(eid, {
          entityId: eid,
          interestNames: interest.displayName ? [interest.displayName] : [],
          memberNames: [member.displayName],
        });
      }
    }
  }

  const entityIds = [...entityMap.keys()].slice(0, TB_MAX_COMBINED_IDS);
  const membersWithResolved = group.members.filter(
    (m) => m.culturalInterests.some((ci) => ci.resolutionStatus === 'resolved' && ci.resolvedEntityId),
  ).length;

  return { entityIds, entityMap, membersWithResolved };
}

/**
 * Parse Qloo's query-level explainability to map contributing input entities
 * back to their member associations. Only includes entities present in the
 * returned explainability data — omitted entities are not treated as proof
 * of zero influence.
 */
function parseExplainability(
  queryExplainability: unknown,
  entityMap: Map<string, EntityMemberMap>,
): { contributions: TasteBridgeContribution[]; hasExplainability: boolean } {
  if (!queryExplainability || typeof queryExplainability !== 'object') {
    return { contributions: [], hasExplainability: false };
  }

  const explObj = queryExplainability as Record<string, unknown>;
  const signalKey = 'signal.interests.entities';
  if (!(signalKey in explObj)) {
    return { contributions: [], hasExplainability: false };
  }

  const signalData = explObj[signalKey] as Record<string, unknown>;
  // Use effect_on_all_recs for the broadest view of contributions
  const effectKey = 'effect_on_all_recs';
  if (!(effectKey in signalData) || !Array.isArray(signalData[effectKey])) {
    return { contributions: [], hasExplainability: false };
  }

  const effects = signalData[effectKey] as Array<{ entity_id?: string; avg_score?: number }>;
  const contributions: TasteBridgeContribution[] = [];

  for (const effect of effects) {
    if (!effect.entity_id) continue;
    const memberInfo = entityMap.get(effect.entity_id);
    contributions.push({
      entityId: effect.entity_id,
      avgScore: typeof effect.avg_score === 'number' ? effect.avg_score : 0,
      interestNames: memberInfo?.interestNames || [],
      memberNames: memberInfo?.memberNames || [],
    });
  }

  return { contributions, hasExplainability: contributions.length > 0 };
}

/**
 * Execute the group-level Taste Bridge retrieval. At most ONE Qloo Insights
 * request is made using the combined group interests.
 */
export async function retrieveTasteBridge(
  group: Group,
  destination: string,
  insightsFn: InsightsFn,
  take: number = DEFAULT_TAKE,
): Promise<TasteBridgeResult> {
  const { entityIds, entityMap, membersWithResolved } = buildGroupInterestSet(group);

  if (membersWithResolved < TB_MIN_MEMBERS_WITH_RESOLVED) {
    return {
      status: 'skipped',
      candidates: [],
      destination,
      combinedEntityIds: [],
      explanation: `Taste Bridge requires at least ${TB_MIN_MEMBERS_WITH_RESOLVED} members with resolved interests. Only ${membersWithResolved} member(s) have resolved interests.`,
      error: null,
    };
  }

  if (entityIds.length === 0) {
    return {
      status: 'skipped',
      candidates: [],
      destination,
      combinedEntityIds: [],
      explanation: 'No resolved entity IDs available for the group-level request.',
      error: null,
    };
  }

  const result = await insightsFn({
    filterType: TARGET_CATEGORY,
    signalInterestsEntities: entityIds,
    filterLocationQuery: destination,
    take,
    sortBy: 'affinity',
    featureExplainability: true,
  });

  if (!result.success) {
    return {
      status: 'failed',
      candidates: [],
      destination,
      combinedEntityIds: entityIds,
      explanation: 'The group-level Taste Bridge request failed.',
      error: result.error.message,
    };
  }

  const entities = result.data.results;
  const queryExplainability = (result.data as { query?: unknown }).query
    ? ((result.data as { query?: unknown }).query as Record<string, unknown>).explainability
    : undefined;

  const { contributions, hasExplainability } = parseExplainability(queryExplainability, entityMap);

  // Deduplicate by entity ID
  const seen = new Set<string>();
  const candidates: TasteBridgeCandidate[] = [];

  for (const entity of entities) {
    const entityId = entity.entity_id || entity.id;
    if (!entityId || seen.has(entityId)) continue;
    seen.add(entityId);

    const geocode = entity.properties?.geocode;

    candidates.push({
      entityId,
      name: entity.name || entity.properties?.name || 'Unknown',
      description:
        entity.properties?.short_description ||
        entity.description ||
        entity.properties?.description ||
        null,
      image:
        entity.properties?.images?.[0]?.url ||
        entity.properties?.image?.url ||
        entity.image ||
        null,
      category: entity.subtype || entity.type || TARGET_CATEGORY,
      city: geocode?.city ?? geocode?.name ?? null,
      metro: geocode?.metro ?? null,
      affinity: entity.affinity ?? null,
      contributions,
      hasExplainability,
    });
  }

  const explanation = hasExplainability
    ? `Group-level retrieval using ${entityIds.length} combined interests from ${membersWithResolved} members. Qloo returned ${candidates.length} candidate(s) with explainability data showing contributing input entities.`
    : `Group-level retrieval using ${entityIds.length} combined interests from ${membersWithResolved} members. Qloo returned ${candidates.length} candidate(s). Per-interest explanation was not returned.`;

  return {
    status: 'success',
    candidates,
    destination,
    combinedEntityIds: entityIds,
    explanation,
    error: null,
  };
}

// ─── Entity extraction from QlooEntity ──────────────────────────────

export function extractEntityId(entity: QlooEntity): string | null {
  return entity.entity_id || entity.id || null;
}

// ─── Main orchestrator ──────────────────────────────────────────────

/**
 * Run the full discovery pipeline for a group.
 * Accepts an optional onTrace callback for live UI updates.
 */
export async function runDiscovery(
  group: Group,
  config: DiscoveryConfig = {},
  onTrace?: (steps: AgentStep[]) => void,
): Promise<DiscoveryOutcome> {
  const take = config.take ?? DEFAULT_TAKE;
  const insightsFn = config.insightsFn ?? (getInsights as InsightsFn);
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const trace: AgentStep[] = [];
  const warnings: string[] = [];

  function updateTrace(step: AgentStep) {
    trace.push(step);
    onTrace?.([...trace]);
  }

  const run: DiscoveryRun = {
    id: runId,
    groupId: group.id,
    status: 'planning',
    candidateRefs: [],
    traceSteps: [],
    errorDetails: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  // ── Stage A: Assess and plan ──
  updateTrace(makeStep('input_assessment', 'running', 'Assessing group inputs...'));
  const plan = buildRetrievalPlan(group);

  if (!plan.sufficientForDiscovery) {
    updateTrace(
      makeStep('input_assessment', 'failed', plan.guidance || 'Insufficient resolved interests for discovery.'),
    );
    run.status = 'failed';
    run.errorDetails = plan.guidance;
    run.completedAt = new Date().toISOString();
    run.traceSteps = [...trace];
    return {
      run,
      rankedCandidates: [],
      plan,
      memberRetrievals: [],
      adaptiveTriggered: false,
      adaptiveImprovedCoverage: null,
      consensusExplanation: 'Discovery could not proceed — insufficient resolved interests.',
      warnings,
      tasteBridge: null,
    };
  }

  if (!group.destination || !group.destination.trim()) {
    updateTrace(
      makeStep('input_assessment', 'failed', 'No destination selected. A destination is required for local discovery.'),
    );
    run.status = 'failed';
    run.errorDetails = 'A destination is required for local discovery. Go back and add a destination city.';
    run.completedAt = new Date().toISOString();
    run.traceSteps = [...trace];
    return {
      run,
      rankedCandidates: [],
      plan,
      memberRetrievals: [],
      adaptiveTriggered: false,
      adaptiveImprovedCoverage: null,
      consensusExplanation: 'Discovery could not proceed — no destination selected.',
      warnings,
      tasteBridge: null,
    };
  }

  const destination = group.destination.trim();

  updateTrace(
    makeStep(
      'input_assessment',
      'completed',
      `${group.members.length} member(s), ${plan.totalResolvedEntities} resolved entities, ${plan.totalUnresolved} unresolved. Destination: ${destination}.`,
      plan.memberPlans.filter((mp) => mp.entityIds.length > 0).map((mp) => mp.memberName),
    ),
  );

  updateTrace(
    makeStep(
      'retrieval_planning',
      'completed',
      `Target category: ${plan.targetCategory}. Planning ${plan.memberPlans.filter((mp) => mp.entityIds.length > 0).length} per-member retrieval(s).`,
    ),
  );

  // ── Stage B: Per-member retrieval ──
  run.status = 'searching';
  updateTrace(
    makeStep('related_entity_retrieval', 'running', 'Retrieving recommendations from Qloo for each member...'),
  );

  const requests: RetrievalRequest[] = plan.memberPlans
    .filter((mp) => mp.entityIds.length > 0)
    .map((mp) => ({
      memberId: mp.memberId,
      memberName: mp.memberName,
      entityIds: mp.entityIds.slice(0, MAX_ENTITIES_PER_MEMBER_FIRST_PASS),
      passNumber: 1,
    }));

  const firstPassRetrievals = await retrieveForMembers(requests, take, insightsFn, destination);

  const successCount = firstPassRetrievals.filter((r) => r.status === 'success').length;
  const failedCount = firstPassRetrievals.filter((r) => r.status === 'failed').length;

  if (failedCount > 0 && successCount === 0) {
    const firstError = firstPassRetrievals.find((r) => r.status === 'failed')?.error || 'Unknown error';
    const isLocalityError = firstError.includes('locality') || firstError.includes('location');
    const errorSummary = isLocalityError
      ? `Qloo could not resolve the destination "${destination}". Try a different city name.`
      : `All ${failedCount} member retrieval(s) failed: ${firstError}`;
    updateTrace(
      makeStep(
        'related_entity_retrieval',
        'failed',
        errorSummary,
        firstPassRetrievals.filter((r) => r.status === 'failed').map((r) => r.error || 'Unknown error'),
      ),
    );
    run.status = 'failed';
    run.errorDetails = errorSummary;
    run.completedAt = new Date().toISOString();
    run.traceSteps = [...trace];
    return {
      run,
      rankedCandidates: [],
      plan,
      memberRetrievals: firstPassRetrievals,
      adaptiveTriggered: false,
      adaptiveImprovedCoverage: null,
      consensusExplanation: isLocalityError
        ? `Destination "${destination}" could not be resolved by Qloo. No results were retrieved.`
        : 'No results — all member retrievals failed.',
      warnings,
      tasteBridge: null,
    };
  }

  if (failedCount > 0) {
    warnings.push(`${failedCount} member retrieval(s) failed — results may be incomplete.`);
  }

  updateTrace(
    makeStep(
      'related_entity_retrieval',
      'completed',
      `${successCount} successful, ${failedCount} failed, ${firstPassRetrievals.reduce((s, r) => s + r.candidateCount, 0)} total candidates.`,
      firstPassRetrievals.filter((r) => r.status === 'success').map((r) => r.memberName),
    ),
  );

  // ── Stage C: Merge and normalize ──
  run.status = 'analyzing';
  updateTrace(makeStep('candidate_normalization', 'running', 'Merging and deduplicating candidates...'));

  let merged = mergeCandidates(firstPassRetrievals);
  updateTrace(
    makeStep(
      'candidate_normalization',
      'completed',
      `${merged.size} unique candidates after deduplication.`,
      [...merged.keys()].slice(0, 10),
    ),
  );

  // ── Stage D: Rank ──
  run.status = 'ranking';
  updateTrace(makeStep('consensus_ranking', 'running', 'Calculating consensus scores...'));

  let ranked = rankCandidates(merged, firstPassRetrievals, config);

  updateTrace(
    makeStep(
      'consensus_ranking',
      'completed',
      `Ranked ${ranked.length} candidates. Top: ${ranked[0]?.name || 'N/A'} (score: ${ranked[0]?.consensusScore.toFixed(3) || 'N/A'}).`,
      ranked.slice(0, 5).map((c) => c.entityId),
    ),
  );

  // ── Stage E: Adaptive exploration ──
  let adaptiveTriggered = false;
  let adaptiveImprovedCoverage: boolean | null = null;
  let allRetrievals = firstPassRetrievals;

  const adaptive = shouldTriggerAdaptive(ranked, plan, firstPassRetrievals, config);
  if (adaptive.trigger) {
    adaptiveTriggered = true;
    updateTrace(
      makeStep('adaptive_exploration', 'running', adaptive.reason, adaptive.membersForRetry),
    );

    // Build second-pass requests with entity IDs not used in the first pass
    const firstPassIdsByMember = new Map<string, Set<string>>();
    for (const r of firstPassRetrievals) {
      if (r.passNumber === 1) {
        firstPassIdsByMember.set(r.memberId, new Set(r.entityIds));
      }
    }
    const retryRequests: RetrievalRequest[] = plan.memberPlans
      .filter((mp) => adaptive.membersForRetry.includes(mp.memberId))
      .map((mp) => {
        const usedIds = firstPassIdsByMember.get(mp.memberId) ?? new Set<string>();
        const unusedIds = mp.entityIds.filter((id) => !usedIds.has(id));
        return {
          memberId: mp.memberId,
          memberName: mp.memberName,
          entityIds: unusedIds.length > 0 ? unusedIds : mp.entityIds.slice(0, MAX_ENTITIES_PER_MEMBER_FIRST_PASS),
          passNumber: 2,
        };
      })
      .filter((req) => req.entityIds.length > 0);

    if (retryRequests.length > 0) {
      const adaptiveRetrievals = await retrieveForMembers(retryRequests, take, insightsFn, destination);
      allRetrievals = [...firstPassRetrievals, ...adaptiveRetrievals];

      // Re-merge and re-rank
      merged = mergeCandidates(allRetrievals);
      const previousCoverage = ranked.length > 0 ? ranked[0].memberCoverage : 0;
      const previousCount = ranked.length;
      ranked = rankCandidates(merged, allRetrievals, config);

      const newCoverage = ranked.length > 0 ? ranked[0].memberCoverage : 0;
      adaptiveImprovedCoverage =
        ranked.length > previousCount || newCoverage > previousCoverage;

      updateTrace(
        makeStep(
          'adaptive_exploration',
          adaptiveImprovedCoverage ? 'completed' : 'completed',
          `Adaptive pass complete. Candidates: ${previousCount} → ${ranked.length}. Top coverage: ${previousCoverage.toFixed(2)} → ${newCoverage.toFixed(2)}. ${adaptiveImprovedCoverage ? 'Improved.' : 'No improvement.'}`,
          ranked.slice(0, 5).map((c) => c.entityId),
        ),
      );
    } else {
      updateTrace(
        makeStep('adaptive_exploration', 'skipped', 'No valid retry requests could be built.'),
      );
    }
  } else {
    updateTrace(
      makeStep('adaptive_exploration', 'skipped', adaptive.reason),
    );
  }

  // ── Stage F: Taste Bridge group-level retrieval ──
  updateTrace(
    makeStep('taste_bridge', 'running', 'Querying Qloo with combined group interests...'),
  );

  let tasteBridge: TasteBridgeResult;
  try {
    tasteBridge = await retrieveTasteBridge(group, destination, insightsFn, take);
  } catch (err) {
    tasteBridge = {
      status: 'failed',
      candidates: [],
      destination,
      combinedEntityIds: [],
      explanation: 'Taste Bridge encountered an unexpected error.',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  if (tasteBridge.status === 'success') {
    updateTrace(
      makeStep(
        'taste_bridge',
        'completed',
        `Taste Bridge complete. ${tasteBridge.candidates.length} group-level candidate(s) from ${tasteBridge.combinedEntityIds.length} combined interests.`,
        tasteBridge.combinedEntityIds.slice(0, 6),
      ),
    );
  } else if (tasteBridge.status === 'skipped') {
    updateTrace(
      makeStep('taste_bridge', 'skipped', tasteBridge.explanation),
    );
  } else {
    updateTrace(
      makeStep('taste_bridge', 'failed', tasteBridge.explanation + ' ' + (tasteBridge.error || '')),
    );
    warnings.push(`Taste Bridge group-level retrieval failed: ${tasteBridge.error || 'Unknown error'}. Member-specific results are still available.`);
  }

  // ── Stage G: Finalize ──
  run.status = ranked.length > 0 ? 'completed' : 'partial';
  run.candidateRefs = ranked.map((c) => c.entityId);
  run.completedAt = new Date().toISOString();
  run.traceSteps = [...trace];

  const membersWithResults = new Set(
    allRetrievals.filter((r) => r.status === 'success').map((r) => r.memberId),
  ).size;
  const consensusExplanation = buildConsensusExplanation(ranked, membersWithResults, group.members.length, destination);
  const sharedCount = ranked.filter((c) => c.isShared).length;
  if (sharedCount === 0 && ranked.length > 0) {
    warnings.push(
      'Qloo found individual discoveries for this group, but the current results do not establish a strong shared match. Try adding more interests or adjusting the destination.',
    );
  }

  updateTrace(
    makeStep(
      'completion',
      'completed',
      `Discovery complete. ${ranked.length} ranked candidate(s) from ${membersWithResults} member(s) with results. ${warnings.length} warning(s).`,
      ranked.slice(0, 5).map((c) => c.name),
    ),
  );

  run.traceSteps = [...trace];

  return {
    run,
    rankedCandidates: ranked,
    plan,
    memberRetrievals: allRetrievals,
    adaptiveTriggered,
    adaptiveImprovedCoverage,
    consensusExplanation,
    warnings,
    tasteBridge,
  };
}

function buildConsensusExplanation(
  ranked: RankedCandidate[],
  membersWithResults: number,
  totalMembers: number,
  destination: string,
): string {
  if (ranked.length === 0) {
    return 'No candidates were retrieved. Try adding more interests with specific categories.';
  }

  const top = ranked[0];
  const coveragePct = Math.round(top.memberCoverage * 100);
  const sharedCount = ranked.filter((c) => c.isShared).length;

  let explanation =
    `Consensus scores combine member coverage (${COVERAGE_WEIGHT * 100}% weight — ` +
    `what proportion of members with results surfaced this candidate) and rank support ` +
    `(${RANK_SUPPORT_WEIGHT * 100}% weight — how highly each member's query ranked it). ` +
    `The top candidate "${top.name}" was surfaced by ${top.memberCount} of ${membersWithResults} ` +
    `member(s) with successful retrievals (${coveragePct}% coverage). ` +
    `${membersWithResults} of ${totalMembers} member(s) had successful Qloo retrievals. ` +
    `Destination: ${destination}. `;

  if (sharedCount > 0) {
    explanation += `${sharedCount} candidate(s) were shared by multiple members.`;
  } else {
    explanation += 'No candidates were shared by multiple members — these are individual discoveries, not group consensus.';
  }

  return explanation;
}
