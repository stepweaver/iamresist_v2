# Theme Memory

Durable editorial corpus and persistent creator-led themes for multi-day / multi-week attention.

**Theme Memory does not replace the existing I Am Resist ranking model.
It supplies bounded longitudinal attention context to that model.**

Creator episodes are not ranked against each other. Relevant creator links remain members of the theme for later presentation.

Milestones 1–2 persist observations, themes, memberships, and daily signals. Milestone 3 optionally feeds that context into `computeDisplayPriority`.

## Purpose

I Am Resist already has sophisticated short-window ranking and creator convergence.

Theme Memory extends attention **over days and weeks**:

- Monday: MeidasTouch and David Pakman discuss topic X
- Tuesday: Brian Tyler Cohen discusses X; Newswire reports on X
- Wednesday: creators continue; Intel/OSINT has a court filing related to X

Those items should belong to one persistent **theme**.

Creators are an **editorial attention sensor**. They answer:

> What are the creators we follow paying sustained attention to?

They do **not** answer:

> Has this factual claim been independently corroborated?

## Membership is not corroboration

This distinction is encoded in storage, types, daily signals, and the read model (`THEME_MEMBERSHIP_IS_NOT_CORROBORATION`).

Example:

Theme: "Federal deployment authority dispute"

- Creator: Pakman episode
- Creator: MeidasTouch episode
- Reporting: AP article
- Primary: court filing

That means all four items are **topically related**.

It does **not** mean every statement in every creator episode is proven by the court filing.

- Creator members = editorial attention
- Reporting members = related journalism
- Primary members = related primary-source records
- Specialist members = related specialist analysis

Corroboration remains the existing ranking/Intel concept and is not computed here.

## Creator-led design

Milestone 2 themes are **creator-led**.

A new persistent theme ordinarily originates because one or more favorite Voice observations indicate a recurring subject.

Newswire and Intel items may:

- attach to a creator-led theme
- strengthen context
- provide reporting or primary evidence
- continue contributing to an existing theme

They do **not** independently spawn large numbers of themes.

A single creator observation may seed a **provisional** theme (`metadata.creatorSeedStrength = single`) so early history is not lost. Two or more distinct creators make it `converged`.

## Architecture

```
CREATOR RSS  →  theme_observations (voice)
NEWSWIRE     →  theme_observations (newswire)
INTEL/OSINT  →  queried in place (not copied)

                 ↓ processThemeMemory()

creator observations
    → deterministic candidate narrowing
    → optional AI membership check
    → persistent intel.themes
    → attach Newswire / Intel
    → deterministic daily signals + lifecycle
    → optional AI labels
```

## Storage model

Milestone 1 table:

- `intel.theme_observations` — durable Voice/Newswire feed history

Milestone 2 tables:

- `intel.themes` — persistent theme identity (slug + uuid; never title-only)
- `intel.theme_memberships` — topical members with role, method, reasons, URLs
- `intel.theme_daily_signals` — deterministic daily statistics
- `intel.theme_item_analyses` — cached classification so unchanged items are not re-analyzed

`intel.events` remains unused. Events are discrete real-world occurrences. A theme is a sustained editorial subject and may later contain several events.

Uniqueness:

- memberships are unique per `(source_system, source_slug, identity_key)` — one item, one theme
- also unique per theme + item identity
- theme slugs are unique and include a stable id suffix

## Theme model

```ts
type ThemeLifecycle = 'new' | 'developing' | 'persistent' | 'cooling' | 'resurging' | 'dormant';
type MembershipMethod = 'deterministic' | 'ai' | 'manual';
type ThemeMemberRole = 'creator' | 'reporting' | 'primary' | 'specialist' | 'commentary' | 'context';
```

Read helpers (server-side, no public UI yet):

- `getActiveThemes({ windowDays })`
- `getThemeById`
- `getThemeMembers`
- `getThemeTimeline`
- `getThemeAttentionForItem` / `getThemeAttentionForItems` — inspectable ranking *context*, not ranking points. Batch API is required for ranking.

## Deterministic candidate narrowing

