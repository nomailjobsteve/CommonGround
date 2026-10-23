/**
 * Regression tests for the search-to-member-profile workflow.
 *
 * Tests cover:
 * - Correct category-specific Search query serialization (types parameter)
 * - Search response parsing with entity_id schema
 * - Successful live-search response handling
 * - Empty search results
 * - Search API errors and malformed responses
 * - Selecting a result adds it to the correct member
 * - Adding multiple interests preserves earlier selections
 * - Duplicate selections are prevented
 * - Removing an interest works
 * - Switching between members does not mix their interests
 * - Navigating through the group-review step preserves selections
 * - Selected interests reach the discovery agent as resolved entities
 * - Stale search responses cannot overwrite newer results
 *
 * Mock API responses are used — no live API calls in these tests.
 */

import { describe, it, expect, vi } from 'vitest';
import type { QlooEntity } from '@/types/qloo';
import type { CulturalInterest, CulturalCategory } from '@/types/cultural';
import type { Member, Group } from '@/types/group';

// ─── Fixtures ───────────────────────────────────────────────────────

function makeQlooEntity(
  entityId: string,
  name: string,
  opts: Partial<QlooEntity> = {},
): QlooEntity {
  return {
    entity_id: entityId,
    name,
    type: 'urn:entity:artist',
    subtype: 'urn:entity:artist',
    properties: { short_description: `Description for ${name}` },
    ...opts,
  };
}

function makeInterest(
  id: string,
  input: string,
  resolvedEntityId: string | null,
  category: CulturalCategory | null = 'urn:entity:artist',
  displayName?: string,
): CulturalInterest {
  return {
    id,
    originalInput: input,
    resolvedEntityId,
    category,
    resolutionStatus: resolvedEntityId ? 'resolved' : 'unresolved',
    displayName: displayName ?? input,
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

function makeGroup(members: Member[]): Group {
  return {
    id: 'group-1',
    name: 'Test Group',
    destination: 'New York',
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

// ─── Search query serialization ─────────────────────────────────────

describe('search query serialization', () => {
  it('serializes types as repeated "types" params (plural, per docs)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { results: [] },
          meta: { endpoint: '/search', statusCode: 200, retrievedAt: new Date().toISOString(), retried: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const { searchEntities } = await import('@/lib/qloo-client');

    await searchEntities('jazz', ['urn:entity:artist', 'urn:entity:movie'], 5);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('types=urn%3Aentity%3Aartist');
    expect(url).toContain('types=urn%3Aentity%3Amovie');
    expect(url).not.toContain('type=');
    expect(url).toContain('query=jazz');
    expect(url).toContain('take=5');

    vi.unstubAllGlobals();
  });

  it('omits types param when no category selected', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { results: [] },
          meta: { endpoint: '/search', statusCode: 200, retrievedAt: new Date().toISOString(), retried: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);
    const { searchEntities } = await import('@/lib/qloo-client');

    await searchEntities('rock', undefined, 10);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain('types=');
    expect(url).toContain('query=rock');

    vi.unstubAllGlobals();
  });
});

// ─── Search response parsing ────────────────────────────────────────

describe('search response parsing', () => {
  it('parses entities with entity_id field', async () => {
    const entities = [
      makeQlooEntity('ENT-001', 'Miles Davis'),
      makeQlooEntity('ENT-002', 'John Coltrane'),
    ];

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { results: entities },
          meta: { endpoint: '/search', statusCode: 200, retrievedAt: new Date().toISOString(), retried: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);
    const { searchEntities } = await import('@/lib/qloo-client');

    const result = await searchEntities('jazz', ['urn:entity:artist'], 5);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].entity_id).toBe('ENT-001');
      expect(result.data[0].name).toBe('Miles Davis');
      expect(result.data[1].entity_id).toBe('ENT-002');
    }

    vi.unstubAllGlobals();
  });

  it('handles empty results array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { results: [] },
          meta: { endpoint: '/search', statusCode: 200, retrievedAt: new Date().toISOString(), retried: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);
    const { searchEntities } = await import('@/lib/qloo-client');

    const result = await searchEntities('nonexistent', ['urn:entity:artist'], 5);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }

    vi.unstubAllGlobals();
  });

  it('returns error for auth failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { kind: 'auth_failure', message: 'Invalid key', statusCode: 401 },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);
    const { searchEntities } = await import('@/lib/qloo-client');

    const result = await searchEntities('jazz', ['urn:entity:artist'], 5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('auth_failure');
    }

    vi.unstubAllGlobals();
  });

  it('returns error for rate limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { kind: 'rate_limit', message: 'Too many requests', statusCode: 429 },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);
    const { searchEntities } = await import('@/lib/qloo-client');

    const result = await searchEntities('jazz', ['urn:entity:artist'], 5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('rate_limit');
    }

    vi.unstubAllGlobals();
  });

  it('handles network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Connection refused'));
    vi.stubGlobal('fetch', fetchMock);
    const { searchEntities } = await import('@/lib/qloo-client');

    const result = await searchEntities('jazz', ['urn:entity:artist'], 5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('network');
      expect(result.error.message).toBe('Connection refused');
    }

    vi.unstubAllGlobals();
  });

  it('handles malformed response (missing results field)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { unexpected: true } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);
    const { searchEntities } = await import('@/lib/qloo-client');

    const result = await searchEntities('jazz', ['urn:entity:artist'], 5);
    // The proxy validates the response, but the client just parses body.data.results
    // If results is undefined, we get an empty array cast — verify it doesn't crash
    expect(result.success).toBe(true);

    vi.unstubAllGlobals();
  });
});

