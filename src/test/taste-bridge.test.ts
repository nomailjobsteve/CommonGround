/**
 * Taste Bridge — group-level discovery regression tests.
 *
 * Tests cover:
 * 1. Group-level request uses the selected destination
 * 2. Combined request contains only resolved Qloo IDs
 * 3. Combined inputs are deduplicated and balanced across members
 * 4. The twelve-ID maximum is respected
 * 5. Groups with insufficient resolved member profiles do not make the request
 * 6. Group-level candidates are kept separate from ordinary consensus candidates
 * 7. Group-level candidates never inflate Shared counts or consensus coverage
 * 8. Real explainability inputs map correctly to member profiles
 * 9. Missing explainability never leads to invented evidence
 * 10. Empty results and Qloo errors leave successful member-specific results available
 * 11. Images use the existing safe image component and fallback
 * 12. Retry behavior does not create duplicate calls or candidates
 *
 * All Qloo API responses are mocked via dependency injection. No live API calls.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Group, Member } from '@/types/group';
import type { CulturalInterest } from '@/types/cultural';
import type { QlooEntity, QlooResult } from '@/types/qloo';
import type { InsightsFn } from '@/services/discovery-agent';
import {
  buildGroupInterestSet,
  retrieveTasteBridge,
  runDiscovery,
} from '@/services/discovery-agent';

// ─── Fixtures ───────────────────────────────────────────────────────

function makeInterest(
  id: string,
  input: string,
  resolvedEntityId: string | null,
  category: string | null = 'urn:entity:artist',
): CulturalInterest {
  return {
    id,
    originalInput: input,
    resolvedEntityId,
    category: category as CulturalInterest['category'],
    resolutionStatus: resolvedEntityId ? 'resolved' : 'unresolved',
    displayName: input,
  };
}

function makeMember(
  id: string,
  name: string,
  interests: CulturalInterest[],
): Member {
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

function makeQlooEntity(entityId: string, name: string, affinity?: number): QlooEntity {
  return {
    entity_id: entityId,
    name,
    type: 'urn:entity',
    subtype: 'urn:entity:place',
    properties: { short_description: `Description for ${name}` },
    affinity,
  };
}

/** Mock insights function that captures call params and returns given entities. */
function mockInsightsFn(
  entities: QlooEntity[],
  query?: unknown,
): InsightsFn & { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  const fn = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(params);
    return {
      success: true,
      data: {
        results: entities,
        meta: { endpoint: '/v2/insights', statusCode: 200, retrievedAt: new Date().toISOString(), retried: false },
        query,
      },
    } as unknown as { success: true; data: { results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string }; query?: unknown } };
  }) as unknown as InsightsFn & { calls: Array<Record<string, unknown>> };
  fn.calls = calls;
  return fn;
}

// ─── Test 1: Group-level request uses the selected destination ───────

describe('Taste Bridge: destination handling', () => {
  it('passes the group destination to the Qloo request', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ], 'San Francisco');

    const fn = mockInsightsFn([makeQlooEntity('place-1', 'Bay Area Venue')]);
    await retrieveTasteBridge(group, 'San Francisco', fn);

    const tbCall = fn.calls.find(
      (c) => (c.signalInterestsEntities as string[])?.length > 1,
    );
    expect(tbCall).toBeDefined();
    expect(tbCall!.filterLocationQuery).toBe('San Francisco');
  });
});

// ─── Test 2: Combined request contains only resolved Qloo IDs ────────

describe('Taste Bridge: resolved IDs only', () => {
  it('excludes unresolved interests from the combined set', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [
        makeInterest('i1', 'Jazz', 'qloo-jazz-1'),
        makeInterest('i2', 'Unknown Artist', null),
      ]),
      makeMember('m2', 'Bob', [
        makeInterest('i3', 'Rock', 'qloo-rock-1'),
      ]),
    ]);

    const { entityIds } = buildGroupInterestSet(group);
    expect(entityIds).toContain('qloo-jazz-1');
    expect(entityIds).toContain('qloo-rock-1');
    expect(entityIds).not.toContain('' as unknown as string);
    expect(entityIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  });
});

// ─── Test 3: Deduplicated and balanced across members ───────────────