AI is never asked to compare every item with every theme.

For each item:

1. Extract a fingerprint: strong distinctive tokens/phrases, supporting features, weak entities, cluster keys, action hints
2. Compare against a **stable core fingerprint** (seed + strongly corroborated identity-bearing members). Contextual members may belong without adding theme-defining vocabulary.
3. Weak / low-information features (broad countries, parties, Congress/Senate/House/Supreme Court, generic politician names, `ruling` / `hearing` / `candidate`) can **support** a match but cannot, by themselves, create a strong deterministic match
4. Require a distinctive event-level anchor (specific people + action, case, agency action, legislation, event, or multiple aligned non-weak features)
5. If evidence is overwhelming, attach deterministically
6. If plausible but ambiguous, ask `ThemeAIProvider` using **core** evidence only; reject ungrounded invented bridges
7. If no plausible candidate, Voice items may seed a new theme; Newswire/Intel do not

False merges are treated as worse than temporary duplicate themes.

## AI role

The model has one job: semantic classification / labeling.

It does **not** assign importance, rank, fact-check, browse, or publish.

Provider interface (`lib/themeMemory/ai/types.ts`):

- `classifyMembership` → `{ belongs, confidence, reasons }`
- `generateThemeLabel` → `{ canonicalLabel, headline, summary }`

Implementations:

- Ollama HTTP client
- deterministic / no-AI fallback
- test fake provider

All model JSON is schema-validated. Malformed output is rejected, not coerced.

Untrusted source text is delimited (`<source>`, `<theme>`, `<members>`). Prompts tell the model to ignore embedded instructions. Environment variables and secrets are never sent.

## Ollama configuration

Environment (via `lib/env/themeMemory.js`):

```
THEME_AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=
THEME_AI_TIMEOUT_MS=45000
THEME_AI_MAX_RETRIES=2
```

`THEME_AI_PROVIDER=none` (default) uses the deterministic fallback. Ordinary tests do not require Ollama.

Ollama is **not** exposed through a public route. The process that calls Ollama must run on the same host (`127.0.0.1:11434`). If the public Next.js app is hosted elsewhere, use the VPS batch runner instead of the deployed API route.

```bash
npm run theme-memory:ai-check
npm run theme-memory:daily
```

See [`deploy/theme-memory/README.md`](../deploy/theme-memory/README.md) for environment, systemd timer examples, and the exclusive run lock.

If Ollama is down:

- persistence still works
- deterministic matches still attach
- ambiguous matches do not false-merge
- diagnostics set `incompleteClassification` / `aiUnavailable` / `aiFailures`

## Versioning / cache

Central constants:

- `THEME_MEMBERSHIP_PROMPT_VERSION` (`tm-membership-v3`)
- `THEME_LABEL_PROMPT_VERSION` (`tm-label-v2`)
- `THEME_CLASSIFICATION_VERSION` (`tm-classify-v3`)

Memberships and analyses store content hash + `themeClassificationCacheVersion(provider)` (classification version + `none`/`ai` mode + membership prompt version). Unchanged items are skipped. A previous deterministic/no-AI analysis does **not** permanently block later AI-assisted classification. Labels regenerate only when missing, prompt version changes, member set changes, or `refreshLabels=1`.

## Lifecycle (deterministic)

Thresholds live in `THEME_LIFECYCLE_THRESHOLDS`.

| Status | Meaning |
| --- | --- |
| `new` | First appeared recently, limited history (`age <= 3` days and `activeDays14 <= 1`) |
| `developing` | Multiple recent active days and attention increasing |
| `persistent` | Present on at least 4 distinct days in 14 |
| `cooling` | Previously active, activity falling / quiet for 3+ days |
| `resurging` | Was cooling/dormant, then meaningful new creator activity |
| `dormant` | No creator activity for 10 UTC days |

No AI lifecycle decisions.

## Daily signals (deterministic)

Computed per UTC `signal_date`. No AI.

Day-scoped creator/Newswire/Intel counts use items observed that day.

Creator stats count **Voice creator members only**.

Cumulative as of that date:

