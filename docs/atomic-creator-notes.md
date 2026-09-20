# Atomic Creator Notes

A deterministic, inspectable pipeline that turns creator transcripts into structured notebook-style notes.

This is **not** a Theme Memory rewrite. Theme Memory stays intact. Ranking mode is unchanged (`THEME_RANKING_MODE=shadow` in current ops). Creator notes do **not** create theme memberships, theme identities, daily signals, or ranking writes.

Atomic Creator Notes are currently an **editorial/research dataset**.

They are **not** yet:

- public
- Theme Memory evidence
- ranking input
- fact-checked output

The first success criterion is not article generation. It is:

> Do these look like useful notes I would actually have written while listening?

## Purpose

Creator headlines and video/podcast titles are often poor representations of the actual content — vague, promotional, rhetorical, or click-oriented.

Examples of the general problem:

- "Trump GETS HIS KARMA..."
- "DEAR GOD: This is OFF THE RAILS"

We do **not** infer detailed event identity from titles alone.

The extractor behaves like a careful listener with a notebook:

> If a careful listener were taking useful notes while listening to this creator, what specific things would they write down?

Transcript content is authoritative. Title text is metadata only.

## Architecture

```
Notion Voices
        ↓
existing Voice RSS discovery
        + configured official podcast feeds for matched creators
        ↓
eligible recent podcast episodes
        ↓
transcript/content
  A. supplied JSON file, or
  B. Podcasting 2.0 / explicit RSS transcript, or
  C. official creator transcript page (configured adapter), or
  D. local faster-whisper audio fallback (`--transcribe-audio` only), or
  E. YouTube captions (experimental, not used by automatic batch)
        ↓
deterministic evidence windows (~30-60s)
        ↓
local Ollama / gemma3:4b  (bounded batches of 4–6 windows; grounding stays per window)
        ↓
local evidence-window extraction cache (source + transcript + norm version + window hash + extraction version + model)
        ↓
strictly validated JSON
        ↓
atomic creator notes
        ↓
Supabase intel.creator_note_runs
        + intel.creator_atomic_notes
        ↓
CLI diagnostic output / review command
```

Single-item mode still exists for calibration. Bounded **podcast** batch mode discovers eligible Voice podcast episodes automatically. Automatic YouTube caption ingest is **disabled** from default batch selection; the YouTube retrieval code remains in the repo as experimental/non-default. Neither path writes Theme Memory or ranking state.

Reuse:

- `THEME_AI_PROVIDER`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` (fallback only)
- `CREATOR_NOTES_MODEL` (production extraction model; intended value `gemma3:4b`)
- `CREATOR_NOTES_AI_TIMEOUT_MS` (Atomic Notes Ollama timeout; independent of Theme Memory)
- existing Ollama chat helper (`ollamaChatJson`)
- intel schema / Supabase service-role client
- Theme Memory CLI preload (`.env` loading + `server-only` stub)

Creator notes **require** `THEME_AI_PROVIDER=ollama`. There is no deterministic fallback that invents notebook content. Ordinary unit tests inject a mock extractor and do not call Ollama.

## Note kinds

| Kind | Meaning |
|------|---------|
| `event` | An observable occurrence or development described in the transcript. |
| `claim` | A factual assertion made by the creator. **Not automatically true.** |
| `new_development` | A newly described change within an ongoing event. |
| `context` | Explanatory or background information needed to understand the current item. |
| `evidence_reference` | A named external evidentiary source the creator explicitly invokes (article, publication, report, official statement, filing, dataset). The name must occur in that evidence window. Subject countries/actors are not sources. Rejected `evidence_reference` notes are dropped, not converted to another kind. |
| `creator_analysis` | The creator's interpretation or inference. **Not a fact. Not an event.** |
| `why_it_matters` | The creator's explanation of significance or consequence. **Not a fact.** |

Do not collapse these categories. Do not convert analysis into `event` merely because it concerns an event. Do not force category diversity.

```
creator_analysis != fact
why_it_matters != fact
claim != verified fact
```

## Attribution model

Attribution is required for:

- `claim`
- `creator_analysis`
- `why_it_matters`

When the source has one known `creatorName`, that name is used as attribution instead of generic **"The speaker"**. If the transcript clearly identifies a guest or another speaker, that identity is preserved. Speaker identities are never invented.

"The speaker" means only an unidentified person in the transcript. The extractor does **not** infer a government title or role from the word speaker.

If `creatorName` is unavailable, generic speaker attribution is acceptable.

If attribution is required and still missing after filling the known creator name, the note is rejected.

## Verification model

```
unverified | supported | disputed | contradicted | not_applicable
```

Milestone 1 defaults (application-assigned, **not** LLM-assigned):

- factual notes (`event`, `claim`, `new_development`, `context`) → `unverified`
- `creator_analysis` → `not_applicable`
- `why_it_matters` → `not_applicable`
- `evidence_reference` → `not_applicable`

The model is not allowed to mark something `supported`, `disputed`, or `contradicted` from world knowledge. Those states exist for a future verification workflow.

There is no automated external fact-checking in this milestone.

## Provenance hierarchy

The model does **not** get to manufacture transcript evidence.

| Layer | Meaning |
|-------|---------|
| Original transcript segments | Source of truth. The application groups them into deterministic evidence windows before calling the model. |
| Evidence window | ~30-60 seconds or ~800-1500 characters of contiguous original segments, with ~10-15 seconds of overlap. The application owns `sourceSegmentIndexes`, start, and end. |
| `sourceExcerpt` | The **full verbatim evidence window**. Copied by application code. Never generated or rewritten by the model. |
| `sourceQuote` / `supportQuote` | Required **short verbatim span** from that window. Illustrative, not the entire grounding contract. Mechanically verified by normalized literal substring match. |
| `exactQuote` | Persistence alias for `sourceQuote` (`exact_quote` column). |
| `text` | Concise **AI-generated notebook paraphrase** of one primary proposition. Usually 1-2 sentences, preferably <= 350 characters. |
| `eventFeatures` | Unverified structured extraction **candidates**. Not theme identity and not auto-linked. |

```
sourceExcerpt = exact evidence window copied by code from original segments
text          = concise AI-generated notebook note
```

The model extracts from one known window and returns `kind`, `text`, and `sourceQuote`. It does **not** choose global transcript segment indexes. For every accepted note the application:

1. validates `kind` (required; unknown/missing kinds are rejected, never defaulted to `event`)
2. attaches the window's `sourceSegmentIndexes` plus start/end timestamps
3. copies the full window as `sourceExcerpt`
4. verifies `sourceQuote` as a normalized literal substring of that window
5. rejects notes that introduce numbers/percentages/dates/currency amounts absent from the window, or that pack multiple independent propositions into one note

A note may only contain information found in its window. Multiple kinds may inherit the same window. Empty `{"notes":[]}` is success for that window. Notebook `text` is capped at 500 characters.

A fabricated or paraphrased `sourceQuote` rejects the note. Unverifiable quotes are never rewritten into something that looks verbatim. One bounded repair attempt may re-extract the window.

The notebook paraphrase should preserve concrete names and identifiers that actually appear in the transcript (people, courts, cases, filings, dates, amounts). It must not invent them from outside knowledge, and it should not replace them with generic nouns.

## Event features

Optional lightweight candidates on a note:

```
actors[], action, object, institutions[], locations[], referencedDocuments[]
```

These are extraction candidates. They are **not** Theme Memory identity. They do not create memberships, mutate themes, or count as verified entities. Duplicate strings are removed case-insensitively. Original human-readable names are kept.

## Transcript input

The preferred creator-content path is now **podcast episode transcripts**, not YouTube captions.

Preferred source hierarchy:

```
Podcast episode
  → Podcasting 2.0 <podcast:transcript>
  → official creator transcript page (configured adapter)
  → local audio transcription fallback (single-episode CLI, --transcribe-audio only)
  → unavailable