describe('Taste Bridge: dedup and balance', () => {
  it('deduplicates shared entity IDs across members', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [
        makeInterest('i1', 'Jazz', 'shared-entity-1'),
        makeInterest('i2', 'Blues', 'shared-entity-1'),
      ]),
      makeMember('m2', 'Bob', [
        makeInterest('i3', 'Jazz', 'shared-entity-1'),
      ]),
    ]);

    const { entityMap, entityIds } = buildGroupInterestSet(group);
    const occurrences = entityIds.filter((id) => id === 'shared-entity-1');
    expect(occurrences).toHaveLength(1);
    expect(entityMap.get('shared-entity-1')!.memberNames).toContain('Alice');
    expect(entityMap.get('shared-entity-1')!.memberNames).toContain('Bob');
  });

  it('preserves member associations for shared entities', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'shared-ent')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'shared-ent')]),
    ]);

    const { entityMap } = buildGroupInterestSet(group);
    const info = entityMap.get('shared-ent')!;
    expect(info.memberNames).toEqual(['Alice', 'Bob']);
    expect(info.interestNames).toEqual(['Jazz', 'Rock']);
  });

  it('selects at most 3 per member (balanced selection)', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [
        makeInterest('i1', 'A', 'ent-a'),
        makeInterest('i2', 'B', 'ent-b'),
        makeInterest('i3', 'C', 'ent-c'),
        makeInterest('i4', 'D', 'ent-d'),
        makeInterest('i5', 'E', 'ent-e'),
      ]),
      makeMember('m2', 'Bob', [
        makeInterest('i6', 'F', 'ent-f'),
      ]),
    ]);

    const { entityMap } = buildGroupInterestSet(group);
    const aliceEntities = [...entityMap.values()].filter((v) =>
      v.memberNames.includes('Alice'),
    );
    expect(aliceEntities.length).toBeLessThanOrEqual(3);
  });
});

// ─── Test 4: Twelve-ID maximum ──────────────────────────────────────

describe('Taste Bridge: 12-ID maximum', () => {
  it('caps combined entity IDs at 12', () => {
    const interests: CulturalInterest[] = [];
    for (let i = 0; i < 10; i++) {
      interests.push(makeInterest(`i-${i}`, `Interest ${i}`, `ent-${i}`));
    }
    const group = makeGroup([
      makeMember('m1', 'Alice', interests.slice(0, 5)),
      makeMember('m2', 'Bob', interests.slice(5)),
      makeMember('m3', 'Carol', [
        makeInterest('c1', 'C1', 'ent-c1'),
        makeInterest('c2', 'C2', 'ent-c2'),
        makeInterest('c3', 'C3', 'ent-c3'),
        makeInterest('c4', 'C4', 'ent-c4'),
        makeInterest('c5', 'C5', 'ent-c5'),
      ]),
    ]);

    const { entityIds } = buildGroupInterestSet(group);
    expect(entityIds.length).toBeLessThanOrEqual(12);
  });
});

// ─── Test 5: Insufficient members ───────────────────────────────────

describe('Taste Bridge: insufficient members', () => {
  it('skips when only one member has resolved interests', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', null)]),
    ]);

    const fn = mockInsightsFn([]);
    const result = await retrieveTasteBridge(group, 'New York', fn);

    expect(result.status).toBe('skipped');
    expect(result.candidates).toHaveLength(0);
    expect(fn.calls.length).toBe(0);
  });

  it('skips when no members have resolved interests', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', null)]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', null)]),
    ]);

    const fn = mockInsightsFn([]);
    const result = await retrieveTasteBridge(group, 'New York', fn);

    expect(result.status).toBe('skipped');
    expect(fn.calls.length).toBe(0);
  });
});

// ─── Test 6: Separate from consensus candidates ─────────────────────

