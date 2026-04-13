# Intel public sources registry

This document mirrors the **version-controlled manifest** in [`lib/intel/signal-sources.ts`](../../lib/intel/signal-sources.ts) and the synced rows in Supabase `intel.sources`. It explains **why each source exists**, **how it is acquired**, and the **content-use posture** (preview vs metadata-only).

## Principles

- **No paid wire APIs** in this milestone; optional Reuters/AP remain env-gated RSS URLs only.
- **No HTML page scraping** for article bodies; only **public feed fields** (title, link, dates, feed-native description/snippet).
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
| `osint` | `/intel/osint` | Primaries, optional wires, specialist reporting, accountability feeds. |
| `voices` | `/intel/voices` | Ingested creator/commentary from **public** RSS/podcast feeds. |

The broader **Voices archive** (Notion + media catalog) remains at `/voices`; it is not replaced by `/intel/voices`.

## Fetch kinds (`fetch_kind`)

| Kind | Automated fetch? |
|------|------------------|
| `rss` | Yes — XML/RSS or Atom via `rss-parser`. |
| `podcast_rss` | Yes — same parser; episode link/enclosure handled conservatively. |
| `json_api` | Yes — Federal Register JSON today. |
| `unsupported` | No — honest registry placeholder. |
| `manual` / `newsletter_only` / `scrape` | No — reserved; no scraping in this cut. |

## Source list (slug → summary)

### Core primaries & records (OSINT)

| Slug | Feed-native? | Default on | Notes |
|------|----------------|------------|-------|
| `wh-news` | RSS | yes | White House news feed. |
| `wh-presidential` | RSS | yes | Presidential actions feed. |
| `fr-public-inspection` | JSON API | yes | FR public inspection. |
| `fr-published` | JSON API | yes | Published FR documents. |
| `govinfo-bills` | RSS | yes | GovInfo bills RSS. |
| `govinfo-crec` | RSS | yes | Full Congressional Record RSS (high volume). |

### Optional wires (OSINT)

| Slug | Feed-native? | Default on | Notes |
|------|----------------|------------|-------|
| `reuters-wire` | RSS if `INTEL_REUTERS_RSS_URL` | env | Fail-closed when unset. |
| `ap-wire` | RSS if `INTEL_AP_RSS_URL` | env | Fail-closed when unset. |

### Specialist / reporting / accountability (OSINT)

| Slug | Feed-native? | Default on | Content posture |
|------|----------------|------------|-----------------|
| `scotusblog` | RSS | yes | `feed_summary` |
| `democracy-docket` | RSS | yes | `feed_summary` |
| `lawfare` | RSS | yes | `feed_summary` |
| `propublica` | RSS | yes | `feed_summary` |
| `american-oversight` | RSS | yes | `feed_summary` |
| `courier-the-cover-up` | RSS | **no** | `preview_and_link` — enable after editorial sign-off. |
| `epstein-coverup-named-unsupported` | n/a | no | Placeholder; no canonical public “EpsteinCoverup” feed identified. |

### Creator / commentary (Voices)

| Slug | Feed-native? | Default on | Content posture |
|------|----------------|------------|-----------------|
| `robert-reich` | Substack RSS | yes | `preview_and_link` |
| `on-offense-kris-goldsmith` | Substack podcast RSS | yes | `preview_and_link` |
| `total-hypocrisy` | Substack RSS | **no** | Enable after verifying `/feed`; Patreon audio without public RSS is not ingested. |

## Migrations

Apply in order (see [`supabase/migrations/`](../../supabase/migrations/)), including:

- `20260412170000_intel_source_lanes_content_use.sql` — lanes, content modes, expanded `fetch_kind`, `commentary_item`, denormalized `source_items` columns, snapshot id `2` for Voices.

## Live desk snapshots

`intel.live_desk_snapshot`: **`id = 1`** OSINT desk, **`id = 2`** Voices desk — used when live reads fail.
