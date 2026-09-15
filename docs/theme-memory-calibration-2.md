# Theme Memory Calibration Pass 2

Real-data evaluation after weak-feature matching, VPS batch tooling, and an Ollama enablement attempt. Generated 2026-09-15.

Ranking was **not** switched to active. Weights were not retuned. No public Theme UI was built.

**Production ranking mode during this pass:** `THEME_RANKING_MODE=shadow`. Shadow calculates and exposes contribution; `appliedContribution` remains 0.

---

## Goals

- Reduce false merges caused by broad/weak semantic features
- Enable the existing Ollama provider for ambiguous membership (without sending every pair)
- Make daily Theme Memory processing runnable on the VPS next to localhost Ollama
- Recalibrate theme quality vs Pass 1
- Keep ranking in shadow

---

## Changes Since Pass 1

Implemented in this pass (not ranking retunes):

1. **Weak / low-information semantic features** are classified centrally in `lib/themeMemory/featureStrength.ts` as `strong` / `supporting` / `weak`.
2. A weak feature can support a match. It cannot, by itself, create a strong deterministic match. Scoring requires a **distinctive anchor**.
3. Analysis cache version is now `themeClassificationCacheVersion(provider)` (`tm-classify-v2` + `none`/`ai` + membership prompt version). A previous no-AI analysis does not permanently block later AI classification.
4. Membership prompt v2 tells the model not to merge on country/party/Congress/court/person overlap alone.
5. VPS/CLI batch: `npm run theme-memory:daily` and `npm run theme-memory:ai-check`. Ingest uses uncached Notion/Newswire fetches so the Node CLI does not need Next.js `incrementalCache`.
6. Exclusive run lock (`tmp/theme-memory-daily.lock` / `THEME_MEMORY_LOCK_FILE`).
7. systemd unit/timer examples under `deploy/theme-memory/`.
8. Duplicate-theme **reporting** only. No mass merge.

Not implemented (by design):

- `THEME_RANKING_MODE=active`
- ranking weight changes
- public Theme UI
- automatic merge of Pass 1 duplicate themes
- a `theme_memory_runs` table (journal + CLI summary + gitignored snapshots are enough)

---

## VPS Execution Architecture

```
Node process on the VPS (npm run theme-memory:daily)
        ↓
ingestThemeMemorySources()     → Supabase intel.theme_observations
        ↓
processThemeMemory()           → themes / memberships / signals
        ↓  (if THEME_AI_PROVIDER=ollama)
localhost:11434 Ollama
        ↓
print summary + exclusive lock release
```

The public Next.js deployment must **not** be used to reach VPS localhost Ollama. Do not expose Ollama publicly.

HTTP cron routes still call the same services. They are the wrong path when the website is hosted off-box.

Startup validation fails closed on missing DB, missing Theme Memory schema, missing Notion Voices config, or (when provider is `ollama`) an Ollama endpoint/model that does not answer. One creator feed failure is not fatal.

---

## Ollama Configuration

Configured through existing env names only:

```
THEME_AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
THEME_AI_TIMEOUT_MS=45000
THEME_AI_MAX_RETRIES=2
```

Model is not hardcoded in application logic. Example VPS env prefers the smaller installed model (`gemma3:4b`); `llama3:latest` remains usable by changing `OLLAMA_MODEL`.

**This development host:**

| Check | Result |
| --- | --- |
| `GET http://127.0.0.1:11434/api/tags` | reachable; `gemma3:4b` and `llama3:latest` listed |
| `POST /api/generate` and `/api/chat` | **fail** — `llama-server process has terminated: exit status 0xc0000005` |
| `npm run theme-memory:ai-check` | probe reports reachable + model installed, then inference error; membership schema was **not** produced |
| Theme Memory data | not modified by the smoke check |

Pass 2 processing therefore used `THEME_AI_PROVIDER=none` (deterministic fallback) so 80 crashing inference calls would not run. Ambiguous membership was **not** Ollama-classified on this machine.

A VPS where `llama-server` actually answers should set `THEME_AI_PROVIDER=ollama` and run `npm run theme-memory:ai-check` before enabling the timer.

---

## Weak-Feature Matching Changes

Central rules in `lib/themeMemory/featureStrength.ts` (not scattered stopword checks):

