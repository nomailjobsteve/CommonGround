/**
 * Fair Mix Planner — regression tests.
 *
 * Tests cover:
 *  1. Mixed group with Shared, Individual, and Taste Bridge candidates
 *  2. Representation of underrepresented members
 *  3. Preference for genuine Shared candidates
 *  4. Taste Bridge candidates retain distinct source
 *  5. Duplicate candidate removal
 *  6. Deterministic selection and tie-breaking
 *  7. Fewer than five eligible candidates
 *  8. Empty results
 *  9. Partial member-retrieval failures
 * 10. Missing explainability and unknown individual contributions
 * 11. Manual removals persisting until rebalancing
 * 12. Rebalancing without additional Qloo calls
 * 13. Clipboard summary accuracy and honest source labels
 * 14. No changes to existing consensus scores or Shared counts
 *
 * All data is injected — no Qloo API calls.
 */

import { describe, it, expect } from 'vitest';
import type { Group, Member } from '@/types/group';
import type { CulturalInterest } from '@/types/cultural';
import type { RankedCandidate, MemberRetrievalResult, TasteBridgeCandidate } from '@/types/discovery';
import type { FairMixInput } from '@/types/fair-mix';
import {
  buildFairMixPlan,
  rebalanceFairMixPlan,
  removeFromFairMixPlan,
  restoreToFairMixPlan,
  generatePlanSummaryText,
  sourceLabelFor,
} from '@/services/fair-mix-planner';

// ─── Fixtures ───────────────────────────────────────────────────────

function makeInterest(id: string, input: string, resolvedEntityId: string | null): CulturalInterest {
  return {
    id,
    originalInput: input,
    resolvedEntityId,
    category: 'urn:entity:artist',
    resolutionStatus: resolvedEntityId ? 'resolved' : 'unresolved',
    displayName: input,
  };
}

function makeMember(id: string, name: string, interests: CulturalInterest[]): Member {
  return {
    id,
    displayName: name,
    culturalInterests: interests,
    exclusions: [],
    budgetPreference: null,
    accessibilityRequirements: [],
  };
}