```

If no public transcript exists, the status is `TRANSCRIPT_UNAVAILABLE` unless `--transcribe-audio` is passed on `creator-notes:extract-podcast` and the episode has an RSS audio enclosure. That opt-in path downloads the enclosure to a temporary directory, transcodes to 16 kHz mono speech with ffmpeg, transcribes locally with faster-whisper (CPU), and feeds timestamped segments into the existing Atomic Notes pipeline. Publisher transcripts still win. Batch ingest does not transcribe audio. Paid transcription APIs are not used. Whole podcast audio is never stored in Supabase; only a local transcript cache under `tmp/creator-notes-audio-transcripts/` is reused.

YouTube caption retrieval remains in the codebase as **experimental / non-default**. `creator-notes:batch` no longer selects YouTube items automatically. Single-item `creator-notes:extract --source-item <youtube-id>` can still fetch captions when you ask it to.

Creator identity is reused from Notion Voices (`Title`, `Voice Slug`, `Platform`, `Feed URL`, `Main URL`). There is no second creator registry. Non-YouTube Voice feeds are treated as podcast feeds. A small official-adapter table may add a known creator's official podcast RSS (currently David Pakman) without replacing Voices.

### Formats

Public transcripts are normalized into `CreatorTranscriptInput` / `CreatorTranscriptSegment[]` without rewriting wording:

- `text/vtt`
- `application/x-subrip` / SRT
- `application/json` when the structure is understood (Podcasting 2.0 `segments[]`, or `{startSeconds,endSeconds,text}`)
- `text/plain`
- `text/html` only when RSS/`podcast:transcript` explicitly identifies a transcript page, or a configured official adapter extracts a labeled transcript body

VTT/SRT parsing is deterministic: preserve cue timestamps, strip formatting tags, drop empty cues, merge tiny adjacent cues toward 15–30 second segments, and do not merge across gaps larger than 3 seconds.

### Provenance and playback

Every accepted note keeps:

- episode / audio identity (`sourceItemId`, `sourceUrl` / `audioUrl`)
- `startSeconds` when the transcript supplied timestamps

External podcast apps are **not** required to support timestamp deep links. A later UI can seek an embedded HTML5 audio player to `startSeconds` on the episode's audio URL.

Transcript acquisition also records `transcriptSource` (`podcast_namespace` | `official_creator_page` | `local_audio_transcription`), `transcriptUrl`, `transcriptMimeType`, and `transcriptLanguage` so a later UI can show:

```
Podcast episode → Transcript → timestamp → note
```

Local audio transcription also records the original enclosure URL plus `transcriptionProvider`, `transcriptionModel`, and `transcriptionVersion`.

Statuses are explicit and are not collapsed:

| Status | Meaning |
|--------|---------|
| `TRANSCRIPT_AVAILABLE` | A public transcript was fetched and normalized, or local audio transcription produced segments |
| `TRANSCRIPT_UNAVAILABLE` | No public transcript candidate, no official page body, and audio fallback was not enabled or had no enclosure |
| `TRANSCRIPT_FETCH_FAILED` | Network / HTTP failure. **Not** "no transcript" |
| `TRANSCRIPT_FORMAT_UNSUPPORTED` | Payload type is not a supported transcript format |
| `TRANSCRIPT_PARSE_FAILED` | Supported type, but the file could not be parsed |
| `TRANSCRIPT_EMPTY` | Parsed, but produced no usable segments |
| `AUDIO_DOWNLOAD_FAILED` | RSS enclosure download failed |
| `AUDIO_TOO_LARGE` | Enclosure exceeded the bounded download size |
| `AUDIO_TRANSCODE_FAILED` | ffmpeg normalization failed |
| `TRANSCRIPTION_FAILED` | Local Whisper failed |
| `TRANSCRIPTION_EMPTY` | Whisper ran, but produced no usable segments |

Two CLI families:

### A. Supplied transcript file

CLI reads a JSON file. No remote caption fetch is performed.

```json
{
  "creatorName": "David Pakman",
  "sourceTitle": "DEAR GOD: This is OFF THE RAILS",
  "sourceUrl": "https://www.youtube.com/watch?v=example",
  "segments": [
    { "startSeconds": 0, "endSeconds": 18, "text": "..." },
    { "startSeconds": 18, "endSeconds": 42, "text": "..." }
  ]
}
```

`--source-item` is the provenance id. Real persisted runs should use the intel `source_items.id` UUID whenever possible. Calibration and local dry-runs may use any stable string (for example `calibration-david-pakman-2026-09-17`). Source metadata lookup only queries `source_items` when that id is a UUID and the run is **not** `--dry-run`. Non-UUID ids skip the lookup rather than sending invalid input to Postgres.

Optional file fields fill creator/title/URL when the database row is missing or unavailable. Explicit CLI flags (`--creator-name`, `--source-title`, `--source-url`) fill remaining missing fields. They do not override stored source metadata on persisted runs, and they are not written back as invented `source_items` rows. Omitted flags stay null when metadata cannot be resolved. Known `creatorName` is used for required attribution.

During calibration, source metadata may be absent unless the transcript file or CLI flags supply it. Extraction still proceeds. Do not invent metadata.

### Podcast discovery (read-only)

```bash
npm run creator-notes:podcast-sources -- --limit 20
```

Prints `ID`, creator, episode title, published time, transcript discovered yes/no, transcript source, and whether an audio URL is present. Newest first.

### Single podcast episode extraction

```bash
THEME_AI_PROVIDER=ollama \
CREATOR_NOTES_MODEL=gemma3:4b \
npm run creator-notes:extract-podcast -- \
  --source-item <PODCAST_EPISODE_ID> \
  --dry-run
