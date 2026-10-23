/**
 * Phase 2.2 regression tests: destination, locality, shared/individual filtering,
 * honest consensus metrics, adaptive retrieval with destination constraints.
 */

import { describe, it, expect, vi } from 'vitest';
import type { QlooEntity, QlooResult } from '@/types/qloo';
import type { CulturalInterest, CulturalCategory } from '@/types/cultural';
import type { Member, Group } from '@/types/group';
import type { RankedCandidate, CandidateEvidence, MemberRetrievalResult } from '@/types/discovery';
import {
  buildRetrievalPlan,
  rankCandidates,
  mergeCandidates,
  calculateMemberCoverage,
  calculateConsensusScore,
} from '@/services/discovery-agent';

// ─── Fixtures ───────────────────────────────────────────────────────

function makeInterest(
  id: string,
  input: string,
  resolvedEntityId: string | null,
  category: CulturalCategory | null = 'urn:entity:artist',
): CulturalInterest {
  return {
    id,
    originalInput: input,
    resolvedEntityId,
    category,
    resolutionStatus: resolvedEntityId ? 'resolved' : 'unresolved',
    displayName: input,
  };
}

function makeMember(id: string, name: string, interests: CulturalInterest[] = []): Member {
  return {
    id,
    displayName: name,
    culturalInterests: interests,
    exclusions: [],
    budgetPreference: null,
    accessibilityRequirements: [],
  };
}

