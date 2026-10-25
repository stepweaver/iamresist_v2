# Intel public sources registry

This document mirrors the **version-controlled manifest** in [`lib/intel/signal-sources.ts`](../../lib/intel/signal-sources.ts) and the synced rows in Supabase `intel.sources`. It explains **why each source exists**, **how it is acquired**, and the **content-use posture** (preview vs metadata-only).

## Troubleshooting ingest

- **`source_items_desk_lane_check` on upsert:** Postgres still has the old `osint|voices` check on **`intel.source_items`**. Apply [`20260418201000_intel_source_items_desk_lane_extend.sql`](../../supabase/migrations/20260418201000_intel_source_items_desk_lane_extend.sql) in the Supabase SQL Editor (this is separate from extending `intel.sources` in `20260418120000`).
- **BLS schedule “0 article links”:** Schedule pages often use **root-relative** links (`href="/news.release/..."`). Ingest passes the fetch `finalUrl` as `baseUrl` so those resolve; ensure you are on a build that includes that parser behavior.

## Principles

- **No paid wire APIs** in this milestone; optional Reuters/AP remain env-gated RSS URLs only.
- **No full article HTML mirroring**; RSS/JSON and **`html_index`** only extract listing metadata and canonical URLs (titles may be slug-derived for index-only sources).
- **Canonical outbound links** are always stored; the site is a **discovery layer**, not a full-text mirror.

## Content use modes (`content_use_mode`)

| Mode | Meaning |
|------|--------|
| `metadata_only` | Title, URL, timestamps; summary forced null at ingest. |
| `feed_summary` | Strip HTML, cap length (~560 chars) from feed snippet/description. |
| `preview_and_link` | Tighter cap (~320 chars); UI stresses reading at source. |
| `full_text_if_feed_includes` | Escape hatch: allow longer feed-provided text only when explicitly trusted (unused for most majors). |
| `manual_review` | Registry-only; no automated fetch (paired with `unsupported` or disabled sources). |

## Desk lanes (`desk_lane`)

| Lane | Route | Role |
|------|--------|------|
| `osint` | `/intel/osint` | Core U.S. institutional stack: WH, FR, GovInfo, courts/specialist legal accountability. |
| `defense_ops` | retired (`/intel/defense` → `/intel/watchdogs`) | Defense desk retired. Source rows stay disabled so historical items remain attached. Ingest does not fetch them. |
| `watchdogs` | `/intel/watchdogs` | Foreign independent and investigative outlets; lead slots require corroboration rules. |
| `indicators` | `/intel/indicators` | Scheduled macro/statistical releases (BLS/BEA HTML index), placeholders (SAM/OFAC), anecdotal registry rows. |
| `statements` | retired (`/intel/claims` → `/intel/osint`, `/intel/statements` → `/telescreen`) | Claims desk retired. Placeholder rows stay disabled. |
| `voices` | retired (`/intel/voices` → `/telescreen`) | Intel Voices RSS desk is retired. Historical `intel` rows remain. Notion Telescreen creators are a separate system and stay active. |

The curated **Telescreen** lives at **`/telescreen`** (`/voices` and `/intel/voices` redirect there).

## Source families (`source_family`)

Mirrored from the manifest for ops and promotion logic (Postgres `intel.sources.source_family`):

| Value | Typical use |
|------|----------------|
| `general` | Legacy default / undifferentiated OSINT or voices. |
| `congress_primary` | Structured Congress.gov v3 primary records: bills, committee meetings, summaries, House votes, CRS reports. |
| `defense_primary` | Official U.S. military press (e.g. war.gov RSS). |
| `combatant_command` | Combatant-command surfaces (reserved for future feeds). |
| `defense_specialist` | Specialist maritime/posture context (e.g. USNI listing). |
| `watchdog_global` | Independent cross-border reporting on the Watchdogs desk. |
| `indicator_hard` | Scheduled releases / structured contracting placeholders. |
| `indicator_soft` | Reserved for softer thermometers. |
| `indicator_anecdotal` | Registry-only anecdotal signals (e.g. pizza index placeholder); never auto-ingested by default. |
| `claims_public` | Statements lane: public claims / future adapters; high-friction trust posture. |

## Fetch kinds (`fetch_kind`)

| Kind | Automated fetch? |
|------|------------------|
| `rss` | Yes — XML/RSS or Atom via `rss-parser`. |
| `podcast_rss` | Yes — same parser; episode link/enclosure handled conservatively. |
| `json_api` | Yes — Federal Register JSON today. |
| `congress_api` | Yes — Congress.gov v3 JSON with `CONGRESS_GOV_API_KEY` appended only at request time; the key is never stored in `intel.sources.endpoint_url` or ingest metadata. |
| `unsupported` | No — honest registry placeholder. |
| `html_index` | Yes — fetches a public listing page and extracts canonical article URLs (e.g. Democracy Docket `/news-alerts/`). |
| `manual` / `newsletter_only` / `scrape` | No — reserved (or not wired for automated ingest yet). |

### Environment variables (optional feeds)