```

Local audio transcription fallback (publisher transcript still wins; required flag; dry-run still writes only a local transcript cache, never creator-notes rows):

```bash
python3 -m pip install -r scripts/audio-transcription/requirements.txt

THEME_AI_PROVIDER=ollama \
CREATOR_NOTES_MODEL=gemma3:4b \
npm run creator-notes:extract-podcast -- \
  --source-item <PODCAST_EPISODE_ID> \
  --transcribe-audio \
  --dry-run
```

Requires `ffmpeg` and faster-whisper on the host. Cache: `tmp/creator-notes-audio-transcripts/`. Do not enable a systemd timer for this path yet.

Flow: resolve episode from Voices RSS / official adapter feed → resolve transcript (publisher first; optional `--transcribe-audio` fallback) → normalize → **existing** Atomic Notes extraction → preview. This does not duplicate the AI pipeline. Transcription always finishes before Ollama extraction starts. Elapsed times are reported separately for audio download, transcription, Atomic Notes extraction, and total.

### Bounded podcast batch

```bash
npm run creator-notes:podcast-batch -- --limit 10
```

Defaults: limit 10 (hard max 50), 48-hour recency window, newest first. Only episodes with a usable public transcript are extracted. Missing transcripts are `TRANSCRIPT_UNAVAILABLE`. Audio is never transcribed.

### B. Automatic transcript retrieval from a supported source item

When `--transcript-file` is omitted, the CLI resolves a **real existing** creator/Voice item, fetches its YouTube caption track, normalizes cues into `CreatorTranscriptSegment[]`, and continues through the same extraction pipeline.

Voice items are **not** assumed to be intel UUIDs. Public Voices items are constructed from the Notion voice registry plus RSS. Their stable identity is the feed guid (`yt:video:VIDEO_ID` for YouTube), not `intel.source_items.id`. Theme Memory consumes the same Voice RSS items as observations (`identity_key` `yt:VIDEOID` or `url:…`) but creator-notes retrieval does not write Theme Memory tables.

Resolution order:

1. If `--source-item` is an intel UUID, look up `intel.source_items`
2. Otherwise match a live Voice RSS item by guid, `yt:video:` / `yt:` identity, or stored YouTube URL / video id

Supported YouTube shapes: `youtube.com/watch?v=…`, `youtu.be/…`, and stored Voice identities such as `yt:video:VIDEO_ID`.

Caption preference: manual/public creator captions, then auto-generated captions. The CLI does not synthesize a transcript with an LLM and does not substitute title/description text.

If `--transcript-file` is present, it always wins and remote retrieval is skipped.

The episode title may be stored and shown. It is **not** treated as event identity, and it is **not** usable as Atomic Note content unless those words also occur in the evidence transcript.

## CLI usage

### Single-item extraction

Supplied transcript:

```bash
npm run creator-notes:extract -- \
  --source-item <source-item-id> \
  --transcript-file ./tmp/test-transcript.json
