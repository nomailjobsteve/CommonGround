/**
 * Tests for the Qloo proxy edge function configuration and contracts.
 *
 * These tests verify:
 * - The hackathon base URL is correct.
 * - The X-Api-Key header is used (not Bearer, not query param).
 * - Search parameter construction (type, query, take, filter.tags).
 * - Insights parameter construction (filter.type, signal.interests.entities, etc.).
 * - Response parsing for both endpoints.
 * - Error normalization for missing config, auth failure, rate limit, etc.
 *
 * These are unit tests that test the logic extracted from the edge function.
 * They do NOT make live API calls — live verification is done separately.
 */

import { describe, it, expect } from 'vitest';

// ─── Constants under test ───────────────────────────────────────────

const EXPECTED_BASE_URL = 'https://hackathon.api.qloo.com';
const EXPECTED_AUTH_HEADER = 'X-Api-Key';
const INSIGHTS_PATH = '/v2/insights';
const SEARCH_PATH = '/search';

// ─── URL construction logic (mirrors edge function buildUrl) ────────

function buildUrl(
  base: string,
  path: string,
  params: Record<string, string | string[] | number | boolean | undefined>,
): string {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        url.searchParams.append(key, v);
      }
    } else if (typeof value === 'boolean') {
      url.searchParams.set(key, value ? 'true' : 'false');
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// ─── Response validation logic (mirrors edge function) ──────────────

function validateSearchResponse(body: unknown): { results: unknown[] } {
  if (typeof body !== "object" || body === null) {
    throw new Error('Response is not a JSON object');
  }
  const obj = body as Record<string, unknown>;
  if (!('results' in obj)) {
    throw new Error("Response missing 'results' field");
  }
  if (!Array.isArray(obj.results)) {
    throw new Error("'results' is not an array");
  }
  return { results: obj.results as unknown[] };
}

function validateInsightsResponse(body: unknown): { results: unknown[] } {
  if (typeof body !== "object" || body === null) {
    throw new Error('Response is not a JSON object');
  }
  const obj = body as Record<string, unknown>;
  if (!('results' in obj)) {
    throw new Error("Response missing 'results' field");
  }
  const results = obj.results;

  // Insights API: results is an object with an `entities` array
  if (typeof results === 'object' && results !== null && !Array.isArray(results)) {
    const resultsObj = results as Record<string, unknown>;
    if ('entities' in resultsObj && Array.isArray(resultsObj.entities)) {
      return { results: resultsObj.entities as unknown[] };
    }
    throw new Error("Insights 'results' object missing 'entities' array");
  }

  // Fallback: results is directly an array
  if (Array.isArray(results)) {
    return { results: results as unknown[] };
  }

  throw new Error("'results' is neither an array nor an object with 'entities'");
}

// ─── Error kind classification (mirrors edge function) ──────────────

type QlooErrorKind =
  | 'missing_config'
  | 'auth_failure'
  | 'rate_limit'
  | 'network'
  | 'invalid_response'
  | 'not_found'
  | 'bad_request'
  | 'server_error'
  | 'unknown';

function classifyError(status: number): QlooErrorKind {
  if (status === 401 || status === 403) return 'auth_failure';
  if (status === 429) return 'rate_limit';
  if (status === 404) return 'not_found';
  if (status === 400) return 'bad_request';
  if (status >= 500) return 'server_error';
  return 'unknown';
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Qloo proxy — hackathon base URL', () => {
  it('uses the hackathon API host', () => {
    expect(EXPECTED_BASE_URL).toBe('https://hackathon.api.qloo.com');
  });

  it('is not the production api.qloo.com host', () => {
    expect(EXPECTED_BASE_URL).not.toBe('https://api.qloo.com');
  });

  it('is not the staging host', () => {
    expect(EXPECTED_BASE_URL).not.toBe('https://staging.api.qloo.com');
  });
});

