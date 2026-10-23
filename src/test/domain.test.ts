import { describe, it, expect } from 'vitest';
import type { Group, Member, BudgetLevel } from '@/types/group';
import { BUDGET_LABELS, BUDGET_OPTIONS } from '@/types/group';
import type { CulturalInterest, RetrievedCandidate } from '@/types/cultural';
import { CULTURAL_CATEGORY_LABELS, SEARCHABLE_ENTITY_TYPES } from '@/types/cultural';
import type { DiscoveryRun, AgentStep, StepType, StepStatus, DiscoveryRunStatus } from '@/types/discovery';

function makeInterest(overrides: Partial<CulturalInterest> = {}): CulturalInterest {
  return {
    id: 'test-id',
    originalInput: 'jazz',
    resolvedEntityId: null,
    category: null,
    resolutionStatus: 'pending',
    displayName: 'jazz',
    ...overrides,
  };
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-1',
    displayName: 'Test Person',
    culturalInterests: [makeInterest()],
    exclusions: [],
    budgetPreference: null,
    accessibilityRequirements: [],
    ...overrides,
  };
}

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1',
    name: 'Test Group',
    destination: 'New York',
    members: [makeMember(), makeMember({ id: 'member-2', displayName: 'Person 2' })],
    constraints: {
      maxTravelDistanceMiles: null,
      preferredDays: [],
      budgetLevel: null,
      groupSizeMin: null,
      groupSizeMax: null,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Group domain model', () => {
  it('creates a group with required fields', () => {
    const group = makeGroup();
    expect(group.id).toBeDefined();
    expect(group.name).toBe('Test Group');
    expect(group.members).toHaveLength(2);
    expect(group.constraints).toBeDefined();
    expect(group.createdAt).toBeDefined();
    expect(group.updatedAt).toBeDefined();
  });

  it('constraints have correct default shape', () => {
    const group = makeGroup();
    expect(group.constraints.maxTravelDistanceMiles).toBeNull();
    expect(group.constraints.preferredDays).toEqual([]);
    expect(group.constraints.budgetLevel).toBeNull();
  });

  it('members carry cultural interests', () => {
    const member = makeMember();
    expect(member.culturalInterests).toHaveLength(1);
    expect(member.culturalInterests[0].originalInput).toBe('jazz');
  });
});

describe('BudgetLevel', () => {
  it('all budget levels have labels', () => {
    const levels: BudgetLevel[] = ['free', 'low', 'moderate', 'premium'];
    for (const level of levels) {
      expect(BUDGET_LABELS[level]).toBeDefined();
      expect(typeof BUDGET_LABELS[level]).toBe('string');
    }
  });

  it('budget options match labels', () => {
    expect(BUDGET_OPTIONS).toHaveLength(4);
    for (const opt of BUDGET_OPTIONS) {
      expect(BUDGET_LABELS[opt.value]).toBe(opt.label);
    }
  });
});

describe('CulturalInterest', () => {
  it('pending interest has no resolved entity', () => {
    const interest = makeInterest();
    expect(interest.resolutionStatus).toBe('pending');
    expect(interest.resolvedEntityId).toBeNull();
  });

  it('resolved interest has entity ID', () => {
    const interest = makeInterest({
      resolvedEntityId: 'qloo-entity-123',
      resolutionStatus: 'resolved',
      category: 'urn:entity:music',
    });
    expect(interest.resolutionStatus).toBe('resolved');
    expect(interest.resolvedEntityId).toBe('qloo-entity-123');
  });

  it('unresolved interest marks failure', () => {
    const interest = makeInterest({ resolutionStatus: 'unresolved' });
    expect(interest.resolutionStatus).toBe('unresolved');
    expect(interest.resolvedEntityId).toBeNull();
  });
});

describe('CulturalCategory labels', () => {
  it('all searchable entity types have labels', () => {
    for (const cat of SEARCHABLE_ENTITY_TYPES) {
      expect(CULTURAL_CATEGORY_LABELS[cat]).toBeDefined();
    }
  });

  it('labels are human-readable strings', () => {
    expect(CULTURAL_CATEGORY_LABELS['urn:entity:movie']).toBe('Movies');
    expect(CULTURAL_CATEGORY_LABELS['urn:entity:place']).toBe('Places');
    expect(CULTURAL_CATEGORY_LABELS['urn:entity:book']).toBe('Books');
  });
});

describe('RetrievedCandidate', () => {
  it('preserves source identifiers', () => {
    const candidate: RetrievedCandidate = {
      source: 'qloo_insights',
      entityId: 'entity-abc',
      category: 'urn:entity:place',
      name: 'Test Restaurant',
      description: 'A great place',
      image: null,
      metadata: { rating: 4.5 },
      retrievalMeta: {
        endpoint: '/v2/insights',
        retrievedAt: '2026-01-01T00:00:00.000Z',
        affinityScore: 0.85,
        explainability: null,
      },
    };
    expect(candidate.source).toBe('qloo_insights');
    expect(candidate.entityId).toBe('entity-abc');
    expect(candidate.retrievalMeta.endpoint).toBe('/v2/insights');
    expect(candidate.retrievalMeta.affinityScore).toBe(0.85);
  });

  it('allows null for optional display fields', () => {
    const candidate: RetrievedCandidate = {
      source: 'qloo_search',
      entityId: null,
      category: 'urn:entity:movie',
      name: 'Unknown Movie',
      description: null,
      image: null,
      metadata: {},
      retrievalMeta: {
        endpoint: '/search',
        retrievedAt: '2026-01-01T00:00:00.000Z',
        affinityScore: null,
        explainability: null,
      },
    };
    expect(candidate.entityId).toBeNull();
    expect(candidate.description).toBeNull();
    expect(candidate.image).toBeNull();
  });
});

describe('DiscoveryRun and AgentStep', () => {
  it('creates an idle discovery run', () => {
    const run: DiscoveryRun = {
      id: 'run-1',
      groupId: 'group-1',
      status: 'idle',
      candidateRefs: [],
      traceSteps: [],
      errorDetails: null,
      startedAt: null,
      completedAt: null,
    };
    expect(run.status).toBe('idle');
    expect(run.traceSteps).toEqual([]);
    expect(run.errorDetails).toBeNull();
  });

  it('creates a completed agent step with evidence', () => {
    const step: AgentStep = {
      id: 'step-1',
      stepType: 'related_entity_retrieval' as StepType,
      status: 'completed' as StepStatus,
      explanation: 'Retrieved 5 candidates from Qloo',
      timestamp: '2026-01-01T00:00:00.000Z',
      evidenceRefs: ['entity-1', 'entity-2'],
    };
    expect(step.status).toBe('completed');
    expect(step.evidenceRefs).toHaveLength(2);
  });

  it('failed run has error details', () => {
    const run: DiscoveryRun = {
      id: 'run-2',
      groupId: 'group-1',
      status: 'failed' as DiscoveryRunStatus,
      candidateRefs: [],
      traceSteps: [],
      errorDetails: 'Qloo API authentication failed',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
    };
    expect(run.status).toBe('failed');
    expect(run.errorDetails).toBe('Qloo API authentication failed');
  });
});
