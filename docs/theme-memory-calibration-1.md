# Theme Memory Calibration Pass 1

Real-data shadow evaluation. Generated 2026-09-15.

This pass evaluates whether Theme Memory behaves correctly on live I Am Resist data. Ranking was not switched to active. Weights were not retuned. No UI was built.

**Production ranking mode during this pass:** `THEME_RANKING_MODE=shadow` in local `.env.local` (was unset → `off` before the pass). Shadow calculates and exposes contribution; `appliedContribution` remains 0. Active ranking was not enabled.

---

## Environment

| Item | Observed |
| --- | --- |
| Database | Supabase project `brzixkthfxvssjknhfmj.supabase.co` via local `.env.local` (`POSTGRES_SUPABASE_URL` + service role) |
| App runtime | Existing ingest/process services. Local `next start :3010` used for ingest because the Turbopack `:3001` dev server was failing on `.next` build-manifest ENOENT. Process was then run through the same production functions (`runThemeMemoryProcess`) after a schema bug blocked signal upsert. |
| `THEME_RANKING_MODE` | `shadow` (local calibration). Not `active`. |
| `THEME_RANKING_ENABLED` | unset |
| `INTERNAL_THEME_RANKING_DEBUG` | set to `1` locally for this pass |
| Theme Memory ingest | Runnable. `GET /api/cron/theme-memory-ingest` with `Authorization: Bearer CRON_SECRET` returned 200. |
| Theme Memory process | Runnable after a correctness fix (see Findings). Cron auth is the same `CRON_SECRET` bearer / `cron_secret` query pattern as other crons. |
| `THEME_AI_PROVIDER` | unset → `none` (deterministic fallback) |
| `OLLAMA_BASE_URL` | default `http://127.0.0.1:11434` |
| Ollama | **Available locally** (`gemma3:4b`, `llama3:latest`) but **not configured** for Theme Memory. Unused this pass. |
| `OLLAMA_MODEL` | unset |
| Membership prompt | `tm-membership-v1` |
| Label prompt | `tm-label-v1` |
| Classification version | `tm-classify-v1` |
| Process window | 14 days (`THEME_PROCESS_WINDOW_DAYS`) |
| Ranking cap | `MAX_CONTRIBUTION=5`, cooling cap `2`, combined creator cap `7` |

Cron/internal auth: `CRON_SECRET` is present (64-character secret, not printed). Unauthenticated ingest on the broken Turbopack server returned 500 because of `.next` corruption, not because the secret was missing. The production-compiled ingest route authorized correctly with the bearer token.

---

## Corpus Coverage

**This was the first real Theme Memory ingest.** `intel.theme_observations`, `intel.themes`, `intel.theme_memberships`, `intel.theme_daily_signals`, and `intel.theme_item_analyses` were empty immediately before the pass.

All observation rows were created at `2026-09-15T18:40:34Z`–`18:40:36Z`. A 7/14/30-day analysis therefore does **not** represent accumulated daily Theme Memory history. It represents whatever the live RSS feeds still returned in one fetch, plus Intel `source_items` already stored by the existing ingest pipeline.

| Window (days) | Voice+Newswire observations | Intel `source_items` | Combined |
| ---: | ---: | ---: | ---: |
| 1 | 122 | 0 | 122 |
| 3 | 170 | 25 | 195 |
| 7 | 242 | 639 | 881 |
| 14 | 281 | 1540 | 1821 |
| 30 | 310 | 3792 | 4102 |

Intel 1-day count was 0 at ingest time (no `published_at` in the last 24 hours in the adapter query). That is an Intel freshness fact, not a Theme Memory ingest failure.

Observation `observed_at` range: **2026-03-04** → **2026-09-15**. That oldest date is RSS lookback from Brennan Center / similar feeds, not months of Theme Memory persistence.

---

## Ingest Results

