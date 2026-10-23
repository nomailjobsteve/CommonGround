/**
 * CommonGround — Qloo Insights API Proxy Edge Function
 *
 * Securely proxies requests to the Qloo Insights API from the browser.
 * The QLOO_API_KEY secret is read server-side and never exposed to the client.
 *
 * Verified against Qloo API documentation and hackathon configuration:
 *   - Hackathon Base URL: https://hackathon.api.qloo.com
 *     (Ref: https://qloo-hackathon.devpost.com/forum_topics/41339)
 *   - Auth header: X-Api-Key
 *   - Insights endpoint: GET /v2/insights
 *   - Search endpoint: GET /search
 *   - Docs: https://docs.qloo.com/reference/insights-api-deep-dive
 *     and https://docs.qloo.com/reference/get-search
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const QLOO_BASE_URL = "https://hackathon.api.qloo.com";
const QLOO_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

type ProxyResponse = {
  success: boolean;
  data?: unknown;
  error?: {
    kind: string;
    message: string;
    statusCode: number | null;
  };
  meta?: {
    endpoint: string;
    statusCode: number;
    retrievedAt: string;
    retried: boolean;
  };
};

function jsonResponse(body: ProxyResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(
  kind: string,
  message: string,
  statusCode: number | null,
  httpStatus: number,
): Response {
  return jsonResponse(
    { success: false, error: { kind, message, statusCode } },
    httpStatus,
  );
}

/**
 * Build a URL with query parameters from a params object.
 * Array values are repeated as separate query keys (Qloo expects this).
 */
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
    } else if (typeof value === "boolean") {
      url.searchParams.set(key, value ? "true" : "false");
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch from Qloo with bounded retries on rate-limit and server errors.
 * Retries use exponential backoff (1s, 2s).
 */
async function fetchQloo(
  url: string,
  apiKey: string,
): Promise<{ response: Response; retried: boolean }> {
  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    "Accept": "application/json",
  };

  let lastResponse: Response | null = null;
  let retried = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      retried = true;
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      const response = await fetchWithTimeout(url, headers, QLOO_TIMEOUT_MS);
      lastResponse = response;

      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
        continue;
      }
      return { response, retried };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        continue;
      }
      const message = err instanceof Error ? err.message : "Network request failed";
      throw new NetworkError(message);
    }
  }

  return { response: lastResponse!, retried };
}

class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * Validate a Qloo Insights response.
 * The live hackathon API returns: { success: true, results: { entities: [...] } }
 * Some responses may also include a top-level `query` object with metadata.
 */
function validateInsightsResponse(body: unknown): { results: unknown[] } {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Response is not a JSON object");
  }
  const obj = body as Record<string, unknown>;
  if (!("results" in obj)) {
    throw new ValidationError("Response missing 'results' field");
  }
  const results = obj.results;

  // Insights API: results is an object with an `entities` array
  if (typeof results === "object" && results !== null && !Array.isArray(results)) {
    const resultsObj = results as Record<string, unknown>;
    if ("entities" in resultsObj && Array.isArray(resultsObj.entities)) {
      return { results: resultsObj.entities as unknown[] };
    }
    // Could be an object with results nested differently
    throw new ValidationError("Insights 'results' object missing 'entities' array");
  }

  // Fallback: results is directly an array (some API versions)
  if (Array.isArray(results)) {
    return { results: results as unknown[] };
  }

  throw new ValidationError("'results' is neither an array nor an object with 'entities'");
}

