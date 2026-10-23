/**
 * Cultural entity domain types.
 * These describe the shape of cultural interests and retrieved candidates
 * throughout the CommonGround application.
 */

export type CulturalCategory =
  | 'urn:entity:music'
  | 'urn:entity:movie'
  | 'urn:entity:tv_show'
  | 'urn:entity:book'
  | 'urn:entity:podcast'
  | 'urn:entity:place'
  | 'urn:entity:brand'
  | 'urn:entity:artist'
  | 'urn:entity:game'
  | 'urn:entity:destination';

export type ResolutionStatus = 'pending' | 'resolved' | 'unresolved';

export interface CulturalInterest {
  id: string;
  originalInput: string;
  resolvedEntityId: string | null;
  category: CulturalCategory | null;
  resolutionStatus: ResolutionStatus;
  displayName: string | null;
}

export interface RetrievedCandidate {
  source: string;
  entityId: string | null;
  category: string;
  name: string;
  description: string | null;
  image: string | null;
  metadata: Record<string, unknown>;
  retrievalMeta: {
    endpoint: string;
    retrievedAt: string;
    affinityScore: number | null;
    explainability: unknown | null;
  };
}

export const CULTURAL_CATEGORY_LABELS: Record<string, string> = {
  'urn:entity:music': 'Music',
  'urn:entity:movie': 'Movies',
  'urn:entity:tv_show': 'TV Shows',
  'urn:entity:book': 'Books',
  'urn:entity:podcast': 'Podcasts',
  'urn:entity:place': 'Places',
  'urn:entity:brand': 'Brands',
  'urn:entity:artist': 'Artists',
  'urn:entity:game': 'Games',
  'urn:entity:destination': 'Destinations',
};

export const SEARCHABLE_ENTITY_TYPES: CulturalCategory[] = [
  'urn:entity:movie',
  'urn:entity:tv_show',
  'urn:entity:book',
  'urn:entity:podcast',
  'urn:entity:place',
  'urn:entity:brand',
  'urn:entity:artist',
  'urn:entity:game',
  'urn:entity:destination',
];