```

Automatic YouTube captions from an existing Voice/source item:

```bash
npm run creator-notes:extract -- \
  --source-item <real-existing-item-id> \
  --dry-run
```

List recent creator/Voice items (read-only) to obtain a real id:

```bash
npm run creator-notes:sources -- --limit 10
```

The listing prints `ID`, creator, title, published time, and provider. Typical Voice ids look like `yt:video:VIDEO_ID`, not intel UUIDs.

Bounded **YouTube** batch ingest is preserved in code but **not selected by default**. Use `creator-notes:podcast-batch` for automatic production ingest.

```bash
npm run creator-notes:batch -- --limit 10
```

Optional:

```bash
npm run creator-notes:batch -- --limit 10 --dry-run
npm run creator-notes:batch -- --limit 10 --creator david-pakman
npm run creator-notes:batch -- --limit 10 --since-hours 24
npm run creator-notes:batch -- --limit 10 --force
```

Defaults:

| Flag | Default |
|------|---------|
| `--limit` | `10` (hard maximum `50`) |
| `--since-hours` | `48` (hard maximum `168`) |

Eligibility (creator/Voice only):

- real Voice RSS item
- YouTube provider with a resolvable video id
- published within the recency window
- caption retrieval is supported
- not a duplicate Voice identity
- not already completed for the same source identity + transcript hash + extraction version + model/provider
- not an obvious non-content feed artifact (`yt:playlist:` / `yt:channel:` style identities)

Batch processing is **newest first**, with stable `sourceItemId` / `creatorId` tie-breaks. One item failure does not abort the batch. Caption failures (`no captions`, fetch error, malformed captions, empty transcript) are operational skips, not a broken creator feed.

Requests to Ollama are **sequential**. A process lock (`tmp/creator-notes-batch.lock`, overridable with `CREATOR_NOTES_LOCK_FILE`) prevents overlapping batches. If a batch is already running, the second invocation exits cleanly.

Normal batch mode **writes** `intel.creator_note_runs` and `intel.creator_atomic_notes`. `--dry-run` extracts and prints with zero creator-note writes.

### Review

Read-only operator inspection of persisted notes, grouped by source item:

```bash
npm run creator-notes:review -- --limit 50
```

Default `--limit` is `25` source items. Useful filters: `--creator <slug>`, `--kind <kind>`, `--since-hours <n>`, `--source-item <id>`, `--json`.

The review command only SELECTs creator-notes tables. It does not write Theme Memory, ranking, or creator-notes rows.

Flags (single-item extract):

| Flag | Effect |
|------|--------|
| `--dry-run` | Extract + validate + print. Zero creator-note DB writes. Does **not** query or write `intel.creator_note_runs` / `intel.creator_atomic_notes`, and does **not** require the creator-notes migration. File mode also skips `source_items` lookup. Remote mode still **reads** the existing source item (intel UUID or Voice RSS) so captions can be fetched. |
| `--force` | Bypass equivalent-run skip and the local evidence-window extraction cache. Still fingerprint-dedupes notes. |
| `--bypass-extraction-cache` | Re-query Ollama for evidence windows even when a local extraction cache hit exists. Does not imply DB persistence. |
| `--max-windows <n>` | Process only the first n evidence windows. Calibration/benchmark only. |
| `--limit-notes <n>` | Keep at most n notes after dedupe. |
| `--json` | Machine-readable result instead of the human report. |
| `--creator-name <name>` | Fill missing creator attribution metadata. On remote dry-run, may override resolved creator name. Not persisted as invented source metadata. |
| `--source-title <title>` | Fill missing source title. On remote dry-run, may override resolved title. |
| `--source-url <url>` | Fill missing source URL. On remote dry-run, may override resolved URL. |
| `--transcribe-audio` | Podcast extract only. If no publisher transcript exists and an RSS audio enclosure is present, run local faster-whisper fallback. Required explicitly; audio is never transcribed silently. |

Default local model remains `gemma3:4b` via `CREATOR_NOTES_MODEL` (falls back to `OLLAMA_MODEL`). Production value: `CREATOR_NOTES_MODEL=gemma3:4b`. One evidence window is sent per Ollama request; multi-window batching stays in code but is not the default (`CREATOR_NOTES_WINDOW_BATCH_SIZE=1`).

Human preview (not `--json`) starts with a Transcript acquisition section (`source`, `language`, `generated`, raw/normalized segment counts, duration covered, characters, cache hit/miss for local audio), then the existing Atomic Notes report. Note previews show timestamp, kind, creator, notebook paraphrase, mechanically verified `sourceQuote`, the full `Evidence:` window, source segment indexes, and evidence duration. The report prints raw vs validated kind counts, kind missing/invalid/coercions, duplicates removed, grounding rejects, and quote verification rejects. Unknown/missing kinds are never defaulted to `event`. JSON Schema does not enum-constrain `kind`, because that biased gemma3 toward the first member.

First real podcast dry-run (do not persist):

```bash
npm run creator-notes:podcast-sources -- --limit 20
```

Pick a row with `transcript discovered` = `yes`, then:

```bash
THEME_AI_PROVIDER=ollama \
CREATOR_NOTES_MODEL=gemma3:4b \
npm run creator-notes:extract-podcast -- \
  --source-item <ACTUAL_ID> \
  --dry-run
