/**
 * Frontend client for the Qloo proxy edge function.
 * All requests go through the server-side edge function — the API key
 * is never present in the browser bundle.
 */

import type { QlooResult, QlooEntity, QlooError, QlooErrorKind } from '@/types/qloo';

const PROXY_PATH = '/functions/v1/qloo-proxy';

function getProxyUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is not configured');
  return supabaseUrl + PROXY_PATH;
}

function getAuthHeaders(): Record<string, string> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY is not configured');
  return {
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };
}

interface ProxySuccessResponse {
  success: true;
  data: { results: unknown[]; query?: unknown };
  meta: { endpoint: string; statusCode: number; retrievedAt: string; retried: boolean };
}

interface ProxyErrorResponse {
  success: false;
  error: QlooError;
}

type ProxyResponse = ProxySuccessResponse | ProxyErrorResponse;

/**
 * Search for cultural entities by text query.
 * Uses the Qloo GET /search endpoint via the proxy.
 */
export async function searchEntities(
  query: string,
  types?: string[],
  take = 10,
): Promise<QlooResult<QlooEntity[]>> {
  const params = new URLSearchParams();
  params.set('operation', 'search');
  params.set('query', query);
  if (types && types.length > 0) {
    for (const t of types) params.append('types', t);
  }
  params.set('take', String(take));

  try {
    const response = await fetch(`${getProxyUrl()}?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null) as ProxyResponse | null;
      if (body && !body.success) {
        return { success: false, error: body.error };
      }
      return {
        success: false,
        error: {
          kind: 'network' as QlooErrorKind,
          message: `Proxy returned status ${response.status}`,
          statusCode: response.status,
        },
      };
    }

    const body = await response.json() as ProxyResponse;

    if (!body.success) {
      return { success: false, error: body.error };
    }

    const entities = body.data.results as QlooEntity[];
    return { success: true, data: entities };
  } catch (err) {
    return {
      success: false,
      error: {
        kind: 'network' as QlooErrorKind,
        message: err instanceof Error ? err.message : 'Network request failed',
        statusCode: null,
      },
    };
  }
}

/**
 * Retrieve taste-based insights (recommendations) from the Qloo Insights API.
 * Uses the Qloo GET /v2/insights endpoint via the proxy.
 */
export async function getInsights(
  params: {
    filterType: string;
    signalInterestsEntities?: string[];
    signalInterestsTags?: string[];
    filterTags?: string[];
    filterLocation?: string;
    filterLocationQuery?: string;
    take?: number;
    sortBy?: string;
    featureExplainability?: boolean;
  },
): Promise<QlooResult<{ results: QlooEntity[]; meta: ProxySuccessResponse['meta']; query?: unknown }>> {
  const searchParams = new URLSearchParams();
  searchParams.set('operation', 'insights');
  searchParams.set('filter.type', params.filterType);
  if (params.signalInterestsEntities) {
    for (const e of params.signalInterestsEntities) {
      searchParams.append('signal.interests.entities', e);
    }
  }
  if (params.signalInterestsTags) {
    for (const t of params.signalInterestsTags) {
      searchParams.append('signal.interests.tags', t);
    }
  }
  if (params.filterTags) {
    for (const t of params.filterTags) {
      searchParams.append('filter.tags', t);
    }
  }
  if (params.filterLocation) searchParams.set('filter.location', params.filterLocation);
  if (params.filterLocationQuery) searchParams.set('filter.location.query', params.filterLocationQuery);
  if (params.take) searchParams.set('take', String(params.take));
  if (params.sortBy) searchParams.set('sort_by', params.sortBy);
  if (params.featureExplainability) searchParams.set('feature.explainability', 'true');

  try {
    const response = await fetch(`${getProxyUrl()}?${searchParams.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null) as ProxyResponse | null;
      if (body && !body.success) {
        return { success: false, error: body.error };
      }
      return {
        success: false,
        error: {
          kind: 'network' as QlooErrorKind,
          message: `Proxy returned status ${response.status}`,
          statusCode: response.status,
        },
      };
    }

    const body = await response.json() as ProxyResponse;

    if (!body.success) {
      return { success: false, error: body.error };
    }

    const entities = body.data.results as QlooEntity[];
    return { success: true, data: { results: entities, meta: body.meta, query: body.data.query } };
  } catch (err) {
    return {
      success: false,
      error: {
        kind: 'network' as QlooErrorKind,
        message: err instanceof Error ? err.message : 'Network request failed',
        statusCode: null,
      },
    };
  }
}