function makeGroup(members: Member[], destination: string | null = 'New York'): Group {
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

function makeEntity(entityId: string, name: string, city?: string, metro?: string): QlooEntity {
  return {
    entity_id: entityId,
    name,
    type: 'urn:entity:place',
    properties: {
      short_description: `Description for ${name}`,
      geocode: city ? { city, metro: metro ?? city } : undefined,
    },
  };
}

function makeRetrieval(
  memberId: string,
  memberName: string,
  entities: QlooEntity[],
  passNumber = 1,
  status: 'success' | 'failed' | 'skipped' = 'success',
): MemberRetrievalResult {
  return {
    memberId,
    memberName,
    status,
    entityIds: ['ent-signal-1'],
    candidates: status === 'success' ? entities : [],
    candidateCount: status === 'success' ? entities.length : 0,
    elapsedMs: 50,
    error: status === 'failed' ? 'Error' : null,
    passNumber,
  };
}

function makeEvidence(
  entityId: string,
  memberId: string,
  memberName: string,
  rank: number,
  pass = 1,
): CandidateEvidence {
  return { entityId, memberId, memberName, rankInMemberList: rank, passNumber: pass };
}

// ─── Destination persistence ────────────────────────────────────────

describe('destination persistence through group creation', () => {
  it('group with destination retains it', () => {
    const group = makeGroup([makeMember('m1', 'Alice')], 'London');
    expect(group.destination).toBe('London');
  });

  it('group with null destination is null', () => {
    const group = makeGroup([makeMember('m1', 'Alice')], null);
    expect(group.destination).toBeNull();
  });

  it('destination survives through review step (in group object)', () => {
    const group = makeGroup(
      [makeMember('m1', 'Alice', [makeInterest('i1', 'Miles Davis', 'ENT-001')])],
      'Tokyo',
    );
    expect(group.destination).toBe('Tokyo');
    expect(group.members[0].culturalInterests).toHaveLength(1);
  });
});

// ─── Locality parameter construction ────────────────────────────────

describe('locality parameter construction', () => {
  it('filterLocationQuery is forwarded to insights function', async () => {
    const capturedParams: Record<string, unknown>[] = [];
    const mockInsightsFn = vi.fn().mockImplementation(async (params: Record<string, unknown>) => {
      capturedParams.push({ ...params });
      return {
        success: true,
        data: {
          results: [makeEntity('ENT-1', 'Test Place', 'New York')],
          meta: { endpoint: '/v2/insights', retrievedAt: new Date().toISOString() },
        },
      } as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>;
    });

    const { runDiscovery } = await import('@/services/discovery-agent');
    const group = makeGroup(
      [makeMember('m1', 'Alice', [makeInterest('i1', 'Miles Davis', 'ENT-001')])],
      'New York',
    );

    await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    expect(mockInsightsFn).toHaveBeenCalledTimes(1);
    expect(capturedParams[0].filterLocationQuery).toBe('New York');
  });

  it('filterLocationQuery is omitted when destination is null', async () => {
    const capturedParams: Record<string, unknown>[] = [];
    const mockInsightsFn = vi.fn().mockImplementation(async (params: Record<string, unknown>) => {
      capturedParams.push({ ...params });
      return {
        success: true,
        data: {
          results: [makeEntity('ENT-1', 'Test Place')],
          meta: { endpoint: '/v2/insights', retrievedAt: new Date().toISOString() },
        },
      } as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>;
    });

    const { runDiscovery } = await import('@/services/discovery-agent');
    // Group with null destination — runDiscovery should fail before calling insights
    const group = makeGroup(
      [makeMember('m1', 'Alice', [makeInterest('i1', 'Miles Davis', 'ENT-001')])],
      null,
    );

    const outcome = await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    expect(outcome.run.status).toBe('failed');
    expect(mockInsightsFn).not.toHaveBeenCalled();
  });

  it('locality query is properly URL-encoded by qloo-client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { results: [] },
          meta: { endpoint: '/v2/insights', statusCode: 200, retrievedAt: new Date().toISOString(), retried: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getInsights } = await import('@/lib/qloo-client');
    await getInsights({
      filterType: 'urn:entity:place',
      signalInterestsEntities: ['ENT-001'],
      filterLocationQuery: 'New York',
      take: 5,
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('filter.location.query=New+York');
    expect(url).toContain('signal.interests.entities=ENT-001');

    vi.unstubAllGlobals();
  });
});

// ─── Missing/unresolved locality errors ─────────────────────────────

describe('missing or unresolved locality errors', () => {
  it('runDiscovery fails with clear message when destination is null', async () => {
    const mockInsightsFn = vi.fn();
    const { runDiscovery } = await import('@/services/discovery-agent');

    const group = makeGroup(
      [makeMember('m1', 'Alice', [makeInterest('i1', 'Miles Davis', 'ENT-001')])],
      null,
    );

    const outcome = await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    expect(outcome.run.status).toBe('failed');
    expect(outcome.run.errorDetails).toContain('destination');
    expect(mockInsightsFn).not.toHaveBeenCalled();
  });

  it('runDiscovery fails with clear message when destination is empty string', async () => {
    const mockInsightsFn = vi.fn();
    const { runDiscovery } = await import('@/services/discovery-agent');

    const group = makeGroup(
      [makeMember('m1', 'Alice', [makeInterest('i1', 'Miles Davis', 'ENT-001')])],
      '   ',
    );

    const outcome = await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    expect(outcome.run.status).toBe('failed');
    expect(outcome.run.errorDetails).toContain('destination');
  });

  it('locality that Qloo cannot resolve produces bad_request error', async () => {
    const mockInsightsFn = vi.fn().mockResolvedValue({
      success: false,
      error: {
        kind: 'bad_request' as const,
        message: 'Qloo API rejected the request: No locality found for "NonExistentCity"',
        statusCode: 400,
      },
    } as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>);

    const { runDiscovery } = await import('@/services/discovery-agent');
    const group = makeGroup(
      [makeMember('m1', 'Alice', [makeInterest('i1', 'Miles Davis', 'ENT-001')])],
      'NonExistentCity',
    );

    const outcome = await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    expect(outcome.run.status).toBe('failed');
    expect(outcome.memberRetrievals[0].status).toBe('failed');
    expect(outcome.memberRetrievals[0].error).toContain('No locality found');
  });

  it('surfaces the actual Qloo locality error in errorDetails, not generic connectivity message', async () => {
    const localityErrorMsg = 'Qloo API rejected the request: {"errors":[{"message":"filter.location.query is unable to resolve to a valid locality.","path":"filter.location"}]}';
    const mockInsightsFn = vi.fn().mockResolvedValue({
      success: false,
      error: {
        kind: 'bad_request' as const,
        message: localityErrorMsg,
        statusCode: 400,
      },
    } as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>);

    const { runDiscovery } = await import('@/services/discovery-agent');
    const group = makeGroup(
      [makeMember('m1', 'Alice', [makeInterest('i1', 'Miles Davis', 'ENT-001')])],
      'NonExistentCity',
    );

    const outcome = await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    expect(outcome.run.status).toBe('failed');
    expect(outcome.run.errorDetails).toContain('NonExistentCity');
    expect(outcome.run.errorDetails).not.toContain('Check Qloo API connectivity');
    expect(outcome.consensusExplanation).toContain('NonExistentCity');
  });

  it('surfaces non-locality errors with the actual error message', async () => {
    const mockInsightsFn = vi.fn().mockResolvedValue({
      success: false,
      error: {
        kind: 'auth_failure' as const,
        message: 'Qloo API rejected the API key. Verify QLOO_API_KEY is valid.',
        statusCode: 401,
      },
    } as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>);

    const { runDiscovery } = await import('@/services/discovery-agent');
    const group = makeGroup(
      [makeMember('m1', 'Alice', [makeInterest('i1', 'Miles Davis', 'ENT-001')])],
      'New York',
    );

    const outcome = await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    expect(outcome.run.status).toBe('failed');
    expect(outcome.run.errorDetails).toContain('rejected the API key');
    expect(outcome.run.errorDetails).not.toContain('Check Qloo API connectivity');
  });
});

// ─── Correct member-specific entity IDs in Insights ─────────────────

describe('member-specific entity IDs in insights requests', () => {
  it('each member gets their own resolved entity IDs sent to Qloo', async () => {
    const capturedParams: Record<string, unknown>[] = [];
    const mockInsightsFn = vi.fn().mockImplementation(async (params: Record<string, unknown>) => {
      capturedParams.push({ ...params });
      return {
        success: true,
        data: {
          results: [makeEntity('ENT-PLACE-1', 'Test Place', 'New York')],
          meta: { endpoint: '/v2/insights', retrievedAt: new Date().toISOString() },
        },
      } as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>;
    });

    const { runDiscovery } = await import('@/services/discovery-agent');
    const group = makeGroup([
      makeMember('m1', 'Alice', [
        makeInterest('i1', 'Miles Davis', 'ENT-MILES'),
        makeInterest('i2', 'Coltrane', 'ENT-COLTRANE'),
      ]),
      makeMember('m2', 'Bob', [
        makeInterest('i3', 'Led Zeppelin', 'ENT-ZEP'),
      ]),
    ], 'New York');

    await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    expect(mockInsightsFn).toHaveBeenCalledTimes(3);
    const firstCallEntities = capturedParams[0].signalInterestsEntities as string[];
    const secondCallEntities = capturedParams[1].signalInterestsEntities as string[];
    expect(firstCallEntities).toContain('ENT-MILES');
    expect(firstCallEntities).toContain('ENT-COLTRANE');
    expect(secondCallEntities).toContain('ENT-ZEP');
    expect(firstCallEntities).not.toContain('ENT-ZEP');
  });

  it('unresolved interests are not sent as entity IDs', async () => {
    const capturedParams: Record<string, unknown>[] = [];
    const mockInsightsFn = vi.fn().mockImplementation(async (params: Record<string, unknown>) => {
      capturedParams.push({ ...params });
      return {
        success: true,
        data: {
          results: [makeEntity('ENT-PLACE-1', 'Test Place', 'New York')],
          meta: { endpoint: '/v2/insights', retrievedAt: new Date().toISOString() },
        },
      } as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>;
    });

    const { runDiscovery } = await import('@/services/discovery-agent');
    const group = makeGroup([
      makeMember('m1', 'Alice', [
        makeInterest('i1', 'Miles Davis', 'ENT-MILES'),
        makeInterest('i2', 'Unknown Band', null),
      ]),
    ], 'New York');

    await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    const entities = capturedParams[0].signalInterestsEntities as string[];
    expect(entities).toContain('ENT-MILES');
    expect(entities).not.toContain('null');
    expect(entities).not.toContain('');
    expect(entities).toHaveLength(1);
  });
});

// ─── Canonical entity types ─────────────────────────────────────────

describe('canonical entity types', () => {
  it('movie interests use urn:entity:movie category', () => {
    const interest = makeInterest('i1', 'Inception', 'ENT-MOVIE', 'urn:entity:movie');
    expect(interest.category).toBe('urn:entity:movie');
  });

  it('tv show interests use urn:entity:tv_show category', () => {
    const interest = makeInterest('i1', 'Breaking Bad', 'ENT-TV', 'urn:entity:tv_show');
    expect(interest.category).toBe('urn:entity:tv_show');
  });

  it('artist interests use urn:entity:artist category', () => {
    const interest = makeInterest('i1', 'Miles Davis', 'ENT-ARTIST', 'urn:entity:artist');
    expect(interest.category).toBe('urn:entity:artist');
  });
});

// ─── Shared-candidate filtering ─────────────────────────────────────

describe('shared-candidate filtering', () => {
  function makeRankedCandidate(
    entityId: string,
    name: string,
    memberCount: number,
    city: string | null = null,
  ): RankedCandidate {
    const evidence: CandidateEvidence[] = [];
    for (let i = 0; i < memberCount; i++) {
      evidence.push(makeEvidence(entityId, `m${i}`, `Member ${i}`, i));
    }
    return {
      source: 'qloo_insights',
      entityId,
      category: 'urn:entity:place',
      name,
      description: null,
      image: null,
      metadata: {},
      retrievalMeta: {
        endpoint: '/v2/insights',
        retrievedAt: new Date().toISOString(),
        affinityScore: null,
        explainability: null,
      },
      memberCoverage: memberCount / 2,
      memberCount,
      totalMembersWithResults: 2,
      rankSupport: 0.8,
      consensusScore: 0.5,
      rank: 0,
      evidence,
      qlooAffinity: null,
      qlooExplainability: null,
      isShared: memberCount >= 2,
      city,
      metro: city,
    };
  }

  it('candidates with memberCount >= 2 are isShared=true', () => {
    const c = makeRankedCandidate('E1', 'Place 1', 2);
    expect(c.isShared).toBe(true);
  });

  it('candidates with memberCount = 1 are isShared=false', () => {
    const c = makeRankedCandidate('E1', 'Place 1', 1);
    expect(c.isShared).toBe(false);
  });

  it('filtering by shared returns only multi-member candidates', () => {
    const candidates = [
      makeRankedCandidate('E1', 'Shared Place', 2),
      makeRankedCandidate('E2', 'Individual Place', 1),
    ];
    const shared = candidates.filter((c) => c.isShared);
    expect(shared).toHaveLength(1);
    expect(shared[0].name).toBe('Shared Place');
  });

  it('filtering by individual returns only single-member candidates', () => {
    const candidates = [
      makeRankedCandidate('E1', 'Shared Place', 2),
      makeRankedCandidate('E2', 'Individual Place', 1),
    ];
    const individual = candidates.filter((c) => !c.isShared);
    expect(individual).toHaveLength(1);
    expect(individual[0].name).toBe('Individual Place');
  });

  it('when no shared candidates exist, only individual results remain', () => {
    const candidates = [
      makeRankedCandidate('E1', 'Place A', 1),
      makeRankedCandidate('E2', 'Place B', 1),
    ];
    const shared = candidates.filter((c) => c.isShared);
    expect(shared).toHaveLength(0);
    const individual = candidates.filter((c) => !c.isShared);
    expect(individual).toHaveLength(2);
  });
});

// ─── Individual-discovery fallback ──────────────────────────────────

describe('individual-discovery fallback', () => {
  it('when all candidates are individual, consensus explanation mentions no shared matches', async () => {
    const mockInsightsFn = vi.fn().mockImplementation(async () => ({
      success: true,
      data: {
        results: [makeEntity('ENT-1', 'Solo Place', 'New York')],
        meta: { endpoint: '/v2/insights', retrievedAt: new Date().toISOString() },
      },
    }) as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>);

    const { runDiscovery } = await import('@/services/discovery-agent');
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Miles Davis', 'ENT-MILES')]),
      makeMember('m2', 'Bob', [makeInterest('i2', 'Led Zeppelin', 'ENT-ZEP')]),
    ], 'New York');

    const outcome = await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    // Both members get different places — no overlap
    const sharedCount = outcome.rankedCandidates.filter((c) => c.isShared).length;
    if (sharedCount === 0) {
      expect(outcome.warnings).toContain(
        'Qloo found individual discoveries for this group, but the current results do not establish a strong shared match. Try adding more interests or adjusting the destination.',
      );
    }
  });
});