| Variable | Used by |
|----------|---------|
| `CONGRESS_GOV_API_KEY` | Enables Congress.gov v3 structured ingestion (recent bills, House and Senate committee meetings, bill summaries, House votes, CRS reports). If unset, those manifest rows stay disabled and are **omitted from `/intel/sources`**. They are not broken feeds. |

## Public Sources page

`/intel/sources` lists only sources that are enabled in the manifest and on the OSINT or Watchdogs lanes. Retired Defense, CENTCOM, Rappler, Claims, Intel Voices, disabled placeholders, and unconfigured Congress.gov rows are not shown. Their `intel.sources` rows and historical `intel.source_items` stay in the database. Ingest sync upserts `is_enabled: false` for retired manifest rows and does not delete them.

### Enable Congress.gov internally

The integration code (`lib/intel/congressGov.ts`) and the six source definitions in `lib/intel/signal-sources.ts` stay available while `CONGRESS_GOV_API_KEY` is unset.

1. Set `CONGRESS_GOV_API_KEY` in the deploy environment.
2. Run ingest once (`GET /api/cron/ingest-signal` with `Authorization: Bearer CRON_SECRET`, or the existing ingest cron).
3. `syncIntelSourcesFromManifest()` sets `intel.sources.is_enabled` for those slugs. The key is appended only inside the fetch helper and is redacted from ingest metadata.

After that sync, the six Congress.gov sources appear on `/intel/sources` with the other active OSINT sources. Do not add them to the public page while they are disabled.

## Source list (slug → summary)

### Core primaries & records (OSINT)

| Slug | Feed-native? | Default on | Notes |
|------|----------------|------------|-------|
| `wh-news` | RSS | yes | White House news feed. |
| `wh-presidential` | RSS | yes | Presidential actions feed. |
| `fr-public-inspection` | JSON API | yes | FR public inspection. An empty list after midnight Eastern, on weekends, or on federal holidays is a valid empty response (`pil_unavailability_message`), not a parser failure. |
| `fr-published` | JSON API | yes | Published FR documents. |
| `govinfo-bills` | RSS | yes | GovInfo bills RSS. |
| `govinfo-crec` | RSS | yes | Full Congressional Record RSS (high volume). |
| `congress-bills-recent` | `congress_api` | env | Congress.gov v3 recent bill/action/text metadata; source of structured bill keys. |
| `congress-committee-meetings-house` | `congress_api` | env | House hearings/meetings/markups, witness lists, witness statements, related bills when present. |
| `congress-committee-meetings-senate` | `congress_api` | env | Senate hearings/meetings and related metadata. |
| `congress-summaries` | `congress_api` | env | CRS-written bill summaries; context/enrichment, not a breaking-action substitute. |
| `congress-house-votes` | `congress_api` | env | House roll-call vote primary records. |
| `congress-crs-reports` | `congress_api` | env | CRS reports; contextual primary research products with related bill links when available. |

### Congress.gov trust boundaries

- Congress.gov API rows are **primary records for congressional metadata**: bill identifiers, committee meeting status, witness/document links, bill summaries, House roll-call votes, and CRS report metadata.
- Congress.gov rows do **not** prove claims made by members, witnesses, agencies, creators, or press releases. Those claims still need primary documents or trusted reporting.
- Trusted creators can help discover a congressional lead, but creator/social/video signals are **not proof** and do not count as independent corroboration. A creator signal may receive a bounded boost only when the same story cluster includes a primary Congress.gov record or trusted reporting.
- `congress_api` requests append `CONGRESS_GOV_API_KEY` inside the fetch helper. Ingest metadata redacts request URLs so secrets do not leak through logs, `intel.sources`, or `intel.ingest_runs.meta`.

### Optional wires (OSINT)

| Slug | Feed-native? | Default on | Notes |
|------|----------------|------------|-------|
| `reuters-wire` | RSS if `INTEL_REUTERS_RSS_URL` | env | Fail-closed when unset. |
| `ap-wire` | RSS if `INTEL_AP_RSS_URL` | env | Fail-closed when unset. |

### Specialist / reporting / accountability (OSINT)

| Slug | Feed-native? | Default on | Content posture |
|------|----------------|------------|-----------------|
| `scotusblog` | RSS | yes | `feed_summary` |
| `democracy-docket` | `html_index` (`/news-alerts/` listing) | yes | `feed_summary` — titles from URL slugs; no RSS |
| `lawfare` | RSS | yes | `feed_summary`. `https://www.lawfaremedia.org/feeds/articles` is the working publisher feed (HTTP 200). An empty channel is valid; on 2026-10-25 it also returned a current article. Other paths are Cloudflare 403. |
| `propublica` | RSS | yes | `feed_summary` |
| `american-oversight` | RSS | yes | `feed_summary`. Default `/feed/` is an empty `post` channel. Ingest uses the custom-post-type publisher RSS (analysis, investigation, litigation, press-release, newsletter, reports-and-features). |
| `doj-oig` | RSS | yes | `feed_summary` — primary DOJ IG oversight artifacts (audits/reports). |
| `just-security` | RSS | yes | `feed_summary` — specialist analysis w/ primary-document links. |
| `campaign-legal-center` | RSS | yes | `feed_summary` — election integrity litigation/analysis; verify via filings + independent reporting. |
| `courier-the-cover-up` | RSS | yes | `preview_and_link` — working Substack feed for the COURIER Cover-Up / Epstein accountability project. |
| `uncovering-epstein-network` | RSS (`/feed/`) | **no** (disabled) | `preview_and_link` — registry only; site feed parses to 0 items here; do not run parallel to Substack without dedupe. |