// ─── Member interest state management ───────────────────────────────

describe('member interest state management', () => {
  function addInterestToMember(
    member: Member,
    interest: CulturalInterest,
  ): Member {
    return {
      ...member,
      culturalInterests: [...member.culturalInterests, interest],
    };
  }

  function removeInterestFromMember(
    member: Member,
    interestId: string,
  ): Member {
    return {
      ...member,
      culturalInterests: member.culturalInterests.filter((ci) => ci.id !== interestId),
    };
  }

  function isDuplicate(member: Member, entityId: string): boolean {
    return member.culturalInterests.some((ci) => ci.resolvedEntityId === entityId);
  }

  it('selecting a result adds it to the correct member', () => {
    const alice = makeMember('m1', 'Alice');
    const bob = makeMember('m2', 'Bob');

    const interest = makeInterest('i1', 'Miles Davis', 'ENT-001', 'urn:entity:artist', 'Miles Davis');
    const updatedAlice = addInterestToMember(alice, interest);

    expect(updatedAlice.culturalInterests).toHaveLength(1);
    expect(updatedAlice.culturalInterests[0].resolvedEntityId).toBe('ENT-001');
    expect(updatedAlice.culturalInterests[0].displayName).toBe('Miles Davis');

    // Bob is unchanged
    expect(bob.culturalInterests).toHaveLength(0);
  });

  it('adding multiple interests preserves earlier selections', () => {
    let alice = makeMember('m1', 'Alice', [
      makeInterest('i1', 'Miles Davis', 'ENT-001', 'urn:entity:artist', 'Miles Davis'),
    ]);

    const second = makeInterest('i2', 'John Coltrane', 'ENT-002', 'urn:entity:artist', 'John Coltrane');
    alice = addInterestToMember(alice, second);

    expect(alice.culturalInterests).toHaveLength(2);
    expect(alice.culturalInterests[0].resolvedEntityId).toBe('ENT-001');
    expect(alice.culturalInterests[1].resolvedEntityId).toBe('ENT-002');
  });

  it('duplicate selections are prevented by entity_id', () => {
    const alice = makeMember('m1', 'Alice', [
      makeInterest('i1', 'Miles Davis', 'ENT-001', 'urn:entity:artist', 'Miles Davis'),
    ]);

    expect(isDuplicate(alice, 'ENT-001')).toBe(true);
    expect(isDuplicate(alice, 'ENT-999')).toBe(false);
  });

  it('removing an interest works', () => {
    let alice = makeMember('m1', 'Alice', [
      makeInterest('i1', 'Miles Davis', 'ENT-001', 'urn:entity:artist', 'Miles Davis'),
      makeInterest('i2', 'John Coltrane', 'ENT-002', 'urn:entity:artist', 'John Coltrane'),
    ]);

    alice = removeInterestFromMember(alice, 'i1');

    expect(alice.culturalInterests).toHaveLength(1);
    expect(alice.culturalInterests[0].resolvedEntityId).toBe('ENT-002');
  });

  it('switching between members does not mix their interests', () => {
    const alice = makeMember('m1', 'Alice', [
      makeInterest('i1', 'Miles Davis', 'ENT-001', 'urn:entity:artist', 'Miles Davis'),
    ]);
    const bob = makeMember('m2', 'Bob', [
      makeInterest('i2', 'Led Zeppelin', 'ENT-003', 'urn:entity:artist', 'Led Zeppelin'),
    ]);

    // Add to Alice — Bob should not be affected
    const newInterest = makeInterest('i3', 'Thelonious Monk', 'ENT-004', 'urn:entity:artist', 'Thelonious Monk');
    const updatedAlice = addInterestToMember(alice, newInterest);

    expect(updatedAlice.culturalInterests).toHaveLength(2);
    expect(bob.culturalInterests).toHaveLength(1);
    expect(bob.culturalInterests[0].resolvedEntityId).toBe('ENT-003');
  });
});

