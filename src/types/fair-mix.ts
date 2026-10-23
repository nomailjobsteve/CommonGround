/**
 * Fair Mix Planner — typed models for the balanced shortlist feature.
 *
 * Fair Mix turns existing discovery results into a balanced shortlist without
 * making additional Qloo requests. It reuses RankedCandidate and
 * TasteBridgeCandidate data that already exists in a DiscoveryOutcome.
 */

import type { RankedCandidate } from './discovery';

/** Where a Fair Mix item originated in the discovery pipeline. */
export type FairMixSource = 'shared' | 'individual' | 'taste_bridge';

/** A single entry in the Fair Mix shortlist. */
export interface FairMixItem {
  /** Unique key — the Qloo entity ID or a synthetic fallback. */
  key: string;
  entityId: string;
  name: string;
  description: string | null;
  image: string | null;
  category: string;
  city: string | null;
  metro: string | null;
  source: FairMixSource;
  /**
   * Member IDs whose per-member retrieval actually surfaced this candidate.
   * Empty for Taste Bridge candidates without explainability — never fabricated.
   */
  memberIds: string[];
  memberNames: string[];
  /**
   * True when the member association comes from actual per-member retrieval
   * evidence (not Taste Bridge explainability inference).
   */
  memberAssociationVerified: boolean;
  /** Concise, evidence-based reason for selection. Labeled as Fair Mix, not Qloo. */
  selectionReason: string;
  /** Consensus score from the original ranking (null for Taste Bridge items). */
  consensusScore: number | null;
  /** Position in the shortlist (1-based). */
  position: number;
}

/** A candidate eligible for Fair Mix selection that was not chosen. */
export interface FairMixEligibleItem {
  key: string;
  entityId: string;
  name: string;
  source: FairMixSource;
  memberIds: string[];
}

/** The complete Fair Mix plan. */
export interface FairMixPlan {
  destination: string;
  items: FairMixItem[];
  /** Items the user manually removed. */
  removedKeys: string[];
  /** All candidates that were eligible for selection. */
  eligible: FairMixEligibleItem[];
  /** Members whose retrieval failed — disclosed as a partial-data limitation. */
  failedMemberNames: string[];
  /** Whether Taste Bridge results were unavailable. */
  tasteBridgeUnavailable: boolean;
  /** Human-readable summary of how the plan was built. */
  summary: string;
}

/** Input needed to build a Fair Mix plan. */
export interface FairMixInput {
  rankedCandidates: RankedCandidate[];
  tasteBridgeCandidates: import('./discovery').TasteBridgeCandidate[];
  tasteBridgeStatus: import('./discovery').TasteBridgeStatus;
  memberRetrievals: import('./discovery').MemberRetrievalResult[];
  destination: string;
  group: import('./group').Group;
}
