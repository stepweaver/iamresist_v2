# Jev shadow evaluation

Jev is a semantic routing layer between grounded Atomic Notes and Event/Theme Memory. Milestone 1 evaluates whether two Atomic Notes should attach to the same concrete Event Thread. `same_event` keeps its stored name and means that membership. The notes do not need to state the same proposition. A direct claim, evidence note, creator analysis, why-it-matters note, or immediate implication can belong with the event it concerns. Sharing a topic, conflict, actor, or theme is `related_but_distinct` when the concrete occurrences differ. This run does not classify note role as its own question, assign themes, or write ranking signals.

Event Threads V1 stays the frozen baseline. Its overlap score retrieves candidates. It does not decide that two notes are the same event.

## What this run asks

For each labeled note, retrieval ranks other editorial notes with the existing identity score.

- The diagnostic set is the raw top 10.
- The raw top 5 is the Jev input before human-status filtering.
- Jev is called only when the query Atomic Note is `usable`.
- Within that raw top 5, only candidates whose human status is `usable` are sent. Their retrieval order and retrieved rank stay as retrieval assigned them. `new_event` stays available. Invalid candidates remain in the raw retrieval diagnostics and are left out of the semantic call.

Each usable candidate is a separate call with two questions:

- Noul: "Should these Atomic Notes attach to the same concrete Event Thread?"
- Choice: `same_event`, `related_but_distinct`, `unrelated`, or `uncertain`.

Each note sent to Jev includes its `kind` with the text and evidence. Proximity in a transcript is not a reason to attach two notes to the same Event Thread.

One more Choice picks among the usable candidate ids or `new_event`.

`--eval` prints query and candidate eligibility counts before any Jev call. Semantic evaluation eligibility requires usable human Atomic Notes. That sentence is stored on the run record for later reports.

The requested model is the `jev-latest` alias. Startup calls `GET /v1/models` and stops if that exact name is missing. It does not fall back to `jev-preview` or any other id. The run JSONL starts with the catalog record for that alias: `requestedModel`, `modelCatalogName`, `modelCatalogReleaseDate`, and `modelCatalogDescription` when the catalog includes one. Each decision stores the System One response model separately as `returnedModel`. A versioned id such as `jev-1.13.0` is the alias resolving to a release. Any other returned name is printed and stored as unexpected.

A recorded merge requires the candidate Choice, `same_event`, and a Noul at or above the threshold under test. The report sweeps thresholds. Nothing is written to events, themes, notes, or ranking.

## Commands

```bash
npm run jev:shadow -- --export-labels --source-item <id> --out labels.json
npm run jev:shadow -- --eval --labels labels.json
npm run jev:shadow -- --report --labels labels.json --decisions tmp/jev-shadow/<run>.jsonl
```

`--export-labels` can take more than one `--source-item`. The sheet has a top-level `notes` map keyed by Atomic Note id. Each record is stored provenance — id, source item, creator id and creator name when the voice catalog has one, kind, content role, statement role, attribution, quoted speaker, text, source quote, the full source excerpt, timestamps, and source segment indexes — plus one human `status` and an optional `reviewReason`. The exporter also adds a wider `discourseContext` of about 90–180 seconds around the note's source segment indexes. It uses the original extraction transcript when those indexes still map, then stored source excerpts from the same extraction run. It does not fetch a new transcript or invent missing text. `discourseContextSource` is `stored_podcast_transcript`, `transcript_cache`, `source_item_transcript`, or `unavailable`. When `discourseContext` is null, `discourseContextFailureReason` says why. That wider window is for speaker and rhetorical-mode review. It does not justify factual content outside `sourceExcerpt`. Human rhetorical fields start null: `speechMode`, `representedSpeaker`, and `attributionReviewReason`. `speechMode` is `creator_assertion`, `creator_inference`, `quoted_other`, `paraphrased_other`, `hypothetical_or_sarcastic_other`, or `unclear`. Fill `status` once per note before `--report`. Each status is `usable`, `misattributed`, `unsupported`, `non_editorial`, or `unclear`. Pair rows reference `noteId` and `candidateId` and carry `relation`, `correctCandidateIds`, `correctCandidateId`, `v1SameThread`, `overlapScore`, `retrievedRank`, and `inJevSet`. `relation` is required when both notes are `usable` and the pair can be shown to Jev. It is one of `same_event`, `related_but_distinct`, `unrelated`, or `uncertain`. `correctCandidateIds` names every acceptable anchor. A legacy `correctCandidateId` can still name a note retrieval never proposed.

`--export-labels` emits a directed row for every raw top-5 candidate. Those pairs are not dropped by the diagnostic cap. `--eval` refuses to call Jev when any usable pair in that sanitized set has no human `relation`.

`correctCandidateIds` lists every acceptable same-event anchor for a query. A legacy `correctCandidateId` is still read. An empty set means the correct candidate choice is `new_event`. Candidate choice is correct when Jev selects any id in that set, or `new_event` when the set is empty. Query-level raw candidate recall is a hit when any acceptable id is in the raw top 10 or raw top 5. That is not a pair count.

A pair counts toward relationship accuracy only when both notes are `usable`, the pair was shown to Jev, and it has a human `relation`. Atomic Note quality counts each note once. Notes that are not `usable` are left out of false merges and false splits. A policy merge still requires the candidate Choice to name that candidate, the relationship Choice to be `same_event`, and the Noul to clear the threshold under test. The report lists those three conditions separately.

The baseline log `tmp/jev-shadow/407dcc61-59ed-4c21-b3ae-c5c4a16968ca.jsonl` records the original literal-event wording. Leave that file unchanged.

`TYPESAFE_API_KEY` must be in the environment for `--eval`. The key is not logged.

## How to read the report

Query-level raw candidate recall asks whether any acceptable same-event candidate was in the raw top 10 and the raw top 5. A miss there is a retrieval miss, not a Jev false split.

Candidate-choice accuracy asks whether the selected candidate is one of `correctCandidateIds`, or `new_event` when that list is empty. Pair relationship accuracy compares the relationship Choice with the human label on usable pairs Jev was shown. A policy merge still requires the candidate Choice to name that candidate, the relationship Choice to be `same_event`, and the Noul to clear the threshold. The report lists those conditions with false merges and false splits.

False event merges are the primary metric. They count only labeled pairs Jev was shown where both Atomic Notes are `usable` and the policy records a merge the human label does not call `same_event`. Unlabeled shown pairs are listed and left out of those counts. A live evaluation refuses them before any provider call.