function makeGroup(members: Member[], destination = 'New York'): Group {
  return {
    id: 'group-1',
    name: 'Test Group',
    destination,
    members,
    constraints: {
      maxTravelDistanceMiles: null,
      preferredDays: [],
      budgetLevel: null,
      groupSizeMin: null,
      groupSizeMax: null,
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function makeRankedCandidate(
  entityId: string,
  name: string,
  opts: {
    isShared?: boolean;
    memberIds?: string[];
    memberNames?: string[];
    consensusScore?: number;
    memberCoverage?: number;
    image?: string | null;
    city?: string | null;
    category?: string;
  } = {},
): RankedCandidate {
  const memberIds = opts.memberIds ?? ['m1'];
  const memberNames = opts.memberNames ?? ['Alice'];
  const evidence = memberIds.map((mid, i) => ({
    entityId,
    memberId: mid,
    memberName: memberNames[i] ?? mid,
    rankInMemberList: i,
    passNumber: 1,
  }));
  return {
    source: 'qloo_insights',
    entityId,
    category: opts.category ?? 'urn:entity:place',
    name,
    description: `Description for ${name}`,
    image: opts.image ?? null,
    metadata: {},
    retrievalMeta: {
      endpoint: '/v2/insights',
      retrievedAt: new Date().toISOString(),
      affinityScore: null,
      explainability: null,
    },
    memberCoverage: opts.memberCoverage ?? 0.5,
    memberCount: memberIds.length,
    totalMembersWithResults: 2,
    rankSupport: 0.5,
    consensusScore: opts.consensusScore ?? 0.5,
    rank: 0,
    evidence,
    qlooAffinity: null,
    qlooExplainability: null,
    isShared: opts.isShared ?? memberIds.length >= 2,
    city: opts.city ?? null,
    metro: null,
  };
}

function makeTasteBridgeCandidate(
  entityId: string,
  name: string,
  opts: { image?: string | null; city?: string | null; affinity?: number | null } = {},
): TasteBridgeCandidate {
  return {
    entityId,
    name,
    description: `TB description for ${name}`,
    image: opts.image ?? null,
    category: 'urn:entity:place',
    city: opts.city ?? null,
    metro: null,
    affinity: opts.affinity ?? null,
    contributions: [],
    hasExplainability: false,
  };
}

function makeRetrieval(memberId: string, memberName: string, status: 'success' | 'failed'): MemberRetrievalResult {
  return {
    memberId,
    memberName,
    status,
    entityIds: ['ent-1'],
    candidates: [],
    candidateCount: 0,
    elapsedMs: 100,
    error: status === 'failed' ? 'Network error' : null,
    passNumber: 1,
  };
}

function makeInput(
  ranked: RankedCandidate[],
  tb: TasteBridgeCandidate[],
  group: Group,
  retrievals?: MemberRetrievalResult[],
  tbStatus: 'success' | 'failed' | 'skipped' = 'success',
): FairMixInput {
  return {
    rankedCandidates: ranked,
    tasteBridgeCandidates: tb,
    tasteBridgeStatus: tbStatus,
    memberRetrievals: retrievals ?? group.members.map((m) => makeRetrieval(m.id, m.displayName, 'success')),
    destination: group.destination ?? '',
    group,
  };
}

// ─── Test 1: Mixed group with Shared, Individual, and Taste Bridge ───

describe('Fair Mix: mixed sources', () => {
  it('includes candidates from all three sources when available', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-shared', 'Shared Venue', {
        isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'], consensusScore: 0.8,
      }),
      makeRankedCandidate('place-alice', 'Alice Place', {
        isShared: false, memberIds: ['m1'], memberNames: ['Alice'], consensusScore: 0.4,
      }),
    ];
    const tb = [makeTasteBridgeCandidate('place-tb', 'TB Venue')];

    const plan = buildFairMixPlan(makeInput(ranked, tb, group));

    const sources = plan.items.map((i) => i.source);
    expect(sources).toContain('shared');
    expect(sources).toContain('individual');
    expect(sources).toContain('taste_bridge');
  });
});

// ─── Test 2: Underrepresented member representation ─────────────────

describe('Fair Mix: member representation', () => {
  it('includes candidates from members not yet represented', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
      makeMember('m3', 'Carol', [makeInterest('i3', 'Pop', 'ent-pop')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-shared', 'Shared Venue', {
        isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'], consensusScore: 0.9,
      }),
      makeRankedCandidate('place-carol', 'Carol Place', {
        isShared: false, memberIds: ['m3'], memberNames: ['Carol'], consensusScore: 0.3,
      }),
    ];

    const plan = buildFairMixPlan(makeInput(ranked, [], group));

    const carolItem = plan.items.find((i) => i.memberIds.includes('m3'));
    expect(carolItem).toBeDefined();
    expect(carolItem!.source).toBe('individual');
  });
});

// ─── Test 3: Preference for genuine Shared candidates ────────────────

describe('Fair Mix: shared priority', () => {
  it('selects shared candidates before individual ones', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-shared', 'Shared Venue', {
        isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'], consensusScore: 0.7,
      }),
      makeRankedCandidate('place-alice', 'Alice Only', {
        isShared: false, memberIds: ['m1'], memberNames: ['Alice'], consensusScore: 0.6,
      }),
    ];

    const plan = buildFairMixPlan(makeInput(ranked, [], group));

    expect(plan.items[0].source).toBe('shared');
    expect(plan.items[0].entityId).toBe('place-shared');
  });
});

// ─── Test 4: Taste Bridge source retained ────────────────────────────

