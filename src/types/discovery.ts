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
}

export interface DiscoveryResult {
  run: DiscoveryRun;
  candidates: RetrievedCandidate[];
}
