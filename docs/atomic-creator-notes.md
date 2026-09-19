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
  D. YouTube captions (experimental, not used by automatic batch)
        ↓
deterministic chunking
        ↓
local Ollama / gemma3:4b  (sequential)
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

- `THEME_AI_PROVIDER`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`
- `THEME_AI_TIMEOUT_MS`, `THEME_AI_MAX_RETRIES`
- existing Ollama chat helper (`ollamaChatJson`)
- intel schema / Supabase service-role client
- Theme Memory CLI preload (`.env` loading + `server-only` stub)

Creator notes **require** `THEME_AI_PROVIDER=ollama`. There is no deterministic fallback that invents notebook content. Ordinary unit tests inject a mock extractor and do not call Ollama.

## Note kinds

| Kind | Meaning |
|------|---------|
| `event` | A concise description of an occurrence/action/development the speaker is discussing. |
| `claim` | A factual assertion made by the speaker. **Not automatically true.** |
| `new_development` | Something the speaker explicitly presents as new information or a change. |
| `context` | Background or prior events needed to understand the current item. |
| `evidence_reference` | A document, filing, article, report, quote, court decision, or other evidence the speaker explicitly cites. |
| `creator_analysis` | The speaker's interpretation, judgment, inference, explanation, or opinion. **Not a fact.** |
| `why_it_matters` | An explicit speaker argument about significance, consequences, stakes, or downstream effects. **Not a fact.** |

Do not collapse these categories.

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
| Original transcript segments | Source of truth. Indexed as `[SEGMENT n \| start-end]`. Chunk overlap keeps those original indexes. |
| `sourceExcerpt` | Deterministic **verbatim evidence**. Copied by application code from the referenced original segments. Never generated or rewritten by the model. |
| `exactQuote` | Optional **narrower verbatim substring** requested by the model. Retained only if it occurs in `sourceExcerpt` after normalizing whitespace, line breaks, and smart/straight quotes. Null otherwise. |
| `text` | Concise **AI-generated notebook paraphrase** of what that excerpt means. This is the listener's note, not a quotation. |
| `eventFeatures` | Unverified structured extraction **candidates**. Not theme identity and not auto-linked. |

```
sourceExcerpt = exact text copied by code from the supplied transcript
text          = concise AI-generated notebook note
```

The model's primary provenance job is selecting `sourceSegmentIndexes`, not reproducing quote text. For every accepted note the application:

1. validates `sourceSegmentIndexes` (in-bounds, contiguous or nearly contiguous)
2. retrieves those exact original transcript segments
3. constructs a deterministic `sourceExcerpt` from that original text
4. optionally verifies `exactQuote` against that excerpt

Referenced segments are normally at most 3 and must be contiguous or nearly contiguous (at most one missing index between neighbors). The excerpt target is 800 characters. If the referenced text exceeds that bound, the application keeps the smallest complete referenced segment range that fits. It never truncates in the middle of a word and never inserts generated text into the excerpt.

A fabricated or paraphrased `exactQuote` becomes `null`. That is not a run failure when `sourceExcerpt` exists. Unverifiable quotes are never rewritten into something that looks verbatim.

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
  → unavailable
```

Automatic **audio transcription / speech-to-text is intentionally deferred**. If no public transcript exists, the status is `TRANSCRIPT_UNAVAILABLE`. The pipeline does not transcribe MP3/M4A, call Whisper, or invent transcript text from titles or show notes.

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

Transcript acquisition also records `transcriptSource` (`podcast_namespace` | `official_creator_page`), `transcriptUrl`, `transcriptMimeType`, and `transcriptLanguage` so a later UI can show:

```
Podcast episode → Transcript → timestamp → note
```

Statuses are explicit and are not collapsed:

| Status | Meaning |
|--------|---------|
| `TRANSCRIPT_AVAILABLE` | A public transcript was fetched and normalized |
| `TRANSCRIPT_UNAVAILABLE` | No public transcript candidate and no official page body |
| `TRANSCRIPT_FETCH_FAILED` | Network / HTTP failure. **Not** "no transcript" |
| `TRANSCRIPT_FORMAT_UNSUPPORTED` | Payload type is not a supported transcript format |
| `TRANSCRIPT_PARSE_FAILED` | Supported type, but the file could not be parsed |
| `TRANSCRIPT_EMPTY` | Parsed, but produced no usable segments |

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
OLLAMA_MODEL=gemma3:4b \
npm run creator-notes:extract-podcast -- \
  --source-item <PODCAST_EPISODE_ID> \
  --dry-run