- **Weak:** broad countries, parties, Congress/Senate/House, Supreme Court / `court`, administration/government, election/campaign/vote, generic politician names/titles
- **Supporting:** generic legal/process/news words (`order`, `case`, `hearing`, `policy`, `candidate`, …) plus generated-label boilerplate (`coverage`, `tracked`, `creator`)
- **Strong:** remaining distinctive tokens, plus action/policy hints (`tariff`, `ballot`, `deployment`, `immigration`, …)

`scoreThemeCandidate` now requires a distinctive anchor (strong phrase, strong token, cluster key, or action+strong object). Weak overlap may add a small supporting bump only when an anchor already exists.

Creator-anchored fingerprints use **canonical label + creator member titles**, not generated `Coverage of … continues` headlines. That boilerplate had been making unrelated themes look identical.

---

## Corpus

Theme Memory persistence still began **2026-09-15**. This is still RSS-retrospective history plus one extra CLI ingest, not accumulated daily Theme Memory.

| Window (days) | Voice+Newswire observations | Intel `source_items` | Combined |
| ---: | ---: | ---: | ---: |
| 1 | 117 | 0 | 117 |
| 3 | 169 | 25 | 194 |
| 7 | 242 | 627 | 869 |
| 14 | 281 | 1535 | 1816 |
| 30 | 310 | 3791 | 4101 |

Observation total remains **361** after the first Pass 2 process snapshot (same as Pass 1). A later CLI ingest succeeded with Voices 15/15 (230 seen) and Newswire 7 sources (132 seen). Intel is still attached in place, adapter cap 1000 / 14-day window.

---

## Processing Results

First Pass 2 process run (existing corpus; `THEME_AI_PROVIDER=none` after Ollama inference proved crashed):

| Metric | Pass 2 |
| --- | ---: |
| Creator items considered (14d) | 164 |
| Creator items skipped unchanged | 164 (already members; history preserved) |
| Themes created | 0 |
| Themes updated | 1 |
| Deterministic memberships this run | 1 |
| AI membership checks | 80 (deterministic fallback `belongs: false`) |
| AI accepted | 0 |
| AI rejected | 80 |
| AI failures | 0 |
| Newswire attached this run | 1 |
| Intel attached this run | 0 |
| Labels generated | 20 (cap; still fallback templates) |
| Daily signals | 152 |

Stored totals after the run: **152 themes**, **183 memberships** (Pass 1 was 182). Lifecycle unchanged: new 98 / developing 5 / persistent 1 / cooling 39 / resurging 0 / dormant 9.

150/152 themes remain single-creator. 2 remain converged.

Existing creator memberships were **not** mass-moved. Pass 1 false-merge rows remain stored; new matching rules were used to **re-score** them.

---

## AI Usage

| Metric | Value |
| --- | --- |
| Intended provider | `ollama` / `gemma3:4b` |
| Provider actually used for process | `none` |
| Membership prompt | `tm-membership-v2` |
| Label prompt | `tm-label-v1` |
| Classification version | `tm-classify-v2` |
| Ollama membership calls | 0 (inference crash) |
| Fallback membership checks | 80, all rejected |
| Failures | 0 after skipping crashed llama-server |
| Smoke test structured output | not produced |

Cache semantics were verified in tests: a `none` analysis version does not match an `ai` version, so a future healthy Ollama run can reclassify unresolved `no_match` items.

---

## Pass 1 vs Pass 2

| | Pass 1 | Pass 2 |
| --- | ---: | ---: |
| Themes | 152 | 152 |
| Memberships | 182 | 183 |
| Single-creator themes | 150 | 150 |
| Converged / multi-creator | 2 | 2 |
| AI membership checks (Ollama) | 0 | 0 |
| Fallback membership checks | reconstructed / skipped on rerun | 80 reject |
| AI accepted / rejected / failures | 0 / 0 / 0 | 0 / 80 / 0 |
| Theme Ranking eligible items | 0 | 0 |
| Shadow movements | 0 | 0 |

Theme count did **not** drop. That is not a quality failure: Pass 1 creator seeds remain stored, and this pass did not destroy that history. Quality change is in **future attach rules** and in identifying which stored members would no longer attach.

---

## Known False-Merge Recheck

Existing memberships were kept. Status is whether **current** rules would still attach that member.

### 1. `supreme court block executive`