describe('Taste Bridge: separation from consensus', () => {
  it('returns tasteBridge as a separate field in DiscoveryOutcome', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const memberEntitiesA = [makeQlooEntity('place-a', 'Place A', 0.9)];
    const memberEntitiesB = [makeQlooEntity('place-z', 'Place Z', 0.8)];
    const tbEntities = [makeQlooEntity('place-b', 'Place B', 0.8)];

    const responses: QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>[] = [
      { success: true, data: { results: memberEntitiesA, meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
      { success: true, data: { results: memberEntitiesB, meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
      { success: true, data: { results: tbEntities, meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
    ];
    const fn = mockSequentialInsightsFn(responses);

    const outcome = await runDiscovery(group, { insightsFn: fn });
    expect(outcome.tasteBridge).not.toBeNull();
    expect(outcome.tasteBridge!.status).toBe('success');
    expect(outcome.tasteBridge!.candidates[0].entityId).toBe('place-b');
    expect(outcome.rankedCandidates[0].entityId).toBe('place-a');
  });
});

// ─── Test 7: Never inflate Shared counts ────────────────────────────

describe('Taste Bridge: no inflation of Shared counts', () => {
  it('does not add Taste Bridge candidates to rankedCandidates', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const memberEntitiesA = [makeQlooEntity('place-a', 'Place A')];
    const memberEntitiesB = [makeQlooEntity('place-d', 'Place D')];
    const tbEntities = [makeQlooEntity('place-b', 'Place B'), makeQlooEntity('place-c', 'Place C')];

    const fn = mockSequentialInsightsFn([
      { success: true, data: { results: memberEntitiesA, meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
      { success: true, data: { results: memberEntitiesB, meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
      { success: true, data: { results: tbEntities, meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
    ]);

    const outcome = await runDiscovery(group, { insightsFn: fn });
    const sharedCount = outcome.rankedCandidates.filter((c) => c.isShared).length;
    const rankedIds = outcome.rankedCandidates.map((c) => c.entityId);

    expect(rankedIds).not.toContain('place-b');
    expect(rankedIds).not.toContain('place-c');
    expect(outcome.tasteBridge!.candidates.length).toBe(2);
    expect(sharedCount).toBe(0);
  });
});

// ─── Test 8: Explainability mapping ─────────────────────────────────

describe('Taste Bridge: explainability', () => {
  it('maps contributing input entities to member profiles', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const tbEntities = [makeQlooEntity('place-x', 'Bridge Venue', 0.85)];
    const queryExplainability = {
      explainability: {
        'signal.interests.entities': {
          effect_on_all_recs: [
            { entity_id: 'qloo-jazz-1', avg_score: 0.9 },
            { entity_id: 'qloo-rock-1', avg_score: 0.7 },
          ],
        },
      },
    };

    const fn = mockInsightsFn(tbEntities, queryExplainability);
    const result = await retrieveTasteBridge(group, 'New York', fn);

    expect(result.status).toBe('success');
    const candidate = result.candidates[0];
    expect(candidate.hasExplainability).toBe(true);
    expect(candidate.contributions).toHaveLength(2);

    const jazzContrib = candidate.contributions.find((c) => c.entityId === 'qloo-jazz-1');
    expect(jazzContrib).toBeDefined();
    expect(jazzContrib!.avgScore).toBe(0.9);
    expect(jazzContrib!.memberNames).toContain('Alice');
    expect(jazzContrib!.interestNames).toContain('Jazz');

    const rockContrib = candidate.contributions.find((c) => c.entityId === 'qloo-rock-1');
    expect(rockContrib).toBeDefined();
    expect(rockContrib!.memberNames).toContain('Bob');
    expect(rockContrib!.interestNames).toContain('Rock');
  });
});

// ─── Test 9: Missing explainability ─────────────────────────────────

describe('Taste Bridge: missing explainability', () => {
  it('does not invent evidence when explainability is absent', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const tbEntities = [makeQlooEntity('place-x', 'Bridge Venue')];
    const fn = mockInsightsFn(tbEntities, undefined);
    const result = await retrieveTasteBridge(group, 'New York', fn);

    expect(result.status).toBe('success');
    expect(result.candidates[0].hasExplainability).toBe(false);
    expect(result.candidates[0].contributions).toHaveLength(0);
  });

  it('does not invent evidence when explainability has no signal key', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const tbEntities = [makeQlooEntity('place-x', 'Bridge Venue')];
    const fn = mockInsightsFn(tbEntities, { something_else: true });
    const result = await retrieveTasteBridge(group, 'New York', fn);

    expect(result.candidates[0].hasExplainability).toBe(false);
    expect(result.candidates[0].contributions).toHaveLength(0);
  });
});

// ─── Test 10: Empty results and errors ──────────────────────────────

describe('Taste Bridge: failure isolation', () => {
  it('member-specific results remain available when Taste Bridge fails', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const memberEntitiesA = [makeQlooEntity('place-a', 'Place A')];
    const memberEntitiesB = [makeQlooEntity('place-d', 'Place D')];
    const fn = mockSequentialInsightsFn([
      { success: true, data: { results: memberEntitiesA, meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
      { success: true, data: { results: memberEntitiesB, meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
      { success: false, error: { kind: 'server_error', message: 'Qloo error', statusCode: 500 } },
    ]);

    const outcome = await runDiscovery(group, { insightsFn: fn });
    expect(outcome.rankedCandidates.length).toBeGreaterThan(0);
    expect(outcome.tasteBridge).not.toBeNull();
    expect(outcome.tasteBridge!.status).toBe('failed');
    expect(outcome.tasteBridge!.candidates).toHaveLength(0);
  });

  it('empty Taste Bridge results do not affect member results', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const memberEntitiesA = [makeQlooEntity('place-a', 'Place A')];
    const memberEntitiesB = [makeQlooEntity('place-d', 'Place D')];
    const fn = mockSequentialInsightsFn([
      { success: true, data: { results: memberEntitiesA, meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
      { success: true, data: { results: memberEntitiesB, meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
      { success: true, data: { results: [], meta: { endpoint: '/v2/insights', retrievedAt: '' } } },
    ]);

    const outcome = await runDiscovery(group, { insightsFn: fn });
    expect(outcome.rankedCandidates.length).toBeGreaterThan(0);
    expect(outcome.tasteBridge!.status).toBe('success');
    expect(outcome.tasteBridge!.candidates).toHaveLength(0);
  });
});

// ─── Test 11: Image handling ────────────────────────────────────────

describe('Taste Bridge: image handling', () => {
  it('extracts image URL from properties.images[0].url', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const entity: QlooEntity = {
      entity_id: 'img-place',
      name: 'Image Place',
      type: 'urn:entity',
      subtype: 'urn:entity:place',
      properties: {
        images: [{ url: 'https://example.com/photo.jpg' }],
      },
    };

    const fn = mockInsightsFn([entity]);
    const result = await retrieveTasteBridge(group, 'New York', fn);

    expect(result.candidates[0].image).toBe('https://example.com/photo.jpg');
  });

  it('falls back to properties.image.url', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const entity: QlooEntity = {
      entity_id: 'img-place-2',
      name: 'Image Place 2',
      type: 'urn:entity',
      subtype: 'urn:entity:place',
      properties: {
        image: { url: 'https://example.com/photo2.jpg' },
      },
    };

    const fn = mockInsightsFn([entity]);
    const result = await retrieveTasteBridge(group, 'New York', fn);

    expect(result.candidates[0].image).toBe('https://example.com/photo2.jpg');
  });

  it('returns null when no image fields exist', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const entity = makeQlooEntity('no-img-place', 'No Image Place');
    const fn = mockInsightsFn([entity]);
    const result = await retrieveTasteBridge(group, 'New York', fn);

    expect(result.candidates[0].image).toBeNull();
  });
});

// ─── Test 12: Retry does not create duplicates ───────────────────────

describe('Taste Bridge: retry behavior', () => {
  it('a single retry call produces a single result set without duplicates', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const entities = [
      makeQlooEntity('tb-1', 'Bridge Place 1'),
      makeQlooEntity('tb-2', 'Bridge Place 2'),
    ];

    const fn = mockInsightsFn(entities);
    const result = await retrieveTasteBridge(group, 'New York', fn);

    expect(fn.calls.length).toBe(1);
    expect(result.candidates).toHaveLength(2);
    const ids = result.candidates.map((c) => c.entityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('deduplicates repeated entities in the Qloo response', async () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Jazz', 'qloo-jazz-1')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Rock', 'qloo-rock-1')]),
    ]);

    const entities = [
      makeQlooEntity('dup-1', 'Duplicate Place'),
      makeQlooEntity('dup-1', 'Duplicate Place'),
      makeQlooEntity('dup-2', 'Other Place'),
    ];

    const fn = mockInsightsFn(entities);
    const result = await retrieveTasteBridge(group, 'New York', fn);

    expect(result.candidates).toHaveLength(2);
    const ids = result.candidates.map((c) => c.entityId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────

function mockSequentialInsightsFn(
  responses: QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>[],
): InsightsFn {
  let callIdx = 0;
  return vi.fn(async () => {
    const result = responses[callIdx] ?? responses[responses.length - 1];
    callIdx++;
    return result;
  }) as unknown as InsightsFn;
}
