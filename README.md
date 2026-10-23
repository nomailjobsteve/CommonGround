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

1. **Group creation** — name the group and add members.
2. **Member profiles** — each member lists cultural interests (music, movies,
   food, books, etc.), budget preferences, and accessibility needs.
3. **Discovery** — Qloo's Insights API analyzes cross-domain affinities across
   the group's interests and retrieves candidate experiences.
4. **Decision trace** (planned) — a transparent panel showing which evidence
   informed each recommendation.

## Architecture

### Frontend

- **React 18 + TypeScript + Vite** — single-page application.
- **Tailwind CSS** — styling with a custom editorial design system.
- **Feature-oriented structure:**
  - `src/types/` — domain models (group, cultural, discovery, Qloo).
  - `src/components/` — UI components (Landing, GroupCreation, DiscoveryWorkspace).
  - `src/lib/` — Supabase client and Qloo proxy client.
  - `src/services/` — discovery orchestrator interfaces (for later phases).
  - `src/test/` — automated tests.

### Backend

- **Supabase** — database, auth, and edge functions.
- **Edge function (`qloo-proxy`)** — securely proxies Qloo API requests.
  The `QLOO_API_KEY` secret lives server-side and is never exposed to the
  browser.

### Qloo integration

The Qloo Insights API is called exclusively through the `qloo-proxy` edge
function. The frontend never sends API keys or calls Qloo directly.

**Verified Qloo API details (Phase 1.5 — live verified):**
- Hackathon Base URL: `https://hackathon.api.qloo.com`
  (Ref: https://qloo-hackathon.devpost.com/forum_topics/41339)
- Authentication: `X-Api-Key` header (not Bearer, not query param)
- Insights endpoint: `GET /v2/insights` — taste-based recommendations
  - Response shape: `{ success: true, results: { entities: [...] } }`
  - Entity identifier field: `entity_id`
  - Requires at least one signal or filter (e.g. `filter.tags` or `signal.interests.entities`)
- Search endpoint: `GET /search` — entity lookup by name
  - Response shape: `{ results: [...] }`
  - Entity identifier field: `entity_id`
  - Uses `type` (singular) parameter per hackathon organizer's example
- Docs: https://docs.qloo.com/reference/insights-api-deep-dive
  and https://docs.qloo.com/reference/get-search

**Live verification (2026-10-23):**
- Search: VERIFIED — query "jazz" with type `urn:entity:artist` returned 3 real
  entities (Jazzanova, Jazzamor, Jazz Liberatorz) from `/search` (HTTP 200).
- Insights: VERIFIED — `filter.type=urn:entity:place` with
  `filter.tags=urn:tag:genre:place:restaurant:italian` returned 3 real entities
  (Terraço Itália, Bocconcino, Eataly Flatiron) from `/v2/insights` (HTTP 200).

The edge function implements:
- Server-side API key reading from `QLOO_API_KEY` secret.
- Request validation and parameter forwarding.
- 10-second timeout per request.
- Bounded retries (2 max) with exponential backoff on 429/5xx.
- Response validation (must contain `results` array).
- Normalized error handling for: missing config, auth failure, rate limit,
  network, invalid response, not found, bad request, server error.
- No fabricated results — failures return error states.

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
   or via `mcp__supabase__list_edge_function_secrets` to verify).

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

## Capabilities — complete vs. planned

### Complete (Phase 1)

- [x] Polished, responsive landing page with editorial design.
- [x] Guided group-creation flow (name → members → review).
- [x] Member profile interface with cultural interests, budget, accessibility.
- [x] Qloo entity search during interest entry (real API calls via proxy).
- [x] Discovery workspace with Qloo connection verification.
- [x] Server-side Qloo proxy edge function with auth, retries, validation.
- [x] Normalized error handling (no fabricated results).
- [x] Decision trace panel design (structural preview).
- [x] Domain type definitions for all core models.
- [x] Discovery orchestrator interfaces for later phases.
- [x] Automated tests for domain models, Qloo types, error normalization.
- [x] README and `.env.example`.

### Planned (later phases)

- [ ] Entity resolution (matching user input to Qloo entities at scale).
- [ ] Group preference comparison across members.
- [ ] Consensus ranking with explicit scoring inputs.
- [ ] Experience planning (itineraries, logistics).
- [ ] Full decision trace generation with explainability data.
- [ ] Database persistence of groups and discovery runs.
- [ ] Multi-user authentication.

## Remaining limitations

- Group and member data is held in browser state (not yet persisted to the
  database). Phase 2 will add Supabase persistence.
- Entity resolution is limited to the search endpoint's fuzzy matching.
  Full resolution with disambiguation is planned.
- Consensus ranking is not yet implemented — candidates are shown in
  Qloo's affinity order only.
- The decision trace panel shows a structural preview; full trace generation
  requires the agent orchestration layer (Phase 2+).

## Tech stack

- React 18, TypeScript 5, Vite 7
- Tailwind CSS 3
- Supabase (database, edge functions, auth)
- Qloo Insights API v2
- Vitest (testing)
- Lucide React (icons)