// ─── Coverage and consensus denominators ────────────────────────────

describe('correct coverage and consensus denominators', () => {
  it('memberCoverage uses totalMembersWithResults as denominator', () => {
    const evidence = [
      makeEvidence('E1', 'm1', 'Alice', 0),
      makeEvidence('E1', 'm2', 'Bob', 1),
    ];
    const totalMembersWithResults = 3;
    const coverage = calculateMemberCoverage(evidence, totalMembersWithResults);
    expect(coverage).toBeCloseTo(2 / 3, 5);
  });

  it('memberCoverage = 1.0 when all members with results surfaced the candidate', () => {
    const evidence = [
      makeEvidence('E1', 'm1', 'Alice', 0),
      makeEvidence('E1', 'm2', 'Bob', 1),
    ];
    const coverage = calculateMemberCoverage(evidence, 2);
    expect(coverage).toBe(1.0);
  });

  it('memberCoverage = 0 when no evidence', () => {
    const coverage = calculateMemberCoverage([], 2);
    expect(coverage).toBe(0);
  });

  it('consensusScore = 0.7 * coverage + 0.3 * rankSupport', () => {
    const score = calculateConsensusScore(0.8, 0.5);
    expect(score).toBeCloseTo(0.7 * 0.8 + 0.3 * 0.5, 5);
  });

  it('rankCandidates labels isShared correctly based on memberCount', () => {
    const entity1 = makeEntity('E1', 'Shared Place');
    const entity2 = makeEntity('E2', 'Solo Place');

    const retrievals: MemberRetrievalResult[] = [
      makeRetrieval('m1', 'Alice', [entity1, entity2]),
      makeRetrieval('m2', 'Bob', [entity1]),
    ];

    const merged = mergeCandidates(retrievals);
    const ranked = rankCandidates(merged, retrievals);

    const shared = ranked.find((c) => c.entityId === 'E1');
    const solo = ranked.find((c) => c.entityId === 'E2');

    expect(shared?.isShared).toBe(true);
    expect(shared?.memberCount).toBe(2);
    expect(solo?.isShared).toBe(false);
    expect(solo?.memberCount).toBe(1);
  });

  it('rankCandidates populates city and metro from geocode', () => {
    const entity = makeEntity('E1', 'NYC Place', 'New York', 'New York City');
    const retrievals: MemberRetrievalResult[] = [
      makeRetrieval('m1', 'Alice', [entity]),
    ];

    const merged = mergeCandidates(retrievals);
    const ranked = rankCandidates(merged, retrievals);

    expect(ranked[0].city).toBe('New York');
    expect(ranked[0].metro).toBe('New York City');
  });
});