Path: `ingestThemeMemorySources({ includeDiagnostics: true })` via `GET /api/cron/theme-memory-ingest`.

`overallStatus`: **success**. `ok`: true. Finished `2026-09-15T18:40:34Z`.

### Voices

- Creators attempted: **15**
- Feeds successful: **15**
- Feeds failed: **0**
- Feeds empty: **0**
- Items observed / observations touched: **230**
- Per-creator cap: 25 (`THEME_MEMORY_ITEMS_PER_VOICE`)
- Oldest published: 2026-03-04T19:29:21Z
- Newest published: 2026-09-15T17:15:31Z
- Failures: none

Observation count by creator:

| Creator | Count |
| --- | ---: |
| The Briefing - Brennan Center for Justice | 20 |
| Brian Tyler Cohen | 15 |
| Cure for Paranoia | 15 |
| David Pakman | 15 |
| Gregory Johnstone | 15 |
| Joey Contino | 15 |
| Johnny Bananas | 15 |
| MeidasTouch Network | 15 |
| Ohh That’s Rich | 15 |
| Robert Reich | 15 |
| Tad Stoermer | 15 |
| The Necessary Conversation | 15 |
| Timothy Snyder | 15 |
| Walkabouts with Dan | 15 |
| Wiseacre | 15 |

Most creators sat at the 15-item feed page, not the 25 cap. Brennan returned 20. This is one RSS snapshot, not 30 days of daily accumulation.

Voice published-at coverage in that snapshot: 1d 60 / 3d 95 / 7d 136 / 14d 164 / 30d 189.

### Newswire

- Sources represented: **7**
- Items observed / observations touched: **131**
- Oldest published: 2026-07-20T19:39:25Z
- Newest published: 2026-09-15T18:32:55Z

| Source | Count |
| --- | ---: |
| Haaretz | 20 |
| Drop Site News | 20 |
| Democracy Now! | 20 |
| Ken Klippenstein | 20 |
| Al Jazeera | 19 |
| WIRED | 18 |
| 404 Media | 14 |

Newswire published-at coverage: 1d 61 / 3d 75 / 7d 106 / 14d 117 / 30d 121.

### Intel

Not copied into `theme_observations`. Candidate adapter (max 1000 rows / window):

- Process window (14d): **1000 Intel items considered** (adapter cap hit; 1540 exist in 14d)
- 7d available: 639
- 30d available: 3792

---

## Theme Processing Results

First process run created themes/memberships, then crashed while writing daily signals (correctness bug; fixed; see Findings). Second run skipped unchanged creator items and finished lifecycle/signals/labels.

### Reconstructed first-run membership work (from DB)

Processing uses the 14-day window, so 164 of 230 voice observations were considered (the rest are older RSS lookback sitting in `theme_observations` only).

| Metric | Value |
| --- | ---: |
| Creator items considered (14d) | 164 |
| Voice memberships stored | 164 |
| Themes created | 152 |
| Themes updated (second run) | 0 |
| Deterministic memberships | 182 |
| AI membership checks | 0 |
| AI accepted | 0 |
| AI rejected | 0 |
| AI failures | 0 |
| Analyses: seeded | 152 |
| Analyses: attached | 30 |
| Analyses: no_match | 1099 |
| Newswire attachments | 5 |
| Intel attachments | 13 |
| Primary attachments | 3 |
| Specialist attachments | 7 |
| Creator-role memberships | 167 (164 voice + 3 Intel commentary copies of Robert Reich) |
| Labels generated (second run, cap 20) | 20 |
| Labels skipped / already seeded | 132 this run; all 152 themes have a seed or generated headline |
| Daily signals written | 152 |

`aiUnavailable` was false in diagnostics because the deterministic provider is configured as provider `none`, not a failed Ollama handshake. Ambiguous matches did not merge: several seed reasons are `ai_unavailable_or_incomplete_seeded_instead_of_merge` or `ai_rejected_existing_candidates` (deterministic `belongs: false`).

