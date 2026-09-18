# Atomic Creator Notes

Milestone 1: a deterministic, inspectable pipeline that turns **one** creator transcript into structured notebook-style notes.

This is **not** a Theme Memory rewrite. Theme Memory stays intact. Ranking mode is unchanged (`THEME_RANKING_MODE=shadow` in current ops). Creator notes do **not** create theme memberships, theme identities, daily signals, or ranking writes.

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

## Architecture (Milestone 1)

```
creator source item
        ↓
transcript/content (CLI file in v1)
        ↓
deterministic chunking
        ↓
local Ollama / gemma3:4b
        ↓
strictly validated JSON
        ↓
atomic creator notes
        ↓
Supabase intel.creator_note_runs
        + intel.creator_atomic_notes
        ↓
CLI diagnostic output
```

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

## Notebook text vs exact quote vs event features

These fields are intentionally distinct:

| Field | Meaning |
|-------|---------|
| `exactQuote` | Verified **verbatim transcript evidence**. Copied from the supplied transcript after deterministic matching. Null if missing or unverifiable. |
| `text` | Concise **notebook-style paraphrase** of what that excerpt means. This is the listener's note, not a quotation. |
| `eventFeatures` | Unverified structured extraction **candidates** (actors/action/object/institutions/locations/documents). Not theme identity and not auto-linked. |

The model may return quotation marks. That is not enough. Transcript quotes are verified locally against the referenced segment texts. If the excerpt cannot be found after normalizing only whitespace, line breaks, and smart/straight quotes, `exactQuote` is set to `null`. The note itself is kept if otherwise valid. Unverifiable quotes are never rewritten into something that looks verbatim.

`sourceSegmentIndexes` are the original transcript segment indexes shown to the model as `[SEGMENT n | start-end]`. Chunk overlap keeps those original indexes. Quote verification concatenates the referenced segments in transcript order and checks that `exactQuote` occurs in that source text.

Exact quotes are bounded (typically one or two sentences, max 500 characters). An oversized quote is omitted rather than truncated into misleading wording.

The notebook paraphrase should preserve concrete names and identifiers that actually appear in the transcript (people, courts, cases, filings, dates, amounts). It must not invent them from outside knowledge, and it should not replace them with generic nouns.

## Event features

Optional lightweight candidates on a note:

```
actors[], action, object, institutions[], locations[], referencedDocuments[]
```

These are extraction candidates. They are **not** Theme Memory identity. They do not create memberships, mutate themes, or count as verified entities. Duplicate strings are removed case-insensitively. Original human-readable names are kept.

## Transcript input format

CLI v1 reads a JSON file. YouTube / Pocket Casts fetching is out of scope.

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

`--source-item` is the provenance id. Real persisted runs should use the intel `source_items.id` UUID whenever possible. Calibration and local dry-runs may use any stable string (for example `calibration-david-pakman-2026-09-17`). Source metadata lookup only queries `source_items` when that id is a UUID; non-UUID ids skip the lookup rather than sending invalid input to Postgres.

Optional file fields fill creator/title/URL when the database row is missing or unavailable. During calibration, source metadata may be absent (`creatorId`, `creatorName`, `sourceTitle`, `sourceUrl`, `publishedAt` stay null unless the transcript file supplies them). Extraction still proceeds. Do not invent metadata.

The episode title may be stored and shown. It is **not** treated as event identity. The prompt states this explicitly.

## CLI usage

```bash
npm run creator-notes:extract -- \
  --source-item <source-item-id> \
  --transcript-file ./tmp/test-transcript.json
```

Flags:

| Flag | Effect |
|------|--------|
| `--dry-run` | Extract + validate + print. Zero DB writes. Does **not** query or write `intel.creator_note_runs` / `intel.creator_atomic_notes`, and does **not** require the creator-notes migration. |
| `--force` | Bypass equivalent-run skip; still fingerprint-dedupes notes. |
| `--limit-notes <n>` | Keep at most n notes after dedupe. |
| `--json` | Machine-readable result instead of the human report. |

Default local model remains `gemma3:4b` via `OLLAMA_MODEL`.

Human preview (not `--json`) shows timestamp, kind, attribution, verified quote or `(not available)`, notebook paraphrase, and source segment indexes. Empty/null event-feature arrays are omitted unless `--json` is supplied. The report also prints `quotes requested`, `quotes verified`, and `quotes rejected`.

First real calibration (do not persist). `--source-item` may be a stable calibration string; it does not have to be an intel UUID.

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

Transcript hash: SHA-256 of normalized segments (line endings collapsed, trim, timestamps + text). Version: `creator-notes-v1.1`.

A completed **success** run with the same:

`sourceItemId + transcriptHash + extractionVersion + model provider/name`

is skipped unless `--force`. `--dry-run` does not perform this equivalent-run lookup.

Note fingerprint:

`sha256(sourceItemId | kind | normalizedText | startSeconds)`

Unique in the database. `--force` may create a new run without duplicating identical notes.

## Database tables

Both in schema `intel`. No foreign key to `source_items` (Voices provenance is not always an intel UUID). No `theme_id`.

### `intel.creator_note_runs`

Extraction execution metadata: model, version, transcript hash, status (`running` / `success` / `partial` / `failed`), input size, notes created, timestamps, error.

### `intel.creator_atomic_notes`

One notebook idea per row: kind, paraphrase (`text`), optional verified `exact_quote`, `source_segment_indexes`, optional timestamps, attribution, event features JSON, verification status, fingerprint.

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
| `CREATOR_NOTES_CHUNK_CHARS` | `12000` | Target chunk size |
| `CREATOR_NOTES_MAX_NOTES_PER_CHUNK` | `30` | Hard cap per chunk |

Chunking is by transcript segments, with ~800 characters of overlap. Individual segments are split only if they exceed the chunk budget. Overlap preserves original segment indexes. Prompts label each segment as `[SEGMENT n | startSeconds-endSeconds]`.

Exact quote max length is 500 characters (`CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS`). At most 8 source segment indexes per note.

## Milestone 1 scope boundaries

**In scope:** one-source CLI extraction, validation, persistence, idempotency, tests, docs.

**Out of scope:**

- public UI / chronological journal page
- homepage ranking changes
- Theme Memory scoring or matching changes
- automatic theme memberships or theme mutations
- publishing or finished articles
- treating creator opinions as facts
- broad fact-checking / marking claims true because the model said so
- vector DB / embeddings
- paid external AI providers
- new scraping service / full catalog ingest
- generalized agent framework

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

Dry-run calibration does not require the creator-notes migration. Source metadata may be unavailable when the id is a calibration string rather than an intel UUID; that is expected and does not block extraction.

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
- Are `exactQuote` lines actual transcript excerpts, or did unverifiable quotes get dropped?
- Is attribution the known creator name rather than generic "The speaker" when `creatorName` is present?
