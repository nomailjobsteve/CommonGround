/**
 * Qloo API types — mirrors the verified Qloo hackathon API response structures.
 * Based on live API responses from https://hackathon.api.qloo.com and
 * documentation at https://docs.qloo.com/reference/insights-api-deep-dive
 * and https://docs.qloo.com/reference/get-search
 *
 * Live response observations:
 * - Search: { results: QlooEntity[] }
 * - Insights: { success: true, results: { entities: QlooEntity[] } }
 * - Entities use `entity_id` (not `id`) as the identifier field
 * - Images are in `properties.images` (array of { url, type }) for places,
 *   and `properties.image.url` for other entity types
 */

export interface QlooEntity {
  id?: string;
  entity_id?: string;
  name?: string;
  type?: string;
  subtype?: string;
  description?: string;
  image?: string;
  popularity?: number;
  disambiguation?: string;
  metadata?: Record<string, unknown>;
  properties?: {
    name?: string;
    description?: string;
    short_description?: string;
    image?: { url: string };
    images?: Array<{ url: string; type?: string }>;
    geocode?: {
      city?: string;
      name?: string;
      country?: string;
      country_code?: string;
      admin1_region?: string;
      admin2_region?: string;
      metro?: string | null;
      lat?: number;
      lon?: number;
    };
    address?: string;
    hours?: Record<string, unknown>;
    phone?: string;
    website?: string;
    external?: Record<string, unknown>;
    [key: string]: unknown;
  };
  tags?: Array<{
    id?: string;
    tag_id?: string;
    name?: string;
    type?: string;
    value?: string;
    weight?: number;
  }>;
  affinity?: number;
  explainability?: unknown;
}

export interface QlooSearchResponse {
  results?: QlooEntity[];
  query?: Record<string, unknown>;
}

export interface QlooInsightsResponse {
  results?: QlooEntity[];
  query?: {
    explainability?: unknown;
    locality?: {
      signal?: QlooEntity;
    };
    [key: string]: unknown;
  };
}

export type QlooErrorKind =
  | 'missing_config'
  | 'auth_failure'
  | 'rate_limit'
  | 'network'
  | 'invalid_response'
  | 'not_found'
  | 'bad_request'
  | 'server_error'
  | 'unknown';

export interface QlooError {
  kind: QlooErrorKind;
  message: string;
  statusCode: number | null;
}

export type QlooResult<T> =
  | { success: true; data: T }
  | { success: false; error: QlooError };

export interface QlooInsightsParams {
  filterType: string;
  signalInterestsEntities?: string[];
  signalInterestsTags?: string[];
  filterTags?: string[];
  filterLocation?: string;
  filterLocationQuery?: string;
  filterLocationRadius?: number;
  take?: number;
  sortBy?: 'affinity' | 'distance' | 'rating' | 'quality';
  featureExplainability?: boolean;
}

export interface QlooSearchParams {
  query: string;
  types?: string[];
  filterTags?: string[];
  take?: number;
}