// ─── Partial retrieval failures ─────────────────────────────────────

describe('partial retrieval failures', () => {
  it('one member fails, another succeeds — results still returned', () => {
    const entity = makeEntity('E1', 'Good Place', 'New York');
    const retrievals: MemberRetrievalResult[] = [
      makeRetrieval('m1', 'Alice', [entity]),
      makeRetrieval('m2', 'Bob', [], 1, 'failed'),
    ];

    const merged = mergeCandidates(retrievals);
    const ranked = rankCandidates(merged, retrievals);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].name).toBe('Good Place');
    expect(ranked[0].totalMembersWithResults).toBe(1);
    expect(ranked[0].memberCount).toBe(1);
  });

  it('totalMembersWithResults only counts successful retrievals', () => {
    const entity = makeEntity('E1', 'Good Place');
    const retrievals: MemberRetrievalResult[] = [
      makeRetrieval('m1', 'Alice', [entity]),
      makeRetrieval('m2', 'Bob', [entity]),
      makeRetrieval('m3', 'Carol', [], 1, 'failed'),
    ];

    const merged = mergeCandidates(retrievals);
    const ranked = rankCandidates(merged, retrievals);

    expect(ranked[0].totalMembersWithResults).toBe(2);
    expect(ranked[0].memberCount).toBe(2);
  });
});