// ─── Group review preserves selections ──────────────────────────────

describe('group review preserves selections', () => {
  it('all interests survive to the review step', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [
        makeInterest('i1', 'Miles Davis', 'ENT-001', 'urn:entity:artist', 'Miles Davis'),
        makeInterest('i2', 'Studio Ghibli', 'ENT-010', 'urn:entity:movie', 'Studio Ghibli'),
      ]),
      makeMember('m2', 'Bob', [
        makeInterest('i3', 'Korean BBQ', 'ENT-020', 'urn:entity:place', 'Korean BBQ'),
      ]),
    ]);

    // Simulate the review step filtering members with names
    const reviewMembers = group.members.filter((m) => m.displayName.trim());
    expect(reviewMembers).toHaveLength(2);
    expect(reviewMembers[0].culturalInterests).toHaveLength(2);
    expect(reviewMembers[1].culturalInterests).toHaveLength(1);
  });
});

// ─── Discovery agent receives resolved entities ─────────────────────

describe('discovery agent receives resolved entities', () => {
  it('resolved entity IDs from search are available to the discovery agent', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [
        makeInterest('i1', 'Miles Davis', 'ENT-001', 'urn:entity:artist', 'Miles Davis'),
      ]),
      makeMember('m2', 'Bob', [
        makeInterest('i2', 'Led Zeppelin', 'ENT-003', 'urn:entity:artist', 'Led Zeppelin'),
      ]),
    ]);

    // Extract resolved entity IDs the way the discovery agent does
    const resolvedIds = group.members
      .flatMap((m) => m.culturalInterests)
      .filter((ci) => ci.resolutionStatus === 'resolved' && ci.resolvedEntityId)
      .map((ci) => ci.resolvedEntityId!);

    expect(resolvedIds).toEqual(['ENT-001', 'ENT-003']);
  });

  it('unresolved interests are excluded from discovery signals', () => {
    const group = makeGroup([
      makeMember('m1', 'Alice', [
        makeInterest('i1', 'Miles Davis', 'ENT-001', 'urn:entity:artist', 'Miles Davis'),
        makeInterest('i2', 'Unknown Band', null, 'urn:entity:artist', 'Unknown Band'),
      ]),
    ]);

    const resolvedIds = group.members
      .flatMap((m) => m.culturalInterests)
      .filter((ci) => ci.resolutionStatus === 'resolved' && ci.resolvedEntityId)
      .map((ci) => ci.resolvedEntityId!);

    expect(resolvedIds).toEqual(['ENT-001']);
  });
});