describe('Fair Mix: Taste Bridge source', () => {
  it('labels Taste Bridge candidates with taste_bridge source', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'] }),
    ];
    const tb = [makeTasteBridgeCandidate('place-tb', 'TB Venue')];

    const plan = buildFairMixPlan(makeInput(ranked, tb, group));

    const tbItem = plan.items.find((i) => i.source === 'taste_bridge');
    expect(tbItem).toBeDefined();
    expect(tbItem!.entityId).toBe('place-tb');
    expect(tbItem!.memberAssociationVerified).toBe(false);
  });
});

// ─── Test 5: Duplicate removal ───────────────────────────────────────

describe('Fair Mix: duplicate removal', () => {
  it('does not include the same entity ID twice', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('dup-place', 'Dup Place', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'] }),
    ];
    const tb = [makeTasteBridgeCandidate('dup-place', 'Dup Place TB')];

    const plan = buildFairMixPlan(makeInput(ranked, tb, group));

    const ids = plan.items.map((i) => i.entityId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Test 6: Deterministic selection ─────────────────────────────────

describe('Fair Mix: deterministic', () => {
  it('produces the same output for the same input', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'], consensusScore: 0.7 }),
      makeRankedCandidate('place-b', 'Place B', { isShared: false, memberIds: ['m1'], memberNames: ['Alice'], consensusScore: 0.5 }),
      makeRankedCandidate('place-c', 'Place C', { isShared: false, memberIds: ['m2'], memberNames: ['Bob'], consensusScore: 0.4 }),
    ];

    const input = makeInput(ranked, [], group);
    const plan1 = buildFairMixPlan(input);
    const plan2 = buildFairMixPlan(input);

    expect(plan1.items.map((i) => i.entityId)).toEqual(plan2.items.map((i) => i.entityId));
    expect(plan1.items.map((i) => i.position)).toEqual(plan2.items.map((i) => i.position));
  });

  it('uses name as a deterministic tie-breaker for equal scores', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-z', 'Zebra', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'], consensusScore: 0.5 }),
      makeRankedCandidate('place-a', 'Alpha', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'], consensusScore: 0.5 }),
    ];

    const plan = buildFairMixPlan(makeInput(ranked, [], group));
    expect(plan.items[0].name).toBe('Alpha');
    expect(plan.items[1].name).toBe('Zebra');
  });
});

// ─── Test 7: Fewer than five eligible ────────────────────────────────

describe('Fair Mix: fewer than five', () => {
  it('returns a shorter plan when fewer candidates are available', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'] }),
    ];

    const plan = buildFairMixPlan(makeInput(ranked, [], group));
    expect(plan.items.length).toBe(1);
  });
});

// ─── Test 8: Empty results ───────────────────────────────────────────

describe('Fair Mix: empty results', () => {
  it('returns an empty plan with no items', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const plan = buildFairMixPlan(makeInput([], [], group));
    expect(plan.items).toHaveLength(0);
    expect(plan.eligible).toHaveLength(0);
  });
});

// ─── Test 9: Partial member-retrieval failures ───────────────────────

describe('Fair Mix: partial failures', () => {
  it('discloses failed members and continues with successful results', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: false, memberIds: ['m1'], memberNames: ['Alice'] }),
    ];
    const retrievals = [
      makeRetrieval('m1', 'Alice', 'success'),
      makeRetrieval('m2', 'Bob', 'failed'),
    ];

    const plan = buildFairMixPlan(makeInput(ranked, [], group, retrievals));
    expect(plan.failedMemberNames).toContain('Bob');
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.summary).toContain('Bob');
  });
});

// ─── Test 10: Missing explainability ─────────────────────────────────