function validateSearchResponse(body: unknown): { results: unknown[] } {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Response is not a JSON object");
  }
  const obj = body as Record<string, unknown>;
  if (!("results" in obj)) {
    throw new ValidationError("Response missing 'results' field");
  }
  if (!Array.isArray(obj.results)) {
    throw new ValidationError("'results' is not an array");
  }
  return { results: obj.results as unknown[] };
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return errorResponse("bad_request", "Only GET is supported", null, 405);
  }

  const apiKey = Deno.env.get("QLOO_API_KEY");
  if (!apiKey || apiKey.trim().length === 0) {
    return errorResponse(
      "missing_config",
      "QLOO_API_KEY is not configured on the server. Set it as an edge function secret.",
      null,
      500,
    );
  }

  const url = new URL(req.url);
  const operation = url.searchParams.get("operation") || "insights";

  try {
    let response: Response;
    let retried = false;
    let endpoint: string;

    if (operation === "insights") {
      endpoint = "/v2/insights";
      const params: Record<string, string | string[] | number | boolean | undefined> = {
        "filter.type": url.searchParams.get("filter.type") || undefined,
        "signal.interests.entities": url.searchParams.getAll("signal.interests.entities"),
        "signal.interests.tags": url.searchParams.getAll("signal.interests.tags"),
        "filter.tags": url.searchParams.getAll("filter.tags"),
        "filter.location": url.searchParams.get("filter.location") || undefined,
        "filter.location.query": url.searchParams.get("filter.location.query") || undefined,
        "filter.location.radius": url.searchParams.get("filter.location.radius") || undefined,
        "filter.location.metro": url.searchParams.get("filter.location.metro") || undefined,
        "take": url.searchParams.get("take") || undefined,
        "sort_by": url.searchParams.get("sort_by") || undefined,
        "feature.explainability": url.searchParams.get("feature.explainability") || undefined,
      };

      const targetUrl = buildUrl(QLOO_BASE_URL, endpoint, params);
      const result = await fetchQloo(targetUrl, apiKey);
      response = result.response;
      retried = result.retried;
    } else if (operation === "search") {
      endpoint = "/search";
      // The official Qloo docs specify "types" (plural, array of strings).
      // The hackathon host also accepts "type" (singular). We forward as "types"
      // to match the documented contract, accepting both from the caller.
      const typeParams = url.searchParams.getAll("type");
      const typesParams = url.searchParams.getAll("types");
      const entityTypes = typesParams.length > 0 ? typesParams : typeParams;
      const params: Record<string, string | string[] | number | boolean | undefined> = {
        "query": url.searchParams.get("query") || undefined,
        "types": entityTypes.length > 0 ? entityTypes : undefined,
        "filter.tags": url.searchParams.getAll("filter.tags"),
        "take": url.searchParams.get("take") || undefined,
      };

      const targetUrl = buildUrl(QLOO_BASE_URL, endpoint, params);
      const result = await fetchQloo(targetUrl, apiKey);
      response = result.response;
      retried = result.retried;
    } else {
      return errorResponse("bad_request", `Unknown operation: ${operation}`, null, 400);
    }

    if (response.status === 401 || response.status === 403) {
      return errorResponse(
        "auth_failure",
        "Qloo API rejected the API key. Verify QLOO_API_KEY is valid.",
        response.status,
        response.status,
      );
    }

    if (response.status === 429) {
      return errorResponse(
        "rate_limit",
        "Qloo API rate limit exceeded. Try again later.",
        response.status,
        response.status,
      );
    }

    if (response.status === 404) {
      return errorResponse(
        "not_found",
        "No results found for the given query parameters.",
        response.status,
        response.status,
      );
    }

    if (response.status === 400) {
      const errorBody = await response.text().catch(() => "Bad request");
      return errorResponse(
        "bad_request",
        `Qloo API rejected the request: ${errorBody}`,
        response.status,
        response.status,
      );
    }

    if (response.status >= 500) {
      return errorResponse(
        "server_error",
        `Qloo API returned a server error (status ${response.status}).`,
        response.status,
        502,
      );
    }

    if (!response.ok) {
      return errorResponse(
        "unknown",
        `Qloo API returned an unexpected status: ${response.status}`,
        response.status,
        response.status,
      );
    }

    const body = await response.json();

    try {
      if (operation === "insights") {
        const validated = validateInsightsResponse(body);
        return jsonResponse(
          {
            success: true,
            data: { results: validated.results, query: (body as Record<string, unknown>).query },
            meta: {
              endpoint,
              statusCode: response.status,
              retrievedAt: new Date().toISOString(),
              retried,
            },
          },
          200,
        );
      } else {
        const validated = validateSearchResponse(body);
        return jsonResponse(
          {
            success: true,
            data: { results: validated.results },
            meta: {
              endpoint,
              statusCode: response.status,
              retrievedAt: new Date().toISOString(),
              retried,
            },
          },
          200,
        );
      }
    } catch (validationErr) {
      return errorResponse(
        "invalid_response",
        validationErr instanceof Error ? validationErr.message : "Invalid response structure",
        response.status,
        502,
      );
    }
  } catch (err) {
    if (err instanceof NetworkError) {
      return errorResponse(
        "network",
        `Failed to reach Qloo API: ${err.message}`,
        null,
        504,
      );
    }
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return errorResponse("unknown", message, null, 500);
  }
});