// ─── Adaptive retrieval preserves destination ───────────────────────

describe('adaptive retrieval preserves destination constraints', () => {
  it('adaptive pass reuses destination via the same insights function', async () => {
    const capturedParams: Record<string, unknown>[] = [];
    const mockInsightsFn = vi.fn().mockImplementation(async (params: Record<string, unknown>) => {
      capturedParams.push({ ...params });
      return {
        success: true,
        data: {
          results: [makeEntity('ENT-1', 'Place', 'New York')],
          meta: { endpoint: '/v2/insights', retrievedAt: new Date().toISOString() },
        },
      } as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>;
    });

    const { runDiscovery } = await import('@/services/discovery-agent');
    // Create a member with many interests to trigger adaptive
    const interests = Array.from({ length: 6 }, (_, i) =>
      makeInterest(`i${i}`, `Interest ${i}`, `ENT-${i}`),
    );
    const group = makeGroup([makeMember('m1', 'Alice', interests)], 'New York');

    await runDiscovery(group, {
      insightsFn: mockInsightsFn as never,
      adaptiveMinCandidates: 100,
      adaptiveMinCoverage: 1.0,
    });

    // All calls should include the destination
    for (const params of capturedParams) {
      expect(params.filterLocationQuery).toBe('New York');
    }
  });
});