- Vaccine-mandate SCOTUSblog order list: **fixed** for new attaches (`weak_entity_only`; no distinctive anchor).
- Mail-in/absentee SCOTUSblog items sharing `ballot`: **still questionable** (plausible, not deterministic). That overlap is the actual dispute, not institution-only.
- Democracy Now! daily headlines: **still questionable** (plausible via residual `restrict` / supporting `block`).
- Stored false merge with the vaccine case remains in the table until a later conservative cleanup.

### 2. `capitalism turned united stat` / Federal Register Canadian-products notices

- All three PRIMARY rows: **fixed** for new attaches (`united states` / `into` are weak/supporting only).

### 3. `republican senate candidate cheat` / Drop Site opioid story

- **fixed** for new attaches (`republican senate` / `candidate` no longer a strong match).

### 4. `germany gerrymander mail-in voting`

- WIRED + SCOTUSblog mail-in items: **still questionable** (shared `mail-in`, not merely Supreme Court). May be a US election-admin cluster colliding with a Germany/gerrymander creator title.

### 5. `russian ship fire danish`

- Drop Site roundup that includes a Denmark helicopter line: **still matching** on `fire`/`danish`/`helicopter`. Possibly a real topical attach inside a multi-subject roundup, not a Supreme Court-style institution merge.
- Al Jazeera Denmark item: **still matching/questionable** on Danish helicopter overlap.

---

## Known False-Split Recheck

No automatic merge. Ollama was not available to join ambiguous creator seeds.

| Pair | Pass 2 reading |
| --- | --- |
| trump-a-palooza bribe vs recap | Title-evolution pair; label refresh made needle matching collapse to one label. Not forcibly merged. |
| SCOTUS block-executive vs break-major-from-supreme | **kept separate** under current rules (`weak_entity_only` across themes). Correct unless editorial review says they are one 2026 mail-in cluster. |
| oligarch wedding vs close-friend wedding | Distinctive `wedd` overlap, not deterministic. **remains split**; duplicate reporter still flags this pair. |
| republican afraid vs alter census | **kept separate** (party overlap only). Likely correct. |

Likely duplicate-theme candidates reported (not merged), after boilerplate fix:

1. HeadCount ICYMI daily-rap format cluster (`icymi post daily` vs other ICYMI posts) — format overlap; Pass 1 already treated splits as probably correct
2. Wedding/oligarch pair
3. “simple question” pair
4. JD Vance politics pair
5. “does maga …” pair

---

## Multi-Creator Themes

Still **2**. This is the most important Pass 2 quality output, and it did not expand because creator items were already members and Ollama did not reclassify them.

### bankrupted kennedy center

- Creators (2): Johnny Bananas, Brian Tyler Cohen
- Creator episodes: 2
- Lifecycle: developing
- Newswire / Intel / primary: 0 / 0 / 0
- Methods: deterministic
- Active creator days: 2 in the RSS lookback (still inside a short window)

### supreme court block executive

- Creators (2): Johnny Bananas, MeidasTouch Network
- Creator episodes: 2
- Lifecycle: developing
- Newswire 1 / Intel 3 / specialist 3
- Methods: deterministic
- Internally mixed: absentee-ballot order (creators) plus at least one unrelated vaccine SCOTUSblog member that would no longer attach

No additional 2+ creator themes were created.

---

## Theme Quality Review

Matching quality for **new** Newswire/Intel attaches improved on the Pass 1 failure classes (country, party/Senate, Supreme Court-only). Stored false merges were identified rather than silently rewritten.

Label quality is still low on this host (`Coverage of {tokens} continues`) because Ollama inference is down. The 20-label cap still applies.

Duplicate reporting is now based on creator titles/labels, not generated boilerplate. Five candidates remain for editorial review.

---

## Shadow Ranking

`compareThemeRanking` against live desk `preCapCandidates`, hypothetical `themeRankingMode: 'active'` inside the comparator only. Live mode: **shadow**.

| Lane | Pool | Matched | Eligible | Moved | Largest \|Δ\| |
| --- | ---: | ---: | ---: | ---: | ---: |
| OSINT | 291 | 10 | 0 | 0 | 0 |
| Watchdogs | 350 | 0 | 0 | 0 | 0 |
| Defense | 236 | 0 | 0 | 0 | 0 |
| Indicators | 0 | 0 | 0 | 0 | 0 |
| Statements | 0 | 0 | 0 | 0 | 0 |
| Voices | 208 | 3 | 0 | 0 | 0 |
| **Total** | **1085** | **13** | **0** | **0** | **0** |