---

## Theme Lifecycle Distribution

| Lifecycle | Count |
| --- | ---: |
| new | 98 |
| developing | 5 |
| persistent | 1 |
| cooling | 39 |
| resurging | 0 |
| dormant | 9 |
| **total** | **152** |

150 / 152 themes are single-creator seeds. 2 are `creatorSeedStrength=converged`.

Longitudinal buckets (from daily signals, not ranking eligibility):

| Bucket | Count |
| --- | ---: |
| same-day / short-window only | 145 |
| genuinely multi-day | 6 |
| persistent | 1 |
| resurgence | 0 |

Most “cooling” / “dormant” / “persistent” labels are computed from RSS `published_at` history returned in this first ingest. They are not proof that Theme Memory has been watching the subject for 14–30 days.

---

## Theme Quality Review

Active/recent themes are numerous (152). Below: every **converged** theme, the only **persistent** theme, every theme with Newswire/Intel members, plus a sample of single-creator seeds.

### Converged (2 distinct creators)

**Theme** `534d94f4-1eb1-46ef-b8ec-49a9d7622a57`  
Label: `bankrupted kennedy center`  
Headline: `Coverage of bankrupted kennedy center continues`  
Lifecycle: developing · first seen 2026-09-14 · last seen 2026-09-15  
activeDays7=2 · activeDays14=2 · creator breadth 7d=2 · momentum=1 (steady)

Creators:

- Johnny Bananas — “Trump has bankrupted the Kennedy Center.” — 2026-09-14 — [YouTube short](https://www.youtube.com/shorts/vcXrclOi91E) — seeded (`ai_unavailable_or_incomplete_seeded_instead_of_merge`)
- Brian Tyler Cohen — “OMG: INSANE Trump update on Kennedy Center” — 2026-09-15 — [YouTube](https://www.youtube.com/watch?v=_Yl4I2QvIt0) — deterministic `shared_phrase:kennedy center`

Newswire / Intel / primary / specialist: none.

This is the only theme that looks like genuine creator-led breadth on a shared subject. Ranking did not move Intel items because none are members.

**Theme** `62a476bf-af08-4c22-9cce-3c879c43236e`  
Label: `supreme court block executive`  
Headline: `Coverage of supreme court block executive continues`  
Lifecycle: developing · first/last seen 2026-09-15  
activeDays7=1 · creator breadth 7d=2 · momentum=2 (rising)

Creators:

- Johnny Bananas — “Supreme Court blocks Trump’s executive order restricting absentee ballots.” — 2026-09-15
- MeidasTouch Network — “SUPREME COURT BLOCKS HIM…” — 2026-09-15

Newswire: Democracy Now! “Headlines for September 15, 2026” matched on `supreme court` / `block`.  
Intel: three SCOTUSblog items, including a **COVID-19 vaccine mandate** order list, matched on `supreme court`.

Likely a **false merge** of “mail-in/absentee ballot order” with unrelated Supreme Court items. See Potential False Merges.

### Persistent (single creator — stored, not ranking-eligible)

**Theme** `ab60735b-e616-49f5-865d-fbf0d30ae944`  
Label: `icymi post daily headcountorg`  
Lifecycle: persistent · Cure for Paranoia only · 5 creator items · activeDays14=5 · activeDays7=1 · breadth=1

A daily voter-registration rap series from one creator. Persistence is real in the RSS lookback. Ranking eligibility is correctly **not** met (single-creator seed).

### Themes with reporting / primary / specialist members

| Label | Lifecycle | Creators | NW | Intel | Primary | Specialist | Review |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| germany gerrymander mail-in voting | cooling | Ohh That’s Rich | 1 | 1 | 0 | 1 | Questionable: Germany gerrymander episode vs US mail-in SCOTUS coverage |
| capitalism turned united stat | new | Ohh That’s Rich | 0 | 3 | 3 | 0 | Likely false merge: Federal Register Canadian-products notices matched on “united stat” |
| republican senate candidate cheat | new | Brian Tyler Cohen | 1 | 0 | 0 | 0 | Likely false merge: debate-cheat episode vs Drop Site Mike Rogers / opioid story |
| russian ship fire danish | new | Joey Contino | 2 | 0 | 0 | 0 | One Al Jazeera Denmark item may belong; Drop Site “Supreme Court blocks Trump voting…” does not |
| supreme court block executive | developing | 2 creators | 1 | 3 | 0 | 3 | Likely false merge on “Supreme Court” |
| break major from supreme | developing | Brian Tyler Cohen | 0 | 3 | 0 | 3 | Missouri map / CLC items may be one subject; still institution-heavy matching |
| hate bring remember jeffrey | cooling | Robert Reich | 0 | 2 | 0 | 0 | Intel rows are the same creator’s Substack copies (`member_role=creator`), not extra creators |
| real reason republican afraid | dormant | Robert Reich | 0 | 1 | 0 | 0 | Same: Reich voice + Reich intel commentary |

### Single-creator sample (intentionally stored)

| Label | Lifecycle | Creator | Items | activeDays14 |
| --- | --- | --- | ---: | ---: |
| protect those constitu brennan | dormant | Brennan Center | 1 | 0 |
| prepared storm coming | dormant | Robert Reich | 1 | 1 |
| surveillance state warn ignored | developing | (single) | — | 2 |
| bankrupted kennedy center | developing | 2 creators | 2 | 2 |

Headlines are uniformly `Coverage of {token fingerprint} continues`. They do not describe the shared subject in editorial English.

---

## Potential False Merges

Do **not** modify memberships in this pass. Classification is review-only.

### 1. `supreme court block executive` — **likely false merge**

**THEME:** Supreme Court blocks absentee-ballot executive order (Johnny Bananas + MeidasTouch, 2026-09-15)

**MEMBER A:** Johnny Bananas, “Supreme Court blocks Trump’s executive order restricting absentee ballots.”  
Method: deterministic seed. Confidence: 1. Reasons: `seeded_creator_led_theme`, `ai_unavailable_or_incomplete_seeded_instead_of_merge`.

**MEMBER B:** SCOTUSblog, “In final scheduled summer order list, Supreme Court again declines to weigh in on COVID-19 vaccine mandate case.”  
Method: deterministic. Confidence: 0.8. Reasons: `shared_phrase:supreme court`, `shared_distinctive:order,supreme,court`.

**WHY THEY WERE MATCHED:** overlapping institution phrase “Supreme Court”, not the same underlying dispute.

Democracy Now! daily headlines also attached on the same phrase.

### 2. `capitalism turned united stat` — **likely false merge**

**THEME:** Ohh That’s Rich creator episode (seed)

**MEMBER B:** Federal Register, “Excluding Certain Canadian Products From Importation Into the United States…” (PRIMARY ×3)  
Reasons: `shared_phrase:united stat`, `shared_distinctive:into,united,stat`.

Country/boilerplate overlap, not the same subject.

### 3. `republican senate candidate cheat` — **likely false merge**

**MEMBER A:** Brian Tyler Cohen, “Republican Senate candidate CHEATS OFF Democratic opponent during debate.”  
Reasons include `ai_rejected_existing_candidates` (new seed).

**MEMBER B:** Drop Site News, “Got Oxy? How Michigan’s Mike Rogers Helped Fuel the Opioid Crisis.”  
Reasons: `shared_phrase:republican senate`, `shared_distinctive:republican,senate,candidate`.

Shared office/party words, not the debate-cheat story. This Newswire item also appeared on the homepage briefing with `theme:ineligible:single_creator_seed`.

### 4. `germany gerrymander mail-in voting` — **questionable**

Creator episode appears to be about Germany/gerrymandering. WIRED + SCOTUSblog mail-in voting items attached via `supreme court` / `mail-in voting`. Possibly two US election-admin stories colliding with an unrelated creator title.

### 5. Cure for Paranoia ICYMI cluster — **likely correct** (same creator, same registration-rap campaign)

A “Tiny Desk / registered to vote” short attached onto the HeadCount daily-rap series. Same creator, same civic-registration campaign. Questionable only at the title-token level; editorially it is the same series.

---

## Potential False Splits

No automatic merges. Deterministic-only classification **prefers splits** (`belongs: false` on ambiguous AI checks). Probable duplicate-theme candidates:

1. **`trump-a-palooza bribe latestnew`** (cooling) vs **`trump-a-palooza recap latestnew`** (new) — same show franchise / title evolution, kept separate.
2. **`icymi post daily headcountorg`** vs **`icymi bitch protest entire`** vs **`icymi grindr crash dalla`** — same creator “ICYMI” posting habit, **different subjects**. Splits here are probably correct; the shared token is a format, not a theme.
3. **`supreme court block executive`** vs **`break major from supreme`** vs **`germany gerrymander mail-in voting`** — overlapping SCOTUS / mail-in / map stories that may be one 2026 election-admin cluster or two (absentee-ballot EO vs Missouri map). Needs AI/editorial review; currently split **and** internally false-merged.
4. **`russian oligarch close reportedly`** vs **`close friend paid wedd`** — possible same gossip/wedding item with title evolution.
5. **`real reason republican afraid`** vs **`republican trying alter censu`** — only share “republican”; split is likely correct.

Title evolution across days is visible inside the HeadCount rap series (already merged) and the Kennedy Center pair (already merged). Broader SCOTUS mail-in coverage is the main split/merge tangle.

---

## Creator-Led Invariant Check

| Invariant | Result |
| --- | --- |
| A. One creator’s several episodes ≠ creator convergence | **Hold.** 150/152 themes remain `single`. The HeadCount series has 5 episodes, `creatorSeedStrength=single`, breadth=1. |
| B. Two+ distinct creators can establish breadth | **Hold, barely.** Kennedy Center and Supreme Court-block themes are `converged` with breadth 2. |
| C. All relevant creator episodes remain accessible as members | **Hold inside the 14-day process window.** 164 voice observations in 14d → 164 voice memberships. 66 older voice observations are stored historically but were outside `THEME_PROCESS_WINDOW_DAYS`. |
| D. Creator items are not discarded because another creator covered the same subject | **Hold.** Kennedy Center keeps both Johnny Bananas and Brian Tyler Cohen URLs. |
| E. Creator membership is never described as factual corroboration | **Hold.** No membership reasons contain “corroborat*”. Read-model flag remains `membershipIsNotCorroboration`. |
| F. Newswire/Intel attachments do not alter creatorCount | **Hold.** Reich Intel commentary copies are `member_role=creator` with the same slug, so they do not inflate distinct creator breadth. Drop Site / FR / SCOTUSblog attachments did not raise `creator_breadth` above stored Voice creators. |
| G. Primary members do not imply creator claims are verified | **Hold in code/reasons.** The FR primary attachments are a false merge, but they are stored as topical `primary` members, not corroboration. |

Violations: **none** of the encoded invariants. Semantic false merges (institution/country tokens) are quality issues, not invariant breaks.

---

## Longitudinal Signal Review

Theme Memory is supposed to add **multi-day** attention beyond ~36-hour creator convergence.

| Eligible-looking themes | Classification |
| --- | --- |
| Kennedy Center (2 creators, 2 days, developing) | genuinely multi-day, **but same 36-hour window as short-window convergence**. Not yet a 7-day persistence story. |
| HeadCount rap series (1 creator, 5 days / 14) | persistent historically, **ranking-ineligible** (single creator). |
| 145 themes | same-day / short-window only |
| 0 themes | resurgence |
| 5 developing | mostly 2 calendar days of RSS titles, often one creator |

**Conclusion:** this corpus cannot yet prove that Theme Memory adds a longitudinal signal distinct from today’s creator convergence. The only multi-creator theme with 2 active days (Kennedy Center) is still inside a short window. No rankable Intel item received a Theme Memory contribution.

---

## Shadow Ranking Summary

`compareThemeRanking(...)` + `prefetchThemeAttentionByItemId(..., { mode: 'active' })` against live desk `preCapCandidates`. Diagnostics route helper `buildThemeRankingDiagnostics({ lane: 'osint', limit: 80 })` agreed: 80 items, 4 matched, 0 eligible, 0 moved.

Current mode reported: **shadow**. Hypothetical scores used `themeRankingMode: 'active'` inside the comparator only. Live `appliedContribution` stays 0.

| Lane | Pool | Matched | Eligible | Moved | Largest \|Δ\| |
| --- | ---: | ---: | ---: | ---: | ---: |
| OSINT | 291 | 10 | 0 | 0 | 0 |
| Watchdogs | 350 | 0 | 0 | 0 | 0 |
| Defense | 236 | 0 | 0 | 0 | 0 |
| Indicators | 0 | 0 | 0 | 0 | 0 |
| Statements | 0 | 0 | 0 | 0 | 0 |
| Voices | 208 | 3 | 0 | 0 | 0 |
| **Total** | **1085** | **13** | **0** | **0** | **0** |

Homepage briefing (5 selected items): Theme Memory objects were exposed in shadow. One Newswire item matched `republican senate candidate cheat` and was ineligible (`single_creator_seed` / `new_provisional`). Four items had `theme:ineligible:no_match`. No homepage score moved (`appliedContribution=0`).

Largest Theme Memory contribution observed: **0**.

Matched OSINT items were SCOTUSblog / Campaign Legal Center / Federal Register members of the false-merge or single-creator themes above. Voices matches were Robert Reich Substack copies of cooling/dormant single-creator themes.

---

## Largest Position Movements

### TOP 20 UPWARD MOVERS

None. Zero items changed position.

### TOP 20 DOWNWARD POSITION MOVERS

None.

---

## Double-Counting Audit

### Short-window creator overlap

Items with both ~36h creator corroboration **and** Theme Memory eligibility: **0**.

Combined creator-derived influence vs cap 7: **no violations** (no eligible Theme Memory contribution to stack).

Qualitative: the Kennedy Center theme is exactly the kind of same-day/two-day creator pair the short-window bridge already handles. If it later becomes ranking-eligible, Pass 2 should confirm Theme Memory is paying for **day 2+ persistence**, not a second check for today’s overlap.

### Primary provenance overlap

Three Federal Register PRIMARY items matched theme `capitalism turned united stat`. They were **ineligible** (new / single-creator). Hypothetical Theme Memory primary-context bump would be 0 on PRIMARY items by design (`CONTEXT_MATURITY` skipped when the item itself is PRIMARY). No duplicate provenance reward was applied.

### Reporting/source diversity overlap

No eligible theme had a large Newswire-source bonus. Context maturity is capped at +1 and did not fire. Syndicated FR titles attached three times as separate Intel rows (same notice family) — counts did not affect ranking this pass, but they should not later inflate `primary_source_count` into points (they currently do not; counts are gates, not scaled rewards).

---

## Rescue-Gate Audit

Searched suppressed / duplicate-loser / metadata-only / low-relevance pools on all live desks.

One Voices item belonged to a theme **and** sat in the weak-item pool:

| Candidate | Theme | Why ineligible | Hypothetical contribution if item gates did not exist |
| --- | --- | --- | ---: |
| Robert Reich, “Trump’s Phony $5,000 Bribe \| The Coffee Klatch…” | `hate bring remember jeffrey` (cooling, single creator) | `single_creator_seed`, `new_provisional`, `cooling_falling`, `weak_item` | **0** (theme still ineligible) |

No suppressed, duplicate-loser, stale, metadata-only, or off-scope item was rescued through the ranking floor. Ungated theme contribution was 0 because ranking still requires breadth ≥ 2 and non-falling cooling.

Matched PRIMARY FR items and SCOTUSblog specialists similarly received contribution 0.

---

## Single-Creator Theme Behavior

150 provisional single-creator themes remain stored (`intel.themes` + memberships + daily signals). They can collect future memberships (Kennedy Center started as a seed then gained a second creator).

Ranking effect today: **none**. `MIN_CREATOR_BREADTH_7D=2` and `creatorSeedStrength=single` both zero the contribution.

This distinction is working:

- **Persistence:** yes (HeadCount series activeDays14=5)
- **Ranking eligibility:** not necessarily

---

## Persistent Theme Examples

```
Theme: icymi post daily headcountorg
Headline: Coverage of icymi post daily headcountorg continues
Creators: 1 (Cure for Paranoia)
Creator items: 5
Active creator days: 1 / 7  and  5 / 14
Lifecycle: persistent
Momentum: 0 (falling / quiet today)
Newswire members: 0
Primary members: 0
Theme ranking: +0
Reasons: theme:ineligible:single_creator_seed
```

This is **not** the ideal ranking diagnostic (no multi-creator contribution). It **is** the correct persistence-vs-eligibility split.

There is no persistent **converged** theme in this corpus.

---

## Resurgence Examples

**No real resurgence exists yet.** `themesByLifecycle.resurging = 0`. None manufactured.

Cooling (39) and dormant (9) are mostly first-seen RSS items with no later creator day in this snapshot. A future daily ingest could create a real resurgence; it is not here today.

---

## AI Usage

| Metric | Value |
| --- | --- |
| Provider | `none` (deterministic fallback) |
| Model | `null` |
| Membership prompt version | `tm-membership-v1` |
| Label prompt version | `tm-label-v1` |
| Membership calls | 0 |
| Label calls this successful run | 20 (cap `THEME_MAX_AI_LABELS_PER_RUN`) |
| Cache hits / avoided membership work | 164 creator items skipped unchanged on the second process run; 1099 `no_match` analyses cached |
| Failures | 0 after the signal-upsert fix |
| Malformed model JSON | n/a (no Ollama calls) |
| Retry count | n/a |
| Average/median latency | **unavailable** (no AI HTTP telemetry; not added) |

Ollama is running locally and was **not** used. Labels/headlines are fingerprint templates: `Coverage of {tokens} continues`.

---

## Historical Coverage Limitations

Theme Memory persistence began **2026-09-15**.

- 1-day Voice/Newswire snapshot: meaningful as “what feeds contain today.”
- 3-day: incomplete as Theme Memory history; partial as RSS lookback.
- 7-day persistence: largely the items still sitting in each RSS document.
- 14/30-day lifecycle conclusions: **not trustworthy as accumulated Theme Memory**. Feeds that drop old episodes will look “cooling/dormant” even if creators discussed the subject last month.
- Intel history is richer (thousands of `source_items`) but is only **attached** to creator-led themes, and the adapter cap is 1000 rows / process window.
- Lifecycle “persistent” on the HeadCount series uses RSS timestamps, not 14 days of cron runs.

---

## Calibration Confidence

| Question | Confidence | Why |
| --- | --- | --- |
| Ingest/process plumbing works on real data | **High** | 361 observations, 152 themes, 182 memberships, 152 signals after the signal-row fix |
| Shadow mode does not change production order | **High** | 1085 compared items, 0 moved, `appliedContribution=0` |
| +5 cap / cooling cap / single-creator / dormant gates | **High** on this corpus (no eligible items to stress the numeric cap) | Vacuous success: contribution never left 0 |
| False-merge resistance | **Low–medium** | Several institution/country/party phrase attaches; no AI referee |
| False-split resistance | **Low** | Deterministic fallback refuses ambiguous merges by design |
| Longitudinal value beyond 36h convergence | **Low** | First ingest; only one 2-creator 2-day theme; 0 eligible ranking items |
| Label quality | **Low** | Provider `none` |
| 14/30-day lifecycle | **Low** | RSS lookback ≠ accumulated Theme Memory |

**Overall calibration confidence: LOW for ranking-tuning decisions; HIGH for “do not enable active mode yet.”**

---

## Findings

1. **Do not enable `THEME_RANKING_MODE=active`.** Zero items were eligible. Enabling active would change nothing today and would skip the needed AI/history evidence.
2. **First ingest is not 30 days of Theme Memory.** Tables were empty; all observation `created_at` values are 2026-09-15.
3. **Without AI, themes explode (152 from 164 voice items) and labels are token soup.** Ambiguous matches seed instead of merge.
4. **Deterministic Newswire/Intel attach on broad phrases is the main quality failure:** “Supreme Court”, “United States”, “Republican Senate”.
5. **Creator-led invariants hold** on real data.
6. **Ranking gates held:** no rescue of weak/suppressed/single-creator/dormant themes.
7. **Correctness bugs found and fixed (not calibration retunes):**
   1. `lastCreatorActivityAt` was spread into `intel.theme_daily_signals` upsert. Column does not exist. Process crashed after memberships, before lifecycle/signals. Fixed by persisting only table columns and keeping `lastCreatorActivityAt` in metadata. Regression: `tests/themeMemory/signals.test.ts`, `tests/themeMemory/process.test.ts`.
   2. Theme-attention prefetch `identity_key IN (...)` of 100 canonical URLs overflowed PostgREST GET URL limits (`TypeError: fetch failed`), so ranking continued **without** theme context. Chunk size for identity keys is now 12. Regression: `tests/themeMemory/themesDb.chunks.test.ts`.
8. Indicators and Statements desks had empty live pools in this snapshot; they were evaluated, not skipped by mistake.

---

## Recommended Changes

Recommendations only. **Not implemented** in this pass (except the two correctness bugs above).

1. Keep `THEME_RANKING_MODE=shadow` (or `off` in production until Pass 2). Do not switch to active.
2. Do not change `+5`, cooling cap, floors, stale hours, combined creator cap, or lifecycle thresholds yet. This corpus never exercised a non-zero contribution.
3. Configure `THEME_AI_PROVIDER=ollama` with an explicit `OLLAMA_MODEL` for Pass 2 (local models are already present). Re-evaluate false merges/splits and labels with AI membership **before** any weight change.
4. Run ingest daily for at least 7–14 days before trusting persistence/resurgence statistics.
5. Treat “Supreme Court” / “Congress” / “United States” / “Republican” as weak entities in deterministic narrowing (same class as `trump` in `WEAK_ENTITY_TOKENS`). This is the highest-value merge-quality recommendation.
6. Re-run shadow comparison after AI + a week of history, focusing on whether Kennedy-Center-class themes still look like 36-hour double-counting.
7. Raise or paginate the Intel adapter 1000-row cap only if Pass 2 shows missed attachments; do not do it as a ranking retune.
8. Do not start Milestone 4 (UI) until Pass 2 shows at least a handful of eligible multi-day converged themes with inspectable reason codes.

---

## Artifacts

- Human report: `docs/theme-memory-calibration-1.md` (this file)
- Machine-readable snapshot: `tmp/theme-memory-calibration-1.json` (**gitignored**; contains live titles/URLs)
- Supporting dumps (also gitignored): `tmp/theme-memory-ingest-1.json`, `tmp/theme-memory-process-1.json`, `tmp/theme-memory-corpus-dump.json`, `tmp/theme-memory-shadow-ranking.json`
