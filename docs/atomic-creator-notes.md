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

When the source has one known creator/speaker, that name is used. If the transcript clearly identifies another speaker, that identity is preserved. Speaker identities are never invented.

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

`--source-item` is the provenance id (intel `source_items.id` when available, or any stable test id). Optional file fields fill creator/title/URL when the database row is missing.

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
| `--dry-run` | Extract + validate + print. Zero DB writes. |
| `--force` | Bypass equivalent-run skip; still fingerprint-dedupes notes. |
| `--limit-notes <n>` | Keep at most n notes after dedupe. |
| `--json` | Machine-readable result instead of the human report. |

Default local model remains `gemma3:4b` via `OLLAMA_MODEL`.

First real calibration (do not persist):

```bash
npm run creator-notes:extract -- \
  --source-item <REAL_SOURCE_ITEM_ID> \
  --transcript-file ./tmp/creator-notes-calibration.json \
  --dry-run
```

## Idempotency

Transcript hash: SHA-256 of normalized segments (line endings collapsed, trim, timestamps + text). Version: `creator-notes-v1`.

A completed **success** run with the same:

`sourceItemId + transcriptHash + extractionVersion + model provider/name`

is skipped unless `--force`.

Note fingerprint:

`sha256(sourceItemId | kind | normalizedText | startSeconds)`

Unique in the database. `--force` may create a new run without duplicating identical notes.

## Database tables

Both in schema `intel`. No foreign key to `source_items` (Voices provenance is not always an intel UUID). No `theme_id`.

### `intel.creator_note_runs`

Extraction execution metadata: model, version, transcript hash, status (`running` / `success` / `partial` / `failed`), input size, notes created, timestamps, error.

### `intel.creator_atomic_notes`

One notebook idea per row: kind, paraphrase, optional timestamps, attribution, event features JSON, verification status, fingerprint.

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

Chunking is by transcript segments, with ~800 characters of overlap. Individual segments are split only if they exceed the chunk budget.

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

Before enabling this broadly, inspect a real transcript dry-run:

- Did it capture the things worth writing down?
- Did it miss major claims?
- Did it create trivial notes?
- Did it merge multiple ideas into one note?
- Did it convert analysis into fact?
- Are timestamps useful?
- Is "why it matters" distinct from analysis?
- Are event features useful without overreaching?