Largest hypothetical contribution: **0**.

Homepage briefing was not re-fetched from the CLI (Next `unstable_cache` invariant). Desk-lane comparison used `getLiveIntelDeskUncached`.

---

## Double-Counting Audit

- Short-window creator overlap with eligible Theme Memory: **0**
- Combined creator-derived cap violations: **0**
- Primary provenance overlap on eligible themes: **0**
- Reporting diversity overlap on eligible themes: **0**
- Rescue-gate: no suppressed/duplicate-loser/metadata-only item received a Theme Memory contribution (eligible count 0)

The Kennedy Center theme is still the same 36-hour creator pair the short-window bridge already handles. It is not ranking-eligible.

---

## Historical Coverage Limitations

Do not confuse semantic matching improvements with longitudinal history.

- Durable observation storage began **2026-09-15**.
- 7/14/30-day lifecycle labels still mostly reflect **RSS lookback**, not days of Theme Memory cron.
- Even if a later Ollama run creates more multi-creator themes from current RSS pages, that is not yet Theme-Memory-observed persistence.
- Longitudinal confidence should increase only after repeated daily ingests.

---

## Operational Readiness

| Piece | Status |
| --- | --- |
| Weak-feature matching + tests | Ready |
| Analysis cache vs provider mode | Ready |
| `npm run theme-memory:daily` | Ready (direct services, lock, summary) |
| CLI ingest without Next cache | Verified (15/15 voices, 7 newswire sources) |
| `npm run theme-memory:ai-check` | Ready as a command; **fails on this host** because llama-server crashes |
| systemd examples | Documented, not installed |
| Overlap lock | File lock + oneshot unit |
| Ollama inference on this Windows host | **Not ready** |
| Daily VPS timer | Ready **if** the VPS Ollama generate/chat path works |
| Active ranking | Must stay off |

---

## Findings

1. Do **not** enable `THEME_RANKING_MODE=active`. Eligible contribution is still 0.
2. Broad-feature hardening works for the Pass 1 country/party/SCOTUS-vaccine classes on **new** attaches. Stored false merges remain until a later audited cleanup.
3. False splits were not joined. Ollama never ran. Duplicate reporting is conservative and now ignores label boilerplate.
4. This machine can list Ollama models but cannot run them (`0xc0000005`). Tags-only probes would have falsely passed; generate ping is now part of startup validation.
5. Theme Memory CLI ingest must not use Next `unstable_cache`. That is fixed.
6. Creator-led invariants still hold. Ranking gates still hold.

**Overall calibration confidence:** still **LOW** for ranking-tuning; **HIGH** for “keep shadow.” Matching rules are better; semantic convergence via AI is unproven until Ollama inference works on the VPS.

---

## Recommendations

Recommendations only. **Not implemented** as ranking changes.

1. Keep `THEME_RANKING_MODE=shadow`. Do not switch to active.
2. Do not change `+5`, cooling cap, floors, stale hours, combined creator cap, or lifecycle thresholds.
3. On the VPS, confirm `npm run theme-memory:ai-check` with `OLLAMA_MODEL=gemma3:4b` (or another installed model) actually returns valid membership JSON. Then enable the systemd timer.
4. Run ingest+process daily for 7–14 days before trusting persistence/resurgence.
5. After a healthy Ollama run, re-evaluate the two converged themes and the reported duplicate candidates. Still do not mass-merge.
6. Optionally detach stored members that current rules mark `weak_entity_only` (FR Canadian notices, opioid/Senate, vaccine order list) in a later audited pass.
7. Do not start Milestone 4 (UI) yet.

---

## Artifacts

- Human report: `docs/theme-memory-calibration-2.md` (this file)
- Machine-readable snapshot: `tmp/theme-memory-calibration-2.json` (gitignored)
- Supporting dumps: `tmp/theme-memory-ingest-2.json`, `tmp/theme-memory-process-2.json`, `tmp/theme-memory-shadow-ranking.json`
- VPS examples: `deploy/theme-memory/`