- `primary_source_count` / `specialist_source_count` — distinct sources among those roles
- `evidence_depth` = `2*primary + specialist + reportingSourceCount`

Reporting source breadth collapses same canonical URL and near-duplicate syndicated titles.

Rolling:

- `active_days_7/14/30` — distinct UTC days with creator activity
- `creator_breadth` — distinct Voice creators in last 7 days
- `creator_momentum` = today's creator item count / mean of the prior 6 days (`1` = same pace)

These are inspectable statistics, not ranking points.

## Processing invocation

Ingest (Milestone 1) and process (Milestone 2) are separate. Auth for HTTP crons matches other crons (`CRON_SECRET`).

**Preferred production path:** run on the VPS next to Ollama.

```bash
npm run theme-memory:daily
```

HTTP crons still exist and call the same services (they do not call ingest over HTTP; `?ingest=1` reuses `ingestThemeMemorySources()` directly):

```bash
# Persist recent Voice + Newswire observations
curl -H "Authorization: Bearer $CRON_SECRET" \
  "$ORIGIN/api/cron/theme-memory-ingest"

# Build/update persistent themes from the corpus
curl -H "Authorization: Bearer $CRON_SECRET" \
  "$ORIGIN/api/cron/theme-memory-process"

# Optional: ingest first, or force label refresh
curl -H "Authorization: Bearer $CRON_SECRET" \
  "$ORIGIN/api/cron/theme-memory-process?ingest=1&refreshLabels=1"
```

Diagnostics include creator items considered, themes created/updated, deterministic vs AI memberships, AI failures, Newswire/Intel/primary attaches, and `themesByLifecycle`. The daily CLI also prints a lock-protected ingest/process summary and reports likely duplicate themes without merging them.

## Current limitations

- No public Themes UI
- Theme ranking defaults to **off**; ingest/process continue regardless
- VPS daily batch is documented but not auto-installed
- Intel adapter remains time-bounded (max 1000 rows per window)
- RSS ingest can only persist items still present in each feed
- YouTube channel RSS (`youtube.com/feeds/videos.xml`) may return HTTP 404 for valid channel IDs. `lib/feeds/rss.js` treats that 404 (plus 429, 5xx, timeouts, and network errors) as transient and retries with a bounded 2s then 5s backoff. Exhausted retries still fail (`ok: false`); they are not stored as an empty feed. Multi-hour YouTube RSS outages will still miss those creators for that run.
- Local Ollama inference may be slow; the pipeline caps AI checks/labels per run
- Ambiguous matches without AI may create temporary duplicate themes by design
- `intel.events` remains unused
- Live-desk snapshots captured under a previous ranking mode can lag until rebuilt

## Ranking integration (Milestone 3)

Theme Memory answers:

> What subjects are receiving sustained attention from the creators we intentionally follow?

Existing Intel / Newswire ranking still answers provenance, mission fit, recency, and corroboration.

If a currently rankable Intel / OSINT / reporting item belongs to a persistent creator-led theme, `computeDisplayPriority` may receive a **small, bounded** theme-attention contribution.

That contribution is **editorial attention over time**. It is never factual corroboration, never a second ranking score, and never an AI importance judgment.

```
existing item
    ↓
existing relevance / provenance / ranking inputs
    + optional theme-attention context (prefetched)
    ↓
existing deterministic ranking architecture
    ↓
final item priority
```

### Why it is bounded

Theme attention cannot dominate provenance, recency, mission, or suppression. Constants live in `THEME_ATTENTION_RANKING` (`lib/intel/themeAttentionRanking.ts`). Max contribution is 5 display-priority points (below primary-source +8).

### Creators are attention, not corroboration

Creator breadth is longitudinal editorial attention. Primary/reporting memberships are theme **context/maturity**, not proof that every claim is true. Theme membership only establishes topical relevance.

Reason codes never include corroboration language for creator attention.

### Unique longitudinal signal

The new information is **time**:

- persistence across distinct days
- repeated distinct creator attention
- resurgence after quiet periods

