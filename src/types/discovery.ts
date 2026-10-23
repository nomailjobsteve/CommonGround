/**
 * Discovery run and agent orchestration types.
 */

import type { RetrievedCandidate } from './cultural';
import type { QlooEntity } from './qloo';

export type StepType =
  | 'input_assessment'
  | 'retrieval_planning'
  | 'related_entity_retrieval'
  | 'candidate_normalization'
  | 'consensus_ranking'
  | 'adaptive_exploration'
  | 'taste_bridge'
  | 'completion'
  // Legacy step types retained for compatibility
  | 'entity_search'
  | 'entity_resolution'
  | 'preference_comparison'
  | 'experience_planning'
  | 'trace_generation';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface AgentStep {
  id: string;
  stepType: StepType;
  status: StepStatus;
  explanation: string;
  timestamp: string;
  evidenceRefs: string[];
}

export type DiscoveryRunStatus =
  | 'idle'
  | 'planning'
  | 'searching'
  | 'analyzing'
  | 'ranking'
  | 'completed'
  | 'partial'
  | 'failed';

export interface DiscoveryRun {
  id: string;
  groupId: string;
  status: DiscoveryRunStatus;
  candidateRefs: string[];
  traceSteps: AgentStep[];
  errorDetails: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

/** A single member's retrieval outcome from Stage B. */
export interface MemberRetrievalResult {
  memberId: string;
  memberName: string;
  status: 'success' | 'failed' | 'skipped';
  entityIds: string[];
  candidates: QlooEntity[];
  candidateCount: number;
  elapsedMs: number;
  error: string | null;
  passNumber: number;
}

/** Evidence linking a candidate to the member query that surfaced it. */
export interface CandidateEvidence {
  entityId: string;
  memberId: string;
  memberName: string;
  rankInMemberList: number;
  passNumber: number;
}

/** A merged, deduplicated candidate with consensus metrics. */
export interface RankedCandidate extends RetrievedCandidate {
  entityId: string;
  memberCoverage: number;
  memberCount: number;
  totalMembersWithResults: number;
  rankSupport: number;
  consensusScore: number;
  rank: number;
  evidence: CandidateEvidence[];
  qlooAffinity: number | null;
  qlooExplainability: unknown | null;
  isShared: boolean;
  city: string | null;
  metro: string | null;
}

/** The retrieval plan built in Stage A. */
export interface DiscoveryPlan {
  targetCategory: string;
  memberPlans: Array<{
    memberId: string;
    memberName: string;
    entityIds: string[];
    hasUnresolvedInterests: boolean;
  }>;
  totalResolvedEntities: number;
  totalUnresolved: number;
  sufficientForDiscovery: boolean;
  guidance: string | null;
}

/** The final output of a discovery run. */
export interface DiscoveryOutcome {
  run: DiscoveryRun;
  rankedCandidates: RankedCandidate[];
  plan: DiscoveryPlan;
  memberRetrievals: MemberRetrievalResult[];
  adaptiveTriggered: boolean;
  adaptiveImprovedCoverage: boolean | null;
  consensusExplanation: string;
  warnings: string[];
  tasteBridge: TasteBridgeResult | null;
}

/** Status of the Taste Bridge group-level retrieval. */
export type TasteBridgeStatus = 'success' | 'skipped' | 'failed';

/** A contributing input entity mapped back to its member(s). */
export interface TasteBridgeContribution {
  entityId: string;
  avgScore: number;
  interestNames: string[];
  memberNames: string[];
}

/** A single candidate from the group-level Taste Bridge retrieval. */
export interface TasteBridgeCandidate {
  entityId: string;
  name: string;
  description: string | null;
  image: string | null;
  category: string;
  city: string | null;
  metro: string | null;
  affinity: number | null;
  contributions: TasteBridgeContribution[];
  hasExplainability: boolean;
}

/** The result of the Taste Bridge group-level retrieval. */
export interface TasteBridgeResult {
  status: TasteBridgeStatus;
  candidates: TasteBridgeCandidate[];
  destination: string;
  combinedEntityIds: string[];
  explanation: string;
  error: string | null;
}

export interface DiscoveryResult {
  run: DiscoveryRun;
  candidates: RetrievedCandidate[];
}