describe('Fair Mix: missing explainability', () => {
  it('marks Taste Bridge items as unverified when no explainability', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'] }),
    ];
    const tb = [makeTasteBridgeCandidate('place-tb', 'TB Venue')];

    const plan = buildFairMixPlan(makeInput(ranked, tb, group));

    const tbItem = plan.items.find((i) => i.source === 'taste_bridge');
    expect(tbItem).toBeDefined();
    expect(tbItem!.memberAssociationVerified).toBe(false);
    expect(tbItem!.memberIds).toHaveLength(0);
  });

  it('does not claim Taste Bridge items are liked by specific members', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const tb = [makeTasteBridgeCandidate('place-tb', 'TB Venue')];
    const plan = buildFairMixPlan(makeInput([], tb, group));

    const tbItem = plan.items.find((i) => i.source === 'taste_bridge');
    expect(tbItem).toBeDefined();
    expect(tbItem!.memberNames).toHaveLength(0);
    expect(tbItem!.selectionReason).not.toContain('Alice');
    expect(tbItem!.selectionReason).not.toContain('Bob');
  });
});

// ─── Test 11: Manual removals persist ────────────────────────────────

describe('Fair Mix: manual removal', () => {
  it('removes an item and persists until rebalancing', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'] }),
      makeRankedCandidate('place-b', 'Place B', { isShared: false, memberIds: ['m1'], memberNames: ['Alice'] }),
    ];

    const plan = buildFairMixPlan(makeInput(ranked, [], group));
    expect(plan.items.length).toBe(2);

    const removed = removeFromFairMixPlan(plan, 'place-a');
    expect(removed.items.length).toBe(1);
    expect(removed.items[0].entityId).toBe('place-b');
    expect(removed.removedKeys).toContain('place-a');

    // Re-number positions
    expect(removed.items[0].position).toBe(1);
  });

  it('does not re-select a replacement after removal', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'] }),
      makeRankedCandidate('place-b', 'Place B', { isShared: false, memberIds: ['m1'], memberNames: ['Alice'] }),
      makeRankedCandidate('place-c', 'Place C', { isShared: false, memberIds: ['m2'], memberNames: ['Bob'] }),
    ];

    const plan = buildFairMixPlan(makeInput(ranked, [], group));
    const initialCount = plan.items.length;

    const removed = removeFromFairMixPlan(plan, plan.items[0].key);
    expect(removed.items.length).toBe(initialCount - 1);
  });
});

// ─── Test 12: Rebalancing without Qloo calls ─────────────────────────

describe('Fair Mix: rebalancing', () => {
  it('regenerates the default plan from the same input', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'] }),
      makeRankedCandidate('place-b', 'Place B', { isShared: false, memberIds: ['m1'], memberNames: ['Alice'] }),
    ];

    const input = makeInput(ranked, [], group);
    const original = buildFairMixPlan(input);

    const removed = removeFromFairMixPlan(original, 'place-a');
    expect(removed.items.length).toBe(1);

    const rebalanced = rebalanceFairMixPlan(input);
    expect(rebalanced.items.length).toBe(2);
    expect(rebalanced.removedKeys).toHaveLength(0);
    expect(rebalanced.items.map((i) => i.entityId)).toEqual(original.items.map((i) => i.entityId));
  });
});

// ─── Test 13: Clipboard summary ──────────────────────────────────────

describe('Fair Mix: clipboard summary', () => {
  it('generates a summary with destination, names, sources, and reasons', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ], 'San Francisco');

    const ranked = [
      makeRankedCandidate('place-a', 'Shared Venue', {
        isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'], city: 'San Francisco',
      }),
    ];
    const tb = [makeTasteBridgeCandidate('place-tb', 'TB Venue')];

    const plan = buildFairMixPlan(makeInput(ranked, tb, group));
    const text = generatePlanSummaryText(plan);

    expect(text).toContain('CommonGround');
    expect(text).toContain('San Francisco');
    expect(text).toContain('Shared Venue');
    expect(text).toContain('TB Venue');
    expect(text).toContain('Shared (multiple members)');
    expect(text).toContain('Taste Bridge (group profile)');
    expect(text).toContain('not unanimous group endorsements');
  });

  it('uses honest source labels', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-ind', 'Individual Place', { isShared: false, memberIds: ['m1'], memberNames: ['Alice'] }),
    ];
    const plan = buildFairMixPlan(makeInput(ranked, [], group));
    const text = generatePlanSummaryText(plan);

    expect(text).toContain('Individual (single member)');
  });

  it('includes partial-data notes when members failed', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [makeRankedCandidate('place-a', 'Place A', { isShared: false, memberIds: ['m1'], memberNames: ['Alice'] })];
    const retrievals = [
      makeRetrieval('m1', 'Alice', 'success'),
      makeRetrieval('m2', 'Bob', 'failed'),
    ];

    const plan = buildFairMixPlan(makeInput(ranked, [], group, retrievals));
    const text = generatePlanSummaryText(plan);

    expect(text).toContain('partial data');
    expect(text).toContain('Bob');
  });
});

