# Milestone 1 spec: Ops + Accountability Signal Overlay

This milestone is the **smallest, safest product jump** that materially reduces “missed top-of-stack accountability stories” without collapsing trust boundaries.

## Goals

- **Ops freshness**: make ingest/rescore/cache-warm run predictably in production.
- **Accountability highlights**: add an explicit, deterministic overlay that surfaces high-severity accountability signals above the feed, while preserving provenance-first ordering.
- **Coverage expansion (verified surfaces first)**: add a small set of **official oversight channels** that frequently carry subpoenas/hearing developments, with “official-claim” trust posture.

## Non-goals

- No fuzzy story clustering.
- No social scraping.
- No LLM-generated summaries or accusations.
- No entity/ledger UX beyond what’s required to keep claims quarantined.

## Exact ops wiring

### Production scheduler

Production recurring jobs are now run by **external cron**, not by repo-managed GitHub or Vercel schedules.

- **Main recurring job**: `/api/cron/ingest-signal`
- **Lightweight cache warm**: `/api/cron/warm-home`
- **Manual / maintenance**: `/api/cron/intel-rescore`, `/api/revalidate`
- **Operational ping**: `/api/cron/keep-alive`

### Expected impact

- Desks stop drifting into “Stale” due to missing invocations.
- Homepage payload caches are kept warm without rebuilding unrelated archive or feed surfaces.

## Coverage expansion (exact sources in this milestone)

### Oversight / committee press releases (official-claim surfaces)

Added to the manifest (`lib/intel/signal-sources.ts`) as `fetch_kind: html_index` (metadata-only) with conservative trust posture:

- `house-judiciary-press-gop` → House Judiciary (Majority) press releases
- `house-judiciary-press-dem` → House Judiciary (Minority) press releases

**Trust posture** (applies to both):

- `trustWarningMode: source_controlled_official_claims`
- `requiresIndependentVerification: true`
- `heroEligibilityMode: never_hero_without_corroboration`
- `contentUseMode: metadata_only` (prevents accidental “summary-as-fact” UI)

**Why these first**

- They frequently contain the exact accountability verbs we care about (`subpoena`, `contempt`, `hearing`, `deposition`, `letter`) and are **institutional signals** even when messaging-heavy.

### Parser wiring (so these actually ingest)

Because `html_index` sources are implemented per-slug (fail-closed), ingestion support is added in `lib/intel/ingest.ts` using `parseSameHostArticleLinksHtml` for those two slugs.

## Accountability Signals overlay (event classes + scoring)

### What ships

A new deterministic overlay, **computed at read time**, emitted as `desk.accountabilityHighlights` and rendered above the lead block:

- **Compute**: `lib/intel/accountabilitySignals.ts` (`computeAccountabilityHighlights`)
- **Attach to desk payload**: `lib/feeds/liveIntel.service.js`
- **Render**: `components/intel/LiveDeskView.jsx` (“Accountability highlights” section)

### Event classes (V1)

This milestone does not create full “events” yet in the UI; it emits a small stable taxonomy for the overlay:

- `bill_introduced_or_filed` (cluster key: `bill`)
- `executive_order_or_proclamation` (cluster key: `executive_order|proclamation`, plus regex fallback)
- `court_order_or_injunction` (regex: injunction/TRO/order/opinion/stay)
- `oversight_subpoena_or_contempt` (regex: subpoena/contempt/refusal/ignored/no-show/missed appearance)
- `hearing_or_deposition` (regex: hearing/deposition/testimony/appearance/committee)
- `public_claim` (statements lane only; capped severity)
- `other` (not elevated)

### Severity model (V1)

Deterministic base severities are assigned by class and boosted only by explicit patterns; existing `displayPriority` contributes as a **bounded tie-breaker** so the overlay aligns with current editorial profile.

### Explainability

Each highlight carries a short `explanations[]` array (e.g., “Accountability escalation language (subpoena/contempt/…)”) so debugging remains “read the rule, see the match,” not “trust a black box.”

## Operational guardrails (claims separation)

- `metadata_only` + trust warning chips ensure committee messaging doesn’t read as verified evidence.
- “Highlights” do not reorder the entire desk; it’s a separate strip, preserving the provenance-first feed.

## Follow-on (Milestone 1.5+)

- Add more committee/IG/agency official channels once `html_index` parsers are proven stable.
- Optionally persist derived highlights into `intel.events` (schema exists as a minimal base) once we have a small editorial workflow for event curation.

