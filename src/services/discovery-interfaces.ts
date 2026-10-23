/**
 * Discovery service interfaces — contracts for capabilities that will be
 * implemented in later phases. These are NOT functional implementations.
 * They define the shapes that later phases will fill in.
 */

import type { RetrievedCandidate, CulturalInterest } from '@/types/cultural';
import type { Group } from '@/types/group';
import type { AgentStep, DiscoveryRun } from '@/types/discovery';
import type { QlooResult, QlooEntity } from '@/types/qloo';

export interface EntitySearchResult {
  query: string;
  entities: QlooEntity[];
}

export interface IEntitySearchService {
  search(query: string, types?: string[]): Promise<QlooResult<EntitySearchResult>>;
}

export interface IEntityResolutionService {
  resolve(interest: CulturalInterest): Promise<QlooResult<CulturalInterest>>;
}

export interface IRelatedEntityRetrievalService {
  retrieveRelated(
    entityIds: string[],
    targetType: string,
    take?: number,
  ): Promise<QlooResult<RetrievedCandidate[]>>;
}

export interface IPreferenceComparisonService {
  compare(group: Group): Promise<
    QlooResult<{
      sharedInterests: string[];
      divergencePoints: string[];
      overlapScore: number;
    }>
  >;
}

export interface IConsensusRankingService {
  rank(
    candidates: RetrievedCandidate[],
    group: Group,
  ): Promise<
    QlooResult<
      Array<{
        candidateId: string;
        score: number;
        scoringInputs: Record<string, number>;
        rank: number;
      }>
    >
  >;
}

export interface IExperiencePlanningService {
  plan(
    rankedCandidates: RetrievedCandidate[],
    group: Group,
  ): Promise<QlooResult<unknown>>;
}

export interface IDecisionTraceService {
  generateTrace(steps: AgentStep[]): Promise<QlooResult<AgentStep[]>>;
}

export interface IDiscoveryOrchestrator {
  run(group: Group): Promise<QlooResult<{ run: DiscoveryRun; candidates: RetrievedCandidate[] }>>;
}