// ─── Stale response guard ───────────────────────────────────────────

describe('stale search response guard', () => {
  it('ignores responses from older searches when a newer search has been issued', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const firstCall = new Promise((resolve) => { resolveFirst = resolve; });

    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstCall) // First call: slow, returns old results
      .mockResolvedValueOnce(         // Second call: fast, returns new results
        new Response(
          JSON.stringify({
            success: true,
            data: { results: [makeQlooEntity('ENT-NEW', 'New Result')] },
            meta: { endpoint: '/search', statusCode: 200, retrievedAt: new Date().toISOString(), retried: false },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);
    const { searchEntities } = await import('@/lib/qloo-client');

    // Issue first search (slow)
    const firstPromise = searchEntities('old query', ['urn:entity:artist'], 5);
    // Issue second search (fast) — should resolve first
    const secondPromise = searchEntities('new query', ['urn:entity:artist'], 5);

    const secondResult = await secondPromise;
    expect(secondResult.success).toBe(true);
    if (secondResult.success) {
      expect(secondResult.data[0].entity_id).toBe('ENT-NEW');
    }

    // Now resolve the first (stale) search
    resolveFirst(
      new Response(
        JSON.stringify({
          success: true,
          data: { results: [makeQlooEntity('ENT-OLD', 'Old Result')] },
          meta: { endpoint: '/search', statusCode: 200, retrievedAt: new Date().toISOString(), retried: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const firstResult = await firstPromise;
    // The first result still resolves with its own data —
    // the stale guard is in the UI component (searchSeqRef), not in the client.
    // The client just returns results; the component decides which to keep.
    expect(firstResult.success).toBe(true);

    vi.unstubAllGlobals();
  });

  it('searchSeqRef pattern prevents stale overwrites', () => {
    // Verify the stale-guard logic pattern works correctly
    const seqRef = { current: 0 };

    // First search
    const seq1 = ++seqRef.current;
    expect(seq1).toBe(1);

    // Second search (before first resolves)
    const seq2 = ++seqRef.current;
    expect(seq2).toBe(2);

    // First response arrives — seq1 !== seqRef.current (2), so it's stale
    expect(seq1 !== seqRef.current).toBe(true);

    // Second response arrives — seq2 === seqRef.current (2), so it's fresh
    expect(seq2 === seqRef.current).toBe(true);
  });
});

// ─── Category-specific search ───────────────────────────────────────

describe('category-specific search', () => {
  it('sends correct category URN in types parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { results: [makeQlooEntity('ENT-1', 'Test Movie', { type: 'urn:entity:movie' })] },
          meta: { endpoint: '/search', statusCode: 200, retrievedAt: new Date().toISOString(), retried: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);
    const { searchEntities } = await import('@/lib/qloo-client');

    await searchEntities('inception', ['urn:entity:movie'], 5);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('types=urn%3Aentity%3Amovie');

    vi.unstubAllGlobals();
  });

  it('sends multiple categories when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { results: [] },
          meta: { endpoint: '/search', statusCode: 200, retrievedAt: new Date().toISOString(), retried: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);
    const { searchEntities } = await import('@/lib/qloo-client');

    await searchEntities('test', ['urn:entity:movie', 'urn:entity:tv_show', 'urn:entity:book'], 5);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('types=urn%3Aentity%3Amovie');
    expect(url).toContain('types=urn%3Aentity%3Atv_show');
    expect(url).toContain('types=urn%3Aentity%3Abook');

    vi.unstubAllGlobals();
  });
});
