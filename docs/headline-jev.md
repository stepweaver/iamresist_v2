# Headline Jev shadow evaluation

**AI interprets. Code counts.**

Jev classifies the relationship between two published items. Deterministic software still decides what clusters, what ranks, and what `/brief` shows. Jev does not choose importance, editorial priority, political value, or what a reader should believe.

Milestone 1 is shadow mode. Nothing in this pass changes production `/brief` output.

## The problem being tested

The headline timeline already clusters titles with deterministic lexical overlap. That catches shared figures, names, and distinctive tokens. It misses paraphrases of the same event, and it correctly refuses to glue two stories together just because they mention the same person or the same war.

The open question is whether a bounded semantic classifier can label the fuzzy middle: pairs that share a distinctive token but do not already meet the lexical cluster bar. The eval harness measures that. It does not apply the answer.

## What already exists

`lib/headlineTimeline/` loads creator, newswire, and intel candidates, compares titles, clusters matches with union-find, and ranks clusters by distinct creator convergence, distinct news-source convergence, and recency. `/brief` reads that timeline. This milestone does not replace `clusterHeadlineCandidates` and does not change ranking weights.

## What Jev is allowed to do

For a pair the prefilter marks `ask_jev`, Jev receives only:

- title
- description (the candidate `summary`)
- publishedAt
- sourceType (`creator` or `news`)

It answers one Choice question: are these the same specific event, the same broader topic, different, or unclear?

It does not receive database ids, URLs, internal scores, or editorial metadata. It does not generate headlines. It does not see the rest of the corpus.

## What code keeps

- The prefilter decides which pairs are already a lexical match, which are worth asking, and which are skipped.
- A named threshold, `JEV_SAME_EVENT_JOIN_THRESHOLD` (currently 0.80), decides whether a `same_event` answer may *propose* a join. Both the `same_event` probability and the reported confidence must clear it.
- `same_broader_topic` does not join an event cluster.
- `different` does not join.
- `unclear`, low confidence, a missing API key, a timeout, a rate limit, malformed output, or a network failure produce review / no automatic join.
- Ranking stays on distinct creator counts, distinct news-source counts, and recency. Creator convergence is attention, not factual corroboration. News-source counts stay a separate number.

If Jev is absent or failing, the existing deterministic pipeline is unchanged and still usable. Milestone 1 has no production dependency on Jev.

## How to run

`TYPESAFE_API_KEY` must be set in the server environment or `.env.local`. The eval script loads `.env` and `.env.local` the same way the other timeline scripts do. Do not commit the key.

Optional:

- `TYPESAFE_JEV_MODEL` — default `jev-latest`
- `TYPESAFE_JEV_TIMEOUT_MS` — default `20000`

```bash
npm run brief:jev-eval -- --limit 25 --json tmp/headline-jev-eval/run.json
```

`--limit` caps Jev calls. The default is 25. `--limit 0` runs the prefilter and does not call the API. `--json` writes a local artifact for later human labeling. `tmp/` is gitignored. Do not commit eval results.

The command only reads recent headline candidates. It does not update headlines, event threads, Theme Memory, Atomic Creator Notes, intel rows, or ranks.

## Cross-source eval priority

`/brief` cares more about convergence across sources than about two headlines from the same outlet. The eval queue still includes same-source pairs, but it spends Jev calls in this order:

1. creator ↔ a different creator
2. creator ↔ news
3. news ↔ a different news source
4. same-source pairs

Same source means the same `sourceId`, or the same source name when one outlet arrives through more than one channel. Inside a bucket, the original candidate order is kept: newer items first, then id. This ordering is evaluation-only. It does not change `clusterHeadlineCandidates`, ranking, or what `/brief` shows.

## Skipped-pair inspection

The prefilter returns `skip` for pairs it will not send to Jev. Some of those are false negatives: paraphrases with no distinctive shared anchor. Inspect them without spending Jev credits:

```bash
npm run brief:jev-eval -- --limit 0 --sample-skipped 25
```

`--sample-skipped` defaults to 0 and accepts only a non-negative integer. `--limit 0` makes this command call Jev zero times. A positive limit can run both:

```bash
npm run brief:jev-eval -- --limit 10 --sample-skipped 25 --json tmp/headline-jev-eval/run-02.json
```

The sample is deterministic. For a request of 25, and a skip pool diverse enough to fill both halves, it prints 13 near-miss rows and 12 baseline rows.

- Near-miss: skips in source-bucket order, then higher deterministic similarity. A source already used, or an outlet pair already chosen, is skipped until distinct pairs cannot fill the quota.
- Baseline: an even spread of the remaining skip pool, in encounter order inside each bucket, under the same source cap.

Cross-source skips are taken before same-source skips, using the same four-bucket order as the Jev queue. If a higher-priority bucket runs out, later buckets fill the open slots. A request larger than the skip pool is split about in half across whatever remains. Near-miss and baseline rows do not repeat a pair. There is no unseeded randomness. Each printed row is labeled `near-miss` or `baseline`.

One outlet cannot fill the sample. Across both halves, any single source appears at most 3 times, whether it is side A or side B. The same outlet name on two channels counts once. Distinct outlet pairs are preferred: Al Jazeera paired with a second outlet is taken before another Al Jazeera pair with that same outlet. If the cap runs out before the request is filled, the sample is shorter rather than repeating the dominant source.

Each printed skip shows both sources, titles, summaries when present, deterministic similarity, whether the lexical check would cluster, and the prefilter skip reason. With `--json`, those rows are also stored as `skippedSamples` for later manual labeling. The file stays local. Nothing is written to Supabase.

## Candidate snapshots

Live mode is the default. The command loads current creator, newswire, and intel candidates, then evaluates that load. That is the operational path.

Snapshot mode freezes one load so Jev calls, human review, and threshold tuning all see the same pairs. Save the corpus once:

```bash
npm run brief:jev-eval -- --limit 0 --save-candidates
```

That writes `tmp/headline-jev-eval/candidates-YYYYMMDD.json` using the local calendar date. Pass a path to override it. `--limit 0` saves the file and does not call Jev. A later command can still sample or call Jev while saving:

```bash
npm run brief:jev-eval -- --limit 10 --sample-skipped 25 --save-candidates --json tmp/headline-jev-eval/run.json
```

The candidate file is written before any Jev call. Reuse it with `--input`. That path does not read live feeds, and it keeps the snapshot's window and warnings:

```bash
npm run brief:jev-eval -- --limit 0 --sample-skipped 25 --input tmp/headline-jev-eval/candidates-20261002.json
npm run brief:jev-eval -- --limit 25 --input tmp/headline-jev-eval/candidates-20261002.json --json tmp/headline-jev-eval/run.json
```

`--save-candidates` and `--input` cannot be combined. Live runs that omit `--save-candidates` do not overwrite a snapshot. `tmp/` is gitignored. Do not commit the corpus or the eval results.

The text report and the `--json` artifact record `corpus` as `live` or `snapshot`, plus the snapshot path when one was saved or read.

## Activation later

A later milestone may let a high-confidence `same_event` proposal feed the existing union-find step. That requires a human-reviewed eval set and a threshold chosen from those labels. Until that review exists, Jev stays off the `/brief` path.

**AI interprets. Code counts.**