```

First real calibration (do not persist). `--source-item` may be a stable calibration string; it does not have to be an intel UUID. CLI metadata does not require a DB lookup:

```bash
npm run creator-notes:extract -- \
  --source-item calibration-david-pakman-2026-09-17 \
  --creator-name "David Pakman" \
  --source-title "Calibration segment" \
  --transcript-file ./tmp/creator-notes-calibration.json \
  --dry-run
```

Richer fixture (named court, case, filing, date, amount):

```bash
npm run creator-notes:extract -- \
  --source-item calibration-specific-2026-09-17 \
  --transcript-file ./tests/creatorNotes/fixtures/specific-transcript.json \
  --dry-run
```

Earlier synthetic fixture (still valid for smoke tests):

```bash
npm run creator-notes:extract -- \
  --source-item calibration-david-pakman-2026-09-17 \
  --transcript-file ./tests/creatorNotes/fixtures/synthetic-transcript.json \
  --dry-run
```

When you persist, pass the real `source_items.id` UUID whenever it exists so provenance stays attached.

## Idempotency

Transcript hash: SHA-256 of normalized segments (line endings collapsed, trim, timestamps + text). Version: `creator-notes-v1.7`.

A completed **success** run with the same:

`sourceItemId + transcriptHash + extractionVersion + model provider/name`

is skipped unless `--force`. `--dry-run` does not perform this equivalent-run lookup.

The scheduled batch may see the same Voice item many times. Failed or partial prior runs **may retry**. Successful equivalent runs are skipped and reported as `Already processed`.

Note fingerprint:

`sha256(sourceItemId | kind | normalizedText | startSeconds)`

Unique in the database. `--force` may create a new run without duplicating identical notes.

## Database tables

Both in schema `intel`. No foreign key to `source_items` (Voices provenance is not always an intel UUID). No `theme_id`.

### `intel.creator_note_runs`

Extraction execution metadata: model, version, transcript hash, status (`running` / `success` / `partial` / `failed`), input size, notes created, timestamps, error.

### `intel.creator_atomic_notes`

One notebook idea per row: kind, paraphrase (`text`), deterministic `source_excerpt`, optional verified `exact_quote`, `source_segment_indexes`, optional timestamps, attribution, event features JSON, verification status, fingerprint.

## Why title text is not event identity

Titles are often rhetoric. Inferring a court order, a bill, or a named incident from "This is OFF THE RAILS" would invent an event. The transcript is the only extraction authority in Milestone 1. Episode title and other source metadata cannot become Atomic Note content unless those words also occur in the evidence window. That specifically blocks notes such as "Iran expands exclusion zone?" when that proposition came from the title rather than the 45-second transcript window.

## Why creator convergence is not corroboration

Multiple creators discussing the same issue is **perspective / editorial attention**, not independent factual corroboration.

Future UI may show:

- Ben said...
- David said...
- Peter said...

That is not:

> three independent factual sources verified this.

Corroboration semantics in ranking / Intel are unchanged in this milestone.

## Configuration

| Variable | Default | Role |
|----------|---------|------|
| `THEME_AI_PROVIDER` | `none` | Must be `ollama` for live extraction |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Local Ollama |
| `CREATOR_NOTES_MODEL` | `gemma3:4b` | Atomic Notes chat model. Production value: `gemma3:4b`. Independent of Theme Memory. |
| `OLLAMA_MODEL` | unset | Fallback chat model if `CREATOR_NOTES_MODEL` is unset |
| `THEME_AI_TIMEOUT_MS` | `45000` | Theme Memory classification timeout (unchanged) |
| `THEME_AI_MAX_RETRIES` | `2` | Theme Memory retry of transient Ollama failures |
| `CREATOR_NOTES_AI_TIMEOUT_MS` | `300000` | Atomic Notes per-window Ollama timeout |
| `CREATOR_NOTES_WINDOW_BATCH_SIZE` | `1` | Windows per Ollama request. Production default is one window. Multi-window batching remains available for experiments only. |
| `CREATOR_NOTES_LOCK_FILE` | `tmp/creator-notes-batch.lock` | Exclusive batch lock; separate from Theme Memory |
| `CREATOR_NOTES_CHUNK_CHARS` | `1500` | Max evidence-window / split size in characters |
| `CREATOR_NOTES_MAX_NOTES_PER_CHUNK` | `8` | Hard cap per evidence window |
| `CREATOR_NOTES_WHISPER_MODEL` | `small` | faster-whisper model for `--transcribe-audio` |
| `CREATOR_NOTES_PYTHON` | `python3` | Python used to run local Whisper |
| `CREATOR_NOTES_FFMPEG` | `ffmpeg` | ffmpeg binary for 16 kHz mono speech |

Evidence windows are built from whole transcript segments before the LLM is called. Timed transcripts target ~45 seconds (max 60) with ~12 seconds of overlap. Untimed transcripts use ~800-1500 characters. Individual segments are never split. Production extraction sends **one** evidence window per Ollama request. Timeout and token-repeat failures split that window once into smaller segment-boundary children. Transport failures (`fetch failed`, connection refused, server unavailable) health-check Ollama, back off briefly, and retry the **same** window once — they do not split the transcript. A window that yields zero notes is success.

The application attaches the window's `sourceSegmentIndexes` and copies the full window as `sourceExcerpt`. `sourceQuote` must be a verbatim substring of that window. Numbers in the note are validated against the full window, not only the quote. An `evidence_reference` is accepted only when `referencedSource` names an external evidentiary source that literally occurs in that window; a country or actor being discussed is not a source, and a rejected `evidence_reference` is dropped rather than converted to another kind. Note text may not copy episode-title or other source-metadata wording unless those words also occur in the window. If a window returns notes but none survive grounding, extraction retries that window once with a repair prompt. A complete run with zero unrecovered window failures is `success` even if no notes were notebook-worthy. A `partial` run does not persist Atomic Notes.

Source excerpts are the full evidence window (`CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS`, 2000). Optional exact quotes are max 500 characters (`CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS`). Stored source segment indexes are bounded at 48.

## Milestone 1 scope boundaries

**In scope:** one-source CLI extraction, supplied transcript files, podcast RSS transcript intake (Podcasting 2.0 + one official-page adapter), opt-in local audio transcription fallback on single-episode extract, bounded podcast batch ingest, experimental YouTube captions (non-default), read-only review, validation, persistence, idempotency, recency window, transcript-failure handling, overlap lock, systemd unit files (manual install), tests, docs.

**Out of scope:**

- public UI / chronological journal page
- homepage ranking changes
- Theme Memory scoring, matching, memberships, or mutations
- event clustering / Event Threads from notes
- batch / scheduled audio transcription
- paid transcription APIs
- generic web scraping of third-party transcript mirrors
- automated publication
- editor notes
- treating creator opinions as facts
- broad fact-checking / marking claims true because the model said so
- historical backfill of the entire Voice corpus
- vector DB / embeddings
- paid external AI providers
- merging this worker into Theme Memory
- generalized agent framework

## systemd

Do **not** merge this into `theme-memory.service`. Install a separate unit after reviewing the implementation. Application code never enables the timer.

See [deploy/creator-notes/README.md](../deploy/creator-notes/README.md).

```bash
sudo cp deploy/creator-notes/creator-notes.service.example /etc/systemd/system/creator-notes.service
sudo cp deploy/creator-notes/creator-notes.timer.example /etc/systemd/system/creator-notes.timer
# edit User=, WorkingDirectory=, EnvironmentFile=
sudo systemctl daemon-reload
sudo systemctl enable --now creator-notes.timer
```

Suggested cadence: 4 runs per day at 03:20 / 09:20 / 15:20 / 21:20, offset from Theme Memory. Each invocation is `npm run creator-notes:podcast-batch -- --limit 10`.

## First persisted batch

```bash
THEME_AI_PROVIDER=ollama \
CREATOR_NOTES_MODEL=gemma3:4b \
npm run creator-notes:podcast-batch -- --limit 10
```

Then inspect:

```bash
npm run creator-notes:review -- --limit 50
```

## Future architecture (documented only)

```
Creator transcript
      ↓
