# I AM [RESIST] — site (App Router rebuild)

Production-facing Next.js app for **[iamresist.org](https://www.iamresist.org)**: independent media hub (intel / voices / newswire / journal / book club), vinyl shop (Stripe + Printify), and editorial tooling backed by **Notion** and **Supabase**.

This repository is the **structured rebuild** of an earlier organically grown codebase. Same public URLs and behavior bar, clearer domain boundaries, App Router patterns, and production-grade security headers.

Repository-specific Codex/editorial guidance lives in [AGENTS.md](./AGENTS.md).

---

## Stack

| Layer | Choice |
|--------|--------|
| Framework | **Next.js 15** (App Router), React 19 |
| Styling | **Tailwind CSS** 4 |
| Content | **Notion** (databases for journal, voices, book club, curated articles/videos, protest music) |
| Commerce | **Stripe** (checkout + webhooks), **Printify** (fulfillment + webhooks) |
| Data / orders | **Supabase** (Postgres) |
| Feeds | **rss-parser**, cached RSS + optional HTML `og:image` enrichment for newswire |
| Tests | **Vitest**; CI via **GitHub Actions** |

---

## Architecture (where things live)

- **`app/(site)/`** — Public routes grouped under the shared site layout (shop, voices, journal, book-club, intel, etc.).
- **`app/api/`** — Route handlers: checkout, webhooks, feeds, revalidation, cron, orders.
- **`components/`** — UI by area: `layout/`, `home/`, `voices/`, `shop/`, `newswire/`, `bookclub/`, shared hooks at **`components/use*.js`** (single implementations).
- **`context/`** — Client cart (`CartContext`).
- **`lib/`** — Server-first logic:
  - **`lib/notion/`** — Notion clients and repos.
  - **`lib/feeds/`** — RSS, homepage intel, unified archive, newswire + OG image enrichment.
  - **`lib/server/`** — Validators, rate limits, checkout helpers.
  - **`lib/env/`** — Typed env slices merged in **`lib/env.js`** (`site`, `db`, `shop`, `ops`).
- **`public/`** — Static assets (PWA icons, shop art, OG fallbacks).
- **`docs/rebuild/`** — Historical rebuild notes (strategy / audits); not required reading to run the app.

---

## Data flow (high level)

1. **Notion** — Editors manage voices, journal posts, book club, curated videos/music, and optional curated newswire rows. Server code in `lib/notion/*` maps pages into app models.
2. **Caching** — `unstable_cache` + `fetch` tags power ISR-style revalidation; **`POST /api/revalidate`** invalidates by tag (secured with `CRON_SECRET`).
3. **RSS newswire** — Configured sources in `lib/data/newswire-sources.js` → `fetchFeedItems` → normalization; tiny Haaretz thumbs are dropped and **`lib/feeds/ogImage.js`** can fetch article `og:image` when the feed has no usable image.
4. **Shop** — `lib/shopProducts.js` + `lib/config/products.js` define catalog and Stripe price IDs; checkout creates Stripe sessions server-side; webhooks update Supabase order state and trigger emails when configured.

---

## API routes

| Route | Role |
|--------|------|
| `POST /api/checkout` | Create Stripe Checkout session from cart JSON |
| `POST /api/webhooks/stripe` | Stripe events (payments, etc.) |
| `POST /api/webhooks/printify` | Printify order lifecycle (signed in production) |
| `GET /api/voices-feed` | Aggregated voices feed (cached) |
| `GET /api/voices-archive` | Paginated archive + filters |
| `GET /api/voices-more` | Per-voice or curated bucket extras for inline player |
| `POST /api/revalidate` | On-demand tag revalidation (`Authorization: Bearer CRON_SECRET`) |
| `GET /api/cron/ingest-signal` | Ingest intel sources into `intel.source_items`; revalidates `intel-live` |
| `GET /api/cron/keep-alive` / `warm-home` | Scheduled warmers (protect with `CRON_SECRET` where configured) |
| `GET /api/orders/[id]` | Order status (token-gated) |
| `GET /api/printify/list-*` | Operational helpers for Printify (token/server use) |

Rate limits apply to selected public JSON routes (see `lib/server/rateLimit.js`).

---

## Environment variables

Values are read through **`lib/env/*`** (merged in **`lib/env.js`**). Below is a practical checklist; see each file for exact names and fallbacks.

**Site / ops** (`lib/env/site.js`, `lib/env/ops.js`)

- `NEXT_PUBLIC_BASE_URL` — Canonical site URL (default aligns with production).
- `ORDER_STATUS_SECRET` — HMAC for public order status links.
- `CRON_SECRET` — Bearer token for `/api/revalidate` and cron routes that require it.
- `ALLOW_UNSIGNED_PRINTIFY_WEBHOOKS` — Dev-only escape hatch for Printify webhooks; never enable in production.

**Notion** (`lib/env/notion.js`)

- `NOTION_API_KEY`
- `NOTION_JOURNAL_DB_ID`, `NOTION_VOICES_DB_ID`, `NOTION_CURATED_ARTICLES_DB_ID`, `NOTION_BOOKS_DB_ID`, `NOTION_CURATED_VIDEOS_DB_ID`, `NOTION_PROTEST_MUSIC_DB_ID`
- `NOTION_WEEKLY_BRIEFS_DB_ID`
- Reading journal / entries: `NOTION_ENTRIES_DATABASE_ID` (or aliases noted in that module)
- Weekly Brief AI draft route prefers `OPENROUTER_API_KEY` plus `OPENROUTER_MODEL` or `WEEKLY_BRIEF_DRAFT_MODEL`
- Fallback support remains for `OPENAI_API_KEY` plus optional `WEEKLY_BRIEF_DRAFT_MODEL`

**Weekly Brief AI draft contract**

- Weekly Brief AI drafting uses the **Notion page body** as the thought-dump source.
- Row-level `thoughtDump` properties may still exist in code for compatibility, but they are **not** used by the AI drafting route.
- `selectedCandidateIds` are the primary candidate-selection mechanism.
- Body URL matching is **fallback-only** when explicit `selectedCandidateIds` are absent.
- Weekly candidate matches are **optional enrichment**, not a drafting requirement. If nothing matches, the draft is still generated from the Notion page body alone.
- `AI Draft` is the only required persisted field written back for this slice.
- When `OPENROUTER_API_KEY` is present, the Weekly Brief draft route uses OpenRouter before falling back to direct OpenAI.

**Supabase** (`lib/env/db.js`)

- `SUPABASE_URL` (or documented alternates)
- `SUPABASE_SERVICE_ROLE_KEY`

**OSINT intel desk**

- Apply intel SQL migrations in timestamp order (through `20260418201000_intel_source_items_desk_lane_extend.sql` so `source_items.desk_lane` allows new lanes; earlier `20260418120000_*` adds `source_family` and extends `sources.desk_lane` only). Earlier files include `20260412120000_intel_milestone1.sql`, `20260412140000_intel_live_desk_snapshot.sql`, `20260412150000_intel_milestone1_5_governance.sql`, `20260412160000_intel_milestone1_75_relevance.sql`, and `20260412170000_intel_source_lanes_content_use.sql`. Source registry and content-use policy: [`docs/intel/public-sources.md`](docs/intel/public-sources.md).
- **Required:** Supabase **Project Settings → API → Exposed schemas** must include **`intel`** (not only `public`). Without this, the API returns `Invalid schema: intel` and `/intel/osint` cannot load.
- Optional wire feeds (omit both if blocked — ingest skips them; no silent downgrade): `INTEL_REUTERS_RSS_URL`, `INTEL_AP_RSS_URL`
- Optional: `INTEL_DESK_STALE_AFTER_MINUTES` (default `90`) — OSINT desk and `/intel/sources` health use this staleness window.
- Cron: `GET /api/cron/ingest-signal` with `Authorization: Bearer CRON_SECRET` (same secret as `/api/revalidate`).
  - **Endpoint**: `GET /api/cron/ingest-signal`
  - **Auth header**: `Authorization: Bearer <CRON_SECRET>`
  - **CRON_SECRET requirement**: must be non-empty after trim; otherwise the endpoint returns **500** (`CRON_SECRET is not configured`).
  - **Unauthorized failure mode**: if the header does not exactly match, the endpoint returns **401** (`Unauthorized`).
  - **Job failure mode**: if `runIntelIngest()` throws or overall ingest is `failed`, the endpoint returns **500** with `overallStatus: failed`.
  - **Cadence assumption**: schedule it more frequently than `INTEL_DESK_STALE_AFTER_MINUTES` (default 90m), otherwise the desk and `/intel/sources` will show **stale**.

**Stripe / Printify / email** (`lib/env/shop.js`, `lib/env/site.js`)

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PRICE_ID_*` — Price IDs per product line (see `lib/shopProducts.js` / `lib/config/products.js`)
- `PRINTIFY_API_TOKEN`, `PRINTIFY_SHOP_ID`, `PRINTIFY_WEBHOOK_SECRET`, `PRINTIFY_PRODUCT_ID` (as needed)
- `RESEND_API_KEY`, `ORDER_FROM_EMAIL`, `ORDER_FROM_NAME` (transactional email when enabled)

Copy from a secure vault; do not commit `.env.local`.

---

## Local development

```bash
npm ci
# Create .env.local using the Environment variables section below (and lib/env/* for exact keys).
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Turbopack is enabled in the dev script.

**Build without full secrets:** `next build` is intended to succeed with missing Stripe/Notion values where modules allow; runtime routes will error clearly if required secrets are absent.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (Node env) |
| `npm run test:watch` | Vitest watch |

---

## Testing and CI

- **Vitest** config: `vitest.config.mjs` (path alias `@` → project root; `server-only` stubbed for tests under `tests/stubs/`).
- **Smoke route test** (`tests/smokeRoutes.test.js`) is skipped unless `SMOKE_BASE_URL` points at a running deployment.
- **GitHub Actions** (`.github/workflows/ci.yml`): `npm ci` → `lint` → `test` → `build` on `main`.

---

## Deployment (typical: Vercel)

1. Set all production env vars in the host dashboard.
2. Configure **Stripe** and **Printify** webhook URLs to this deployment’s `/api/webhooks/*` endpoints.
3. Point **cron** or external schedulers at `keep-alive` / `warm-home` if you use them, with the same `CRON_SECRET` pattern as in code.
4. **`next.config.mjs`** ships CSP, HSTS, frame/options headers, image `remotePatterns`, and cron-friendly rewrites—review before changing third-party embeds or image hosts.

---

## Security notes

- Webhooks verify signatures in production (`Stripe`, `Printify`).
- `POST /api/revalidate` requires `Authorization: Bearer <CRON_SECRET>`.
- Order status and similar flows use server-side secrets; do not expose service keys to the client.

---

## License / content

Site content and branding are project-specific; respect the mission and third-party terms for syndicated feeds and embeds.