// ─── Test 14: No changes to consensus scores ─────────────────────────

describe('Fair Mix: preserves consensus integrity', () => {
  it('does not modify original ranked candidates', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'], consensusScore: 0.85 }),
    ];

    const input = makeInput(ranked, [], group);
    buildFairMixPlan(input);

    // Original array is unchanged
    expect(input.rankedCandidates[0].consensusScore).toBe(0.85);
    expect(input.rankedCandidates[0].isShared).toBe(true);
  });

  it('stores consensus score as read-only reference in Fair Mix items', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'], consensusScore: 0.72 }),
    ];

    const plan = buildFairMixPlan(makeInput(ranked, [], group));
    expect(plan.items[0].consensusScore).toBe(0.72);
  });
});

// ─── Test 15: Restore removed item ───────────────────────────────────

describe('Fair Mix: restore', () => {
  it('restores a previously removed item at the end of the list', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'] }),
      makeRankedCandidate('place-b', 'Place B', { isShared: false, memberIds: ['m1'], memberNames: ['Alice'] }),
    ];

    const input = makeInput(ranked, [], group);
    const plan = buildFairMixPlan(input);
    const removed = removeFromFairMixPlan(plan, 'place-a');
    expect(removed.items.length).toBe(1);

    const restored = restoreToFairMixPlan(removed, input, 'place-a');
    expect(restored.items.length).toBe(2);
    expect(restored.items[1].entityId).toBe('place-a');
    expect(restored.removedKeys).not.toContain('place-a');
  });
});

// ─── Test 16: Max plan size ──────────────────────────────────────────

describe('Fair Mix: max size', () => {
  it('caps the shortlist at 5 items', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked: RankedCandidate[] = [];
    for (let i = 0; i < 8; i++) {
      ranked.push(makeRankedCandidate(`place-${i}`, `Place ${i}`, {
        isShared: i < 2, memberIds: i < 2 ? ['m1', 'm2'] : ['m1'],
        memberNames: i < 2 ? ['Alice', 'Bob'] : ['Alice'],
        consensusScore: 0.8 - i * 0.05,
      }));
    }

    const plan = buildFairMixPlan(makeInput(ranked, [], group));
    expect(plan.items.length).toBeLessThanOrEqual(5);
  });
});

// ─── Test 17: Taste Bridge unavailable ───────────────────────────────

describe('Fair Mix: Taste Bridge unavailable', () => {
  it('builds a plan from remaining results when Taste Bridge fails', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'ent-jazz')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'ent-rock')]),
    ]);

    const ranked = [
      makeRankedCandidate('place-a', 'Place A', { isShared: true, memberIds: ['m1', 'm2'], memberNames: ['Alice', 'Bob'] }),
    ];

    const plan = buildFairMixPlan(makeInput(ranked, [], group, undefined, 'failed'));
    expect(plan.tasteBridgeUnavailable).toBe(true);
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.summary).toContain('Taste Bridge results were unavailable');
  });
});

// ─── Test 18: Source labels ──────────────────────────────────────────

describe('Fair Mix: source labels', () => {
  it('returns correct labels for each source type', () => {
    expect(sourceLabelFor('shared')).toBe('Shared (multiple members)');
    expect(sourceLabelFor('individual')).toBe('Individual (single member)');
    expect(sourceLabelFor('taste_bridge')).toBe('Taste Bridge (group profile)');
  });
});