Atomic Creator Notes
      ↓
Event candidate normalization
      ↓
Theme Memory linking
      ↓
Cross-source supporting evidence
      ↓
Chronological Event Journal
      ↓
Expandable creator commentary
      ↓
Editor notes
```

Intended public structure (not built):

```
DATE

TIME — EVENT
  • development

  Context ▾
  Creator commentary ▾
  Evidence ▾
  Editor notes ▾
```

Creator commentary remains attributed perspective. It still is not corroboration.

## Calibration

File-mode dry-run calibration does not require the creator-notes migration or a `source_items` lookup. Pass `--creator-name` when attribution should use a known creator. Source metadata may still be unavailable when the id is a calibration string rather than a real Voice/intel id; that is expected and does not block extraction.

Remote-mode podcast dry-run (`creator-notes:extract-podcast --source-item` without a file) resolves a real podcast episode, fetches a public transcript, then extracts + validates + prints. It still performs **zero** creator-note database writes. YouTube remote extract remains available as an experimental non-default path.

Before enabling this broadly, inspect a real transcript dry-run:

- Did it capture the things worth writing down?
- Did it miss major claims?
- Did it create trivial notes?
- Did it merge multiple ideas into one note?
- Did it convert analysis into fact?
- Are timestamps useful?
- Is "why it matters" distinct from analysis?
- Are event features useful without overreaching?
- Did notebook notes keep named people, courts, cases, filings, dates, and amounts from the transcript?
- Are `sourceExcerpt` lines actual original transcript segments, or did the model rewrite them?
- Did unverifiable `exactQuote` values become null without dropping otherwise valid notes?
- Is attribution the known creator name rather than generic "The speaker" when `creatorName` is present?