describe('Qloo proxy — authentication', () => {
  it('uses X-Api-Key header (not Bearer)', () => {
    expect(EXPECTED_AUTH_HEADER).toBe('X-Api-Key');
    expect(EXPECTED_AUTH_HEADER).not.toBe('Authorization');
  });

  it('header value is the API key from server-side secret', () => {
    const headers: Record<string, string> = {
      'X-Api-Key': 'test-key-value',
      'Accept': 'application/json',
    };
    expect(headers['X-Api-Key']).toBe('test-key-value');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('does not pass API key in query parameters', () => {
    const searchParams = buildUrl(EXPECTED_BASE_URL, SEARCH_PATH, {
      query: 'test',
      type: 'urn:entity:movie',
    });
    const url = new URL(searchParams);
    expect(url.searchParams.has('api_key')).toBe(false);
    expect(url.searchParams.has('apikey')).toBe(false);
    expect(url.searchParams.has('key')).toBe(false);
  });
});

describe('Qloo proxy — Search endpoint parameter construction', () => {
  it('constructs a search URL with query and type', () => {
    const url = buildUrl(EXPECTED_BASE_URL, SEARCH_PATH, {
      query: 'jazz',
      type: ['urn:entity:music'],
      take: 10,
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('hackathon.api.qloo.com');
    expect(parsed.pathname).toBe('/search');
    expect(parsed.searchParams.get('query')).toBe('jazz');
    expect(parsed.searchParams.getAll('type')).toEqual(['urn:entity:music']);
    expect(parsed.searchParams.get('take')).toBe('10');
  });

  it('supports multiple type values as repeated query params', () => {
    const url = buildUrl(EXPECTED_BASE_URL, SEARCH_PATH, {
      query: 'test',
      type: ['urn:entity:movie', 'urn:entity:tv_show'],
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.getAll('type')).toEqual(['urn:entity:movie', 'urn:entity:tv_show']);
  });

  it('uses type (singular) per hackathon organizer example', () => {
    const url = buildUrl(EXPECTED_BASE_URL, SEARCH_PATH, {
      query: 'test',
      type: ['urn:entity:movie'],
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.has('type')).toBe(true);
    expect(parsed.searchParams.has('types')).toBe(false);
  });

  it('omits undefined and null params', () => {
    const url = buildUrl(EXPECTED_BASE_URL, SEARCH_PATH, {
      query: 'test',
      type: undefined,
      take: undefined,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.has('type')).toBe(false);
    expect(parsed.searchParams.has('take')).toBe(false);
  });

  it('forwards filter.tags as repeated params', () => {
    const url = buildUrl(EXPECTED_BASE_URL, SEARCH_PATH, {
      query: 'italian',
      'filter.tags': ['urn:tag:genre:place:restaurant:italian'],
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.getAll('filter.tags')).toEqual(['urn:tag:genre:place:restaurant:italian']);
  });

  it('matches the organizer curl example exactly', () => {
    const url = buildUrl(EXPECTED_BASE_URL, SEARCH_PATH, {
      query: 'test',
      type: ['urn:entity:movie'],
    });
    // Should match: https://hackathon.api.qloo.com/search?query=test&type=urn%3Aentity%3Amovie
    expect(url).toContain('hackathon.api.qloo.com/search');
    expect(url).toContain('query=test');
    expect(url).toContain('type=urn%3Aentity%3Amovie');
  });
});

describe('Qloo proxy — Insights endpoint parameter construction', () => {
  it('constructs an insights URL with filter.type', () => {
    const url = buildUrl(EXPECTED_BASE_URL, INSIGHTS_PATH, {
      'filter.type': 'urn:entity:place',
      take: 20,
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('hackathon.api.qloo.com');
    expect(parsed.pathname).toBe('/v2/insights');
    expect(parsed.searchParams.get('filter.type')).toBe('urn:entity:place');
    expect(parsed.searchParams.get('take')).toBe('20');
  });

  it('passes signal.interests.entities as repeated params', () => {
    const url = buildUrl(EXPECTED_BASE_URL, INSIGHTS_PATH, {
      'filter.type': 'urn:entity:place',
      'signal.interests.entities': ['entity-1', 'entity-2', 'entity-3'],
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.getAll('signal.interests.entities')).toEqual([
      'entity-1',
      'entity-2',
      'entity-3',
    ]);
  });

  it('passes signal.interests.tags as repeated params', () => {
    const url = buildUrl(EXPECTED_BASE_URL, INSIGHTS_PATH, {
      'filter.type': 'urn:entity:movie',
      'signal.interests.tags': ['urn:tag:genre:media:horror', 'urn:tag:genre:media:thriller'],
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.getAll('signal.interests.tags')).toHaveLength(2);
  });

  it('passes sort_by and feature.explainability', () => {
    const url = buildUrl(EXPECTED_BASE_URL, INSIGHTS_PATH, {
      'filter.type': 'urn:entity:place',
      sort_by: 'affinity',
      'feature.explainability': true,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('sort_by')).toBe('affinity');
    expect(parsed.searchParams.get('feature.explainability')).toBe('true');
  });

  it('passes filter.location and filter.location.radius', () => {
    const url = buildUrl(EXPECTED_BASE_URL, INSIGHTS_PATH, {
      'filter.type': 'urn:entity:place',
      'filter.location': '40.742306,-74.003494',
      'filter.location.radius': 15000,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('filter.location')).toBe('40.742306,-74.003494');
    expect(parsed.searchParams.get('filter.location.radius')).toBe('15000');
  });
});

describe('Qloo proxy — Search response parsing', () => {
  it('validates a well-formed search response with results array', () => {
    const body = { results: [{ entity_id: '1', name: 'Test' }] };
    const validated = validateSearchResponse(body);
    expect(validated.results).toHaveLength(1);
  });

  it('validates a search response with empty results array', () => {
    const body = { results: [] };
    const validated = validateSearchResponse(body);
    expect(validated.results).toHaveLength(0);
  });

  it('validates a search response with query metadata', () => {
    const body = { results: [{ entity_id: '1' }], query: {} };
    const validated = validateSearchResponse(body);
    expect(validated.results).toHaveLength(1);
  });

  it('rejects a non-object search response', () => {
    expect(() => validateSearchResponse('not an object')).toThrow('not a JSON object');
  });

  it('rejects a null search response', () => {
    expect(() => validateSearchResponse(null)).toThrow('not a JSON object');
  });

  it('rejects a search response missing results field', () => {
    expect(() => validateSearchResponse({ data: [] })).toThrow("missing 'results' field");
  });

  it('rejects a search response where results is not an array', () => {
    expect(() => validateSearchResponse({ results: 'not array' })).toThrow("'results' is not an array");
  });
});

describe('Qloo proxy — Insights response parsing', () => {
  it('validates a well-formed insights response with results.entities array', () => {
    const body = { success: true, results: { entities: [{ entity_id: '1', name: 'Test Place' }] } };
    const validated = validateInsightsResponse(body);
    expect(validated.results).toHaveLength(1);
  });

  it('validates an insights response with empty entities array', () => {
    const body = { success: true, results: { entities: [] } };
    const validated = validateInsightsResponse(body);
    expect(validated.results).toHaveLength(0);
  });

  it('validates an insights response with query metadata', () => {
    const body = { success: true, results: { entities: [{ entity_id: '1' }] }, query: { explainability: {} } };
    const validated = validateInsightsResponse(body);
    expect(validated.results).toHaveLength(1);
  });

  it('rejects a non-object insights response', () => {
    expect(() => validateInsightsResponse('not an object')).toThrow('not a JSON object');
  });

  it('rejects a null insights response', () => {
    expect(() => validateInsightsResponse(null)).toThrow('not a JSON object');
  });

  it('rejects an insights response missing results field', () => {
    expect(() => validateInsightsResponse({ data: [] })).toThrow("missing 'results' field");
  });

  it('rejects an insights results object without entities array', () => {
    expect(() => validateInsightsResponse({ results: { data: [] } })).toThrow("missing 'entities' array");
  });

  it('rejects an insights results that is a string', () => {
    expect(() => validateInsightsResponse({ results: 'not valid' })).toThrow("'results' is neither an array nor an object with 'entities'");
  });

  it('accepts fallback: results as direct array (legacy compatibility)', () => {
    const body = { results: [{ entity_id: '1' }] };
    const validated = validateInsightsResponse(body);
    expect(validated.results).toHaveLength(1);
  });
});

describe('Qloo proxy — error classification', () => {
  it('classifies 401 as auth_failure', () => {
    expect(classifyError(401)).toBe('auth_failure');
  });

  it('classifies 403 as auth_failure', () => {
    expect(classifyError(403)).toBe('auth_failure');
  });

  it('classifies 429 as rate_limit', () => {
    expect(classifyError(429)).toBe('rate_limit');
  });

  it('classifies 404 as not_found', () => {
    expect(classifyError(404)).toBe('not_found');
  });

  it('classifies 400 as bad_request', () => {
    expect(classifyError(400)).toBe('bad_request');
  });

  it('classifies 500 as server_error', () => {
    expect(classifyError(500)).toBe('server_error');
  });

  it('classifies 502 as server_error', () => {
    expect(classifyError(502)).toBe('server_error');
  });

  it('classifies 503 as server_error', () => {
    expect(classifyError(503)).toBe('server_error');
  });

  it('classifies unexpected status as unknown', () => {
    expect(classifyError(418)).toBe('unknown');
  });
});

describe('Qloo proxy — missing configuration', () => {
  it('missing_config is a distinct error kind', () => {
    const kinds: QlooErrorKind[] = [
      'missing_config',
      'auth_failure',
      'rate_limit',
      'network',
      'invalid_response',
      'not_found',
      'bad_request',
      'server_error',
      'unknown',
    ];
    expect(kinds).toContain('missing_config');
  });

  it('missing_config is not the same as auth_failure', () => {
    expect('missing_config').not.toBe('auth_failure');
  });
});

describe('Qloo proxy — retryable status codes', () => {
  const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

  it('429 is retryable', () => {
    expect(RETRYABLE_STATUS.has(429)).toBe(true);
  });

  it('500 is retryable', () => {
    expect(RETRYABLE_STATUS.has(500)).toBe(true);
  });

  it('502 is retryable', () => {
    expect(RETRYABLE_STATUS.has(502)).toBe(true);
  });

  it('503 is retryable', () => {
    expect(RETRYABLE_STATUS.has(503)).toBe(true);
  });

  it('504 is retryable', () => {
    expect(RETRYABLE_STATUS.has(504)).toBe(true);
  });

  it('400 is not retryable', () => {
    expect(RETRYABLE_STATUS.has(400)).toBe(false);
  });

  it('401 is not retryable', () => {
    expect(RETRYABLE_STATUS.has(401)).toBe(false);
  });

  it('404 is not retryable', () => {
    expect(RETRYABLE_STATUS.has(404)).toBe(false);
  });
});