### Creator / commentary (Intel Voices) — retired

These Substack feeds stay in the manifest with `is_enabled: false`. The next ingest sync marks them disabled and does not fetch them. Specialist Substack sources on other desks, including `courier-the-cover-up`, are unchanged.

| Slug | Feed-native? | Default on | Content posture |
|------|----------------|------------|-----------------|
| `robert-reich` | Substack RSS | **no** | Retired. Historical rows kept. |
| `g-elliott-morris` | Substack RSS | **no** | Retired. Historical rows kept. |
| `on-offense-kris-goldsmith` | Substack RSS | **no** | Retired. Historical rows kept. |
| `total-hypocrisy` | Substack RSS | **no** | Retired. Historical rows kept. |

### Defense (`defense_ops`) — retired

These rows stay in the manifest with `is_enabled: false`. The next ingest sync marks them disabled and does not fetch them. Historical `source_items` are not deleted. `/intel/defense` redirects to Watchdogs.

| Slug | Feed-native? | Default on | Notes |
|------|----------------|------------|-------|
| `war-gov-releases` | RSS (`war.gov`) | **no** | Retired. Historical releases kept. |
| `usni-fleet-tracker` | `html_index` | **no** | Retired. |
| `af-mil-news` | RSS | **no** | Retired. |
| `army-mil-news` | RSS | **no** | Retired. |
| `centcom-press` | `html_index` | **no** | Retired. Not ingested or displayed. |
| `eucom-press` | RSS | **no** | Retired. |
| `dvids-sandbox` | — | **no** | Retired placeholder. |

### Watchdogs (`watchdogs`)

| Slug | Feed-native? | Default on | Notes |
|------|----------------|------------|-------|
| `kyiv-independent` | RSS | yes | `https://kyivindependent.com/news-archive/rss/` (`/feed/` is 404). |
| `meduza-english` | RSS | yes | `meduza.io/rss/en/all` (English-only; `/rss/all` is mixed-language) |
| `mag-972` | RSS | **no** | Production ingest receives HTTP 403 from `https://www.972mag.com/feed/` (Cloudflare). Historical rows kept. Do not scrape around the block. |
| `birn-balkaninsight` | RSS | yes | BIRN Balkan Insight |
| `rappler` | RSS | **no** | Retired. Historical rows kept. Next ingest sync sets `is_enabled` false. |
| `bellingcat` | RSS | yes | |
| `forbidden-stories` | RSS | **no** | Official `/feed/` is HTTP 410. No replacement feed. Historical rows kept. |
| `isw-feeds` | — | **no** | No stable public feed from the ingest client (Cloudflare 403). Historical rows kept. |
| `occrp` | RSS | yes | `https://www.occrp.org/en/feed` |

### Indicators (`indicators`)

| Slug | Feed-native? | Default on | Notes |
|------|----------------|------------|-------|
| `bls-release-calendar` | `html_index` | yes | BLS 2026 schedule page → `news.release` links; `SCHEDULE` / `scheduled_release`. |
| `bea-release-schedule` | `html_index` | yes | BEA news schedule listing. |
| `sam-gov-contracting` | — | **no** | Placeholder for future SAM API wiring. |
| `ofac-recent-actions` | — | **no** | Placeholder (legacy OFAC RSS retired). |
| `indicator-pentagon-pizza` | `manual` | **no** | `indicator_anecdotal`; registry-only. |

## Migrations

Apply in order (see [`supabase/migrations/`](../../supabase/migrations/)), including:

- `20260412170000_intel_source_lanes_content_use.sql` — lanes, content modes, expanded `fetch_kind`, `commentary_item`, denormalized `source_items` columns, snapshot id `2` for Voices.
- `20260418120000_intel_source_family_desk_lanes.sql` — `source_family`, lanes `defense_ops` / `watchdogs` / `indicators`, `source_items.indicator_class`, `scheduled_release`, snapshot ids `3`–`5`.
- `20260418201000_intel_source_items_desk_lane_extend.sql` — extends **`intel.source_items`** `desk_lane` CHECK to match `sources` (required for ingest into new lanes; without it upserts fail with `source_items_desk_lane_check`).
- `20260427143000_congress_gov_agenda_pulse.sql` — adds `congress_api`, `congress_primary`, and Congress.gov / Agenda Pulse state-change values to database constraints.

## Live desk snapshots

`intel.live_desk_snapshot`: **`id = 1`** OSINT, **`2`** Voices, **`3`** Watchdogs, **`4`** Defense, **`5`** Indicators — used when live reads fail.