```

Flow: resolve episode from Voices RSS / official adapter feed → resolve transcript → normalize → **existing** Atomic Notes extraction → preview. This does not duplicate the AI pipeline.

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

The episode title may be stored and shown. It is **not** treated as event identity. The prompt states this explicitly.

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
| `--force` | Bypass equivalent-run skip; still fingerprint-dedupes notes. |
| `--limit-notes <n>` | Keep at most n notes after dedupe. |
| `--json` | Machine-readable result instead of the human report. |
| `--creator-name <name>` | Fill missing creator attribution metadata. On remote dry-run, may override resolved creator name. Not persisted as invented source metadata. |
| `--source-title <title>` | Fill missing source title. On remote dry-run, may override resolved title. |
| `--source-url <url>` | Fill missing source URL. On remote dry-run, may override resolved URL. |

Default local model remains `gemma3:4b` via `OLLAMA_MODEL`.

Human preview (not `--json`) starts with a Transcript acquisition section (`source`, `language`, `generated`, raw/normalized segment counts, duration covered, characters), then the existing Atomic Notes report. Note previews show timestamp, kind, attribution, `Transcript:` evidence from `sourceExcerpt` or `(not available)`, notebook paraphrase, and source segment indexes. A narrower verified `exactQuote` is shown only when it is not essentially identical to the transcript excerpt. Empty/null event-feature arrays are omitted unless `--json` is supplied. The report also prints `notes with source evidence`, `notes without source evidence`, `invalid source segment references`, `exact quotes requested`, `exact quotes verified`, and `exact quotes rejected`.

First real podcast dry-run (do not persist):

```bash
npm run creator-notes:podcast-sources -- --limit 20
```

Pick a row with `transcript discovered` = `yes`, then:

```bash
THEME_AI_PROVIDER=ollama \
OLLAMA_MODEL=gemma3:4b \
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

Transcript hash: SHA-256 of normalized segments (line endings collapsed, trim, timestamps + text). Version: `creator-notes-v1.2`.

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

Titles are often rhetoric. Inferring a court order, a bill, or a named incident from "This is OFF THE RAILS" would invent an event. The transcript is the only extraction authority in Milestone 1.

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
| `OLLAMA_MODEL` | `gemma3:4b` if unset for this CLI | Chat model |
| `THEME_AI_TIMEOUT_MS` | `45000` | Per-chunk timeout |
| `THEME_AI_MAX_RETRIES` | `2` | Retry transient Ollama failures |
| `CREATOR_NOTES_LOCK_FILE` | `tmp/creator-notes-batch.lock` | Exclusive batch lock; separate from Theme Memory |
| `CREATOR_NOTES_CHUNK_CHARS` | `12000` | Target chunk size |
| `CREATOR_NOTES_MAX_NOTES_PER_CHUNK` | `30` | Hard cap per chunk |

Chunking is by transcript segments, with ~800 characters of overlap. Individual segments are split only if they exceed the chunk budget. Overlap preserves original segment indexes. Prompts label each segment as `[SEGMENT n | startSeconds-endSeconds]`.

Source excerpts are copied from original segments (`CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS`, 800). Normally at most 3 referenced segments. Optional exact quotes are max 500 characters (`CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS`). Parse allows at most 8 source segment indexes per note; evidence construction bounds the stored range.

## Milestone 1 scope boundaries

**In scope:** one-source CLI extraction, supplied transcript files, podcast RSS transcript intake (Podcasting 2.0 + one official-page adapter), bounded podcast batch ingest, experimental YouTube captions (non-default), read-only review, validation, persistence, idempotency, recency window, transcript-failure handling, overlap lock, systemd unit files (manual install), tests, docs.

**Out of scope:**

- public UI / chronological journal page
- homepage ranking changes
- Theme Memory scoring, matching, memberships, or mutations
- event clustering / Event Threads from notes
- automatic speech-to-text / Whisper / audio transcription
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
OLLAMA_MODEL=gemma3:4b \
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