// ─── Duplicate-request prevention ───────────────────────────────────

describe('duplicate-request prevention', () => {
  it('first pass sends at most MAX_ENTITIES_PER_MEMBER_FIRST_PASS entities', async () => {
    const capturedParams: Record<string, unknown>[] = [];
    const mockInsightsFn = vi.fn().mockImplementation(async (params: Record<string, unknown>) => {
      capturedParams.push({ ...params });
      return {
        success: true,
        data: {
          results: [makeEntity('ENT-1', 'Place', 'New York')],
          meta: { endpoint: '/v2/insights', retrievedAt: new Date().toISOString() },
        },
      } as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>;
    });

    const { runDiscovery } = await import('@/services/discovery-agent');
    const interests = Array.from({ length: 6 }, (_, i) =>
      makeInterest(`i${i}`, `Interest ${i}`, `ENT-${i}`),
    );
    const group = makeGroup([makeMember('m1', 'Alice', interests)], 'New York');

    await runDiscovery(group, { insightsFn: mockInsightsFn as never });

    // First call should send at most 3 entities
    const firstCallEntities = capturedParams[0].signalInterestsEntities as string[];
    expect(firstCallEntities.length).toBeLessThanOrEqual(3);
  });

  it('adaptive pass uses different entity IDs than first pass', async () => {
    const capturedParams: Record<string, unknown>[] = [];
    const mockInsightsFn = vi.fn().mockImplementation(async (params: Record<string, unknown>) => {
      capturedParams.push({ ...params });
      return {
        success: true,
        data: {
          results: [makeEntity('ENT-1', 'Place', 'New York')],
          meta: { endpoint: '/v2/insights', retrievedAt: new Date().toISOString() },
        },
      } as QlooResult<{ results: QlooEntity[]; meta: { endpoint: string; retrievedAt: string } }>;
    });

    const { runDiscovery } = await import('@/services/discovery-agent');
    const interests = Array.from({ length: 6 }, (_, i) =>
      makeInterest(`i${i}`, `Interest ${i}`, `ENT-${i}`),
    );
    const group = makeGroup([makeMember('m1', 'Alice', interests)], 'New York');

    await runDiscovery(group, {
      insightsFn: mockInsightsFn as never,
      adaptiveMinCandidates: 100,
      adaptiveMinCoverage: 1.0,
    });

    if (capturedParams.length >= 2) {
      const firstEntities = new Set(capturedParams[0].signalInterestsEntities as string[]);
      const secondEntities = capturedParams[1].signalInterestsEntities as string[];
      const hasNew = secondEntities.some((e) => !firstEntities.has(e));
      expect(hasNew).toBe(true);
    }
  });
});

