# CommonGround

**Find what your group has in common — even when nobody agrees.**

CommonGround helps groups of people with different cultural interests discover
shared experiences. Its core differentiator is Qloo's cultural intelligence API:
the application uses real Qloo API responses to identify meaningful cross-domain
connections rather than generating generic recommendations.

## Product overview

CommonGround addresses the group decision problem: when friends, families, or
colleagues have diverse tastes, finding activities everyone enjoys is hard.
The app guides users through:

1. **Group creation** — name the group, add members, and enter a destination city.
2. **Member profiles** — each member lists cultural interests (music, movies,
   food, books, etc.) by searching Qloo's entity database. Budget preferences
   and accessibility needs are also captured.
3. **Discovery** — a bounded agent orchestrates per-member Qloo Insights queries
   scoped to the destination, merges and deduplicates candidates, ranks them by
   group consensus (70% member coverage + 30% rank support), optionally runs an
   adaptive exploration pass, and finally runs a group-level Taste Bridge query
   that combines all members' interests in a single request.
4. **Decision trace** — a transparent panel showing each pipeline step with real
   status, counts, and evidence references.

### Taste Bridge

Taste Bridge is CommonGround's group-level discovery layer. After per-member
retrieval completes, the agent makes one additional Qloo Insights request using
a balanced, deduplicated set of up to 12 resolved entity IDs (max 3 per member)
from across the group. This surfaces destination-specific places that individual
member queries may not find. Key properties:

- **Exactly one** group-level request per discovery run (when 2+ members have
  resolved interests).
- Results are kept **completely separate** from Shared/Individual consensus
  candidates — they never inflate shared counts, coverage, or consensus scores.
- When Qloo returns explainability data, contributing input interests are mapped
  back to the specific members whose tastes drove the recommendation.
- If the request fails, member-specific results remain fully available, and a
  retry button re-runs only the group-level operation.
- The destination is always preserved — Taste Bridge never falls back to global
  results when a destination is set.

## Architecture

### Frontend

- **React 18 + TypeScript + Vite** — single-page application.
- **Tailwind CSS** — styling with a custom editorial design system.
- **Feature-oriented structure:**
  - `src/types/` — domain models (group, cultural, discovery, Qloo).
  - `src/components/` — UI components (Landing, GroupCreation, DiscoveryWorkspace).
  - `src/lib/` — Supabase client and Qloo proxy client.
  - `src/services/` — discovery orchestrator agent and interfaces.
  - `src/test/` — automated tests (219 tests across 8 suites).

### Backend

- **Supabase** — database, auth, and edge functions.
- **Edge function (`qloo-proxy`)** — securely proxies Qloo API requests.
  The `QLOO_API_KEY` secret lives server-side and is never exposed to the
  browser.

### Qloo integration

The Qloo Insights API is called exclusively through the `qloo-proxy` edge
function. The frontend never sends API keys or calls Qloo directly.

**Verified Qloo API details:**
- Hackathon Base URL: `https://hackathon.api.qloo.com`
- Authentication: `X-Api-Key` header (not Bearer, not query param)
- Insights endpoint: `GET /v2/insights` — taste-based recommendations
  - Response shape: `{ success: true, results: { entities: [...] }, query: { ... } }`
  - The `query` object may contain `explainability` data with
    `signal.interests.entities.effect_on_all_recs` mapping input entities to
    influence scores.
  - Entity identifier field: `entity_id`
  - Requires at least one signal or filter
- Search endpoint: `GET /search` — entity lookup by name
  - Response shape: `{ results: [...] }`
  - Entity identifier field: `entity_id`
- Docs: https://docs.qloo.com/reference/insights-api-deep-dive
  and https://docs.qloo.com/reference/get-search

The edge function implements:
- Server-side API key reading from `QLOO_API_KEY` secret.
- Request validation and parameter forwarding.
- 10-second timeout per request.
- Bounded retries (2 max) with exponential backoff on 429/5xx.
- Response validation and normalized error handling.
- Pass-through of `query` (including explainability) to the client.
- No fabricated results — failures return error states.

### Discovery agent pipeline

The agent (`src/services/discovery-agent.ts`) runs a deterministic pipeline:

1. **Assess & plan** — evaluates resolved vs. unresolved interests, builds a
   per-member retrieval plan.
2. **Per-member retrieval** — concurrent Qloo Insights queries (max 3 entities
   per member, bounded to 3 concurrent requests), scoped to the destination.
3. **Merge & normalize** — deduplicates candidates by entity ID.
4. **Consensus ranking** — scores each candidate by member coverage (70%) and
   rank support (30%).
5. **Adaptive exploration** — if coverage is low, retries weak members with
   unused entity IDs.
6. **Taste Bridge** — one group-level query with combined interests (max 12 IDs).
7. **Finalize** — produces typed outcome with ranked candidates, trace, warnings,
   and Taste Bridge results.

## Environment variables

### Frontend (exposed to browser — safe, public values)

Set in `.env`:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public, safe for client) |

### Server-side secrets (NOT in `.env`, NOT in client bundle)

| Secret | Description |
|---|---|
| `QLOO_API_KEY` | Qloo API key, configured as an edge function secret |

**The Qloo API key is never exposed to the frontend.** It is read exclusively
by the edge function from the server-side secret store.

See `.env.example` for placeholder templates.

## Local setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the Supabase values (these are
   pre-populated in the Bolt environment):
   ```
   cp .env.example .env
   ```

3. Configure the `QLOO_API_KEY` edge function secret (in the Supabase dashboard
   or via the Supabase MCP tools).

4. Run the dev server:
   ```
   npm run dev
   ```

5. Build for production:
   ```
   npm run build
   ```

6. Run tests:
   ```
   npm test
   ```

7. Type check:
   ```
   npm run typecheck
   ```

8. Lint:
   ```
   npm run lint
   ```

## Deployment

CommonGround deploys via Bolt's hosting. The edge function is deployed using
the Supabase MCP tools. No additional external services are required beyond
Supabase (included) and a Qloo API key (server-side secret).

## Capabilities

### Complete

- [x] Polished, responsive landing page with editorial design.
- [x] Guided 4-step group-creation flow (name → members → destination → review).
- [x] Member profile interface with Qloo entity search, budget, accessibility.
- [x] Discovery agent with per-member Qloo Insights retrieval.
- [x] Consensus ranking (70% member coverage + 30% rank support).
- [x] Adaptive exploration pass for low-coverage results.
- [x] Taste Bridge group-level discovery with explainability mapping.
- [x] All, Shared, Individual, and Taste Bridge filter views.
- [x] Decision trace panel with live execution updates.
- [x] Server-side Qloo proxy edge function with auth, retries, validation.
- [x] Normalized error handling (no fabricated results).
- [x] Image handling with graceful fallbacks.
- [x] 219 automated tests across 8 test suites.
- [x] README and `.env.example`.

### Planned

- [ ] Database persistence of groups and discovery runs.
- [ ] Multi-user authentication.
- [ ] Experience planning (itineraries, logistics).

## Known limitations

- Group and member data is held in browser state (not yet persisted to the
  database). Refreshing the page resets the session.
- Entity resolution is limited to the search endpoint's fuzzy matching.
- Qloo explainability data availability depends on the API response — when not
  returned, the UI shows a "per-interest explanation was not returned" note
  rather than fabricating evidence.

## Tech stack

- React 18, TypeScript 5, Vite 7
- Tailwind CSS 3
- Supabase (database, edge functions, auth)
- Qloo Insights API v2
- Vitest (testing)
- Lucide React (icons)

## License

MIT