Short-window (~36 hour) `trusted_creator_convergence` / `computeCreatorCorroborationBridge` remains responsible for same-day activity. Theme Memory does not reimplement that path.

### Double-counting policy (creator signals)

| Signal | Window | Owner |
| --- | --- | --- |
| `trusted_creator_convergence` / creator corroboration bridge | ~36 hours | `globalPromotion.ts` / live desk bridge |
| Agenda Pulse | congressional/public-consequence | `agendaPulse.ts` |
| Theme Memory | multi-day / resurgence | `deriveThemeAttentionSignal` |

When both short-window bridge and Theme Memory apply to the same item, combined creator-derived displayPriority boost is capped (`COMBINED_CREATOR_INFLUENCE_CAP`). Theme Memory is not added a second time inside `promoteGlobally`; homepage promotion may inherit a fraction via representative `displayPriority` only.

### Primary / source-diversity double-counting

Item-level provenance (PRIMARY/WIRE/SPECIALIST) is already scored in `computeDisplayPriority`. Theme `primarySourceCount` / reporting breadth are **maturity gates**, not a second scaled provenance or diversity reward. If the item itself is already PRIMARY, theme primary context adds **0** extra points. Reporting/specialist context on the theme can add at most `CONTEXT_MATURITY_MAX` (1).

### Eligibility

Centralized in `deriveThemeAttentionSignal`. Theme attention generally requires:

- a persisted membership on a real theme
- multi-day creator activity, or resurging converged attention
- creator breadth ≥ 2 (single-creator provisional seeds do not rank)
- the current item already valid in the ranking pipeline

It does **not** apply to:

- dormant themes
- weak one-item / single-creator seeds
- suppressed or duplicate-loser items
- off-scope items
- metadata-only items
- stale items beyond `MAX_ITEM_AGE_HOURS`
- cooling themes that are still falling (no lingering evergreen boost)

Lifecycle:

| Status | Ranking |
| --- | --- |
| new (single) | none |
| developing / persistent / resurging | eligible, bounded |
| cooling | reduced cap, disabled if falling |
| dormant | none |

### Kill switch and shadow mode

```
THEME_RANKING_MODE=off      # default: do not calculate or apply
THEME_RANKING_MODE=shadow   # calculate and expose; do not change scores
THEME_RANKING_MODE=active   # calculate and apply bounded contribution
```

`THEME_RANKING_ENABLED=true` maps to `active` only when `THEME_RANKING_MODE` is unset.

If disabled/off:

- themes continue ingesting and processing
- daily signals continue
- ranking matches pre-Milestone-3 behavior

### Reason codes

Stable identifiers (not prose-only internals):

- `theme:creator_convergence`
- `theme:multi_day_persistence`
- `theme:resurging_attention`
- `theme:rising_creator_attention`
- `theme:reporting_context`
- `theme:primary_context`
- `theme:longitudinal_attention`

Ineligible reasons use `theme:ineligible:*`. Debug objects always set `attentionIsNotCorroboration: true`.

### Batch-loading / no AI during ranking

Ranking never does `getThemeAttentionForItem` inside a comparator.

```
fetch items
    ↓
batch fetch Theme Attention map (`getThemeAttentionForItems`)
    ↓
synchronous computeDisplayPriority(themeAttention, mode)
    ↓
sort
```

No Ollama / ThemeAIProvider call occurs while calculating display priority. Ranking consumes already-persisted memberships only.

### Calibration

`compareThemeRanking(items, attentionByItemId)` returns baseline vs theme-aware positions without changing production ranking.

Protected route (dev or `INTERNAL_THEME_RANKING_DEBUG=1` / `INTERNAL_INTEL_DESK_DEBUG=1`):

`GET /api/internal/theme-ranking-diagnostics?lane=osint`

Recommended procedure:

1. Keep `THEME_RANKING_MODE=off` in production
2. Run process cron so themes exist
3. Hit diagnostics (or shadow mode) and inspect deltas / reason codes
4. Confirm dormant/single-creator/suppressed items do not move
5. Switch to `shadow` on a staging environment, then `active` only after review