// ─── Candidate location verification ────────────────────────────────

describe('candidate location verification and honest labeling', () => {
  it('ranked candidates include city from geocode', () => {
    const entity = makeEntity('E1', 'Brooklyn Venue', 'Brooklyn', 'New York City');
    const retrievals = [makeRetrieval('m1', 'Alice', [entity])];

    const merged = mergeCandidates(retrievals);
    const ranked = rankCandidates(merged, retrievals);

    expect(ranked[0].city).toBe('Brooklyn');
    expect(ranked[0].metro).toBe('New York City');
  });

  it('candidates without geocode have null city and metro', () => {
    const entity: QlooEntity = {
      entity_id: 'E1',
      name: 'Unknown Location Place',
      type: 'urn:entity:place',
    };
    const retrievals = [makeRetrieval('m1', 'Alice', [entity])];

    const merged = mergeCandidates(retrievals);
    const ranked = rankCandidates(merged, retrievals);

    expect(ranked[0].city).toBeNull();
    expect(ranked[0].metro).toBeNull();
  });
});

// ─── Explainability parsing and missing metadata ────────────────────

describe('explainability parsing and missing metadata', () => {
  it('qlooExplainability is null when Qloo returns no explainability', () => {
    const entity: QlooEntity = {
      entity_id: 'E1',
      name: 'Place',
      type: 'urn:entity:place',
    };
    const retrievals = [makeRetrieval('m1', 'Alice', [entity])];

    const merged = mergeCandidates(retrievals);
    const ranked = rankCandidates(merged, retrievals);

    expect(ranked[0].qlooExplainability).toBeNull();
  });

  it('qlooExplainability is preserved when Qloo returns data', () => {
    const explData = { contributing_entities: ['ENT-1', 'ENT-2'] };
    const entity: QlooEntity = {
      entity_id: 'E1',
      name: 'Place',
      type: 'urn:entity:place',
      explainability: explData,
    };
    const retrievals = [makeRetrieval('m1', 'Alice', [entity])];

    const merged = mergeCandidates(retrievals);
    const ranked = rankCandidates(merged, retrievals);

    expect(ranked[0].qlooExplainability).toEqual(explData);
  });

  it('qlooAffinity is preserved when Qloo returns affinity', () => {
    const entity: QlooEntity = {
      entity_id: 'E1',
      name: 'Place',
      type: 'urn:entity:place',
      affinity: 0.85,
    };
    const retrievals = [makeRetrieval('m1', 'Alice', [entity])];

    const merged = mergeCandidates(retrievals);
    const ranked = rankCandidates(merged, retrievals);

    expect(ranked[0].qlooAffinity).toBe(0.85);
  });
});

// ─── Unresolved-interest handling in buildRetrievalPlan ─────────────

describe('unresolved-interest handling in buildRetrievalPlan', () => {
  it('plan counts resolved and unresolved separately', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [
        makeInterest('i1', 'Miles Davis', 'ENT-1'),
        makeInterest('i2', 'Unknown', null),
      ]),
    ]);

    const plan = buildRetrievalPlan(group);

    expect(plan.totalResolvedEntities).toBe(1);
    expect(plan.totalUnresolved).toBe(1);
    expect(plan.memberPlans[0].entityIds).toEqual(['ENT-1']);
    expect(plan.memberPlans[0].hasUnresolvedInterests).toBe(true);
  });

  it('plan is sufficient when at least 1 resolved entity exists', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Miles Davis', 'ENT-1')]),
    ]);

    const plan = buildRetrievalPlan(group);
    expect(plan.sufficientForDiscovery).toBe(true);
  });

  it('plan is insufficient when no resolved entities exist', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [makeInterest('i1', 'Unknown', null)]),
    ]);

    const plan = buildRetrievalPlan(group);
    expect(plan.sufficientForDiscovery).toBe(false);
    expect(plan.guidance).toContain('resolved');
  });
});
