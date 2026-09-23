# Atomic Creator Notes VPS batch

Run Atomic Creator Notes **on the same machine as Ollama**, isolated from Theme Memory. The public Next.js deployment cannot reach `127.0.0.1:11434` on this host. Do not expose Ollama publicly.

This job only writes:

- `intel.creator_note_runs`
- `intel.creator_atomic_notes`

It does **not** write Theme Memory tables or ranking state.

```
Notion Voices + existing Voice RSS
        + official podcast feeds for matched creators
        ↓
eligible recent podcast episodes
        ↓
publisher transcript when one exists
        otherwise local faster-whisper on the RSS audio enclosure
        (--transcribe-audio; production batch enables this)
        ↓
localhost:11434  (Ollama / gemma3:4b)
        ↓
existing Supabase project  (creator-notes tables only)
```

Most podcast RSS feeds do not include a publisher transcript. The production batch therefore passes `--transcribe-audio` so those episodes can use the existing local faster-whisper fallback. A publisher transcript still wins. Episodes are processed one at a time. YouTube caption batch selection is disabled. Do not expose Ollama or Whisper on a public port.

Do **not** call the public website over HTTP.

## Commands

From the repository checkout. Test one episode before installing the timer:

```bash
npm run creator-notes:podcast-batch -- --limit 1 --transcribe-audio --dry-run
npm run creator-notes:podcast-batch -- --limit 1 --transcribe-audio
```

Production batch (same command the systemd unit runs):

```bash
npm run creator-notes:podcast-batch -- --limit 10 --transcribe-audio
npm run creator-notes:review -- --limit 50
```

Without `--transcribe-audio`, missing publisher transcripts stay `TRANSCRIPT_UNAVAILABLE` and audio is not downloaded.

Dry-run (extract + print, zero creator-note writes; a local transcript cache may still be written):

```bash
npm run creator-notes:podcast-batch -- --limit 10 --transcribe-audio --dry-run
```

## Environment

Reuse the Theme Memory / Ollama environment. Copy [env.example](./env.example) into the repository `.env.local` (or `EnvironmentFile=` in systemd). Never commit real secrets.

Required:

- Supabase URL + service role (`POSTGRES_SUPABASE_URL` / `SUPABASE_URL` and service role key)
- Notion Voices (`NOTION_API_KEY`, `NOTION_VOICES_DB_ID`)
- `THEME_AI_PROVIDER=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `CREATOR_NOTES_MODEL=gemma3:4b` (intended production model; independent of Theme Memory)
- `OLLAMA_MODEL=gemma3:4b` (fallback if `CREATOR_NOTES_MODEL` is unset)
- `THEME_AI_TIMEOUT_MS=45000`
- `THEME_AI_STARTUP_TIMEOUT_MS=180000` for the Ollama readiness warm-up only
- `CREATOR_NOTES_AI_TIMEOUT_MS=300000` for Atomic Notes extraction (independent of Theme Memory)
- `CREATOR_NOTES_OLLAMA_KEEP_ALIVE=5m` for Atomic Notes (independent of Theme Memory's 30m keep-alive)

Local audio transcription (required for the production batch, because most feeds have no publisher transcript):

- `ffmpeg` on `PATH`, or `CREATOR_NOTES_FFMPEG` set to the ffmpeg binary (default `ffmpeg`)
- Python 3 on `PATH`. The existing interpreter override is `CREATOR_NOTES_PYTHON` (default `python3`; `PYTHON` is also recognized)
- Python packages from `scripts/audio-transcription/requirements.txt` (`faster-whisper`):

```bash
python3 -m pip install -r scripts/audio-transcription/requirements.txt
```

- `CREATOR_NOTES_WHISPER_MODEL` (default `small`; leave this unless a measured run shows a reason to change it)
- `CREATOR_NOTES_TRANSCRIBE_LANGUAGE` (default `en`)

Audio is downloaded to a temporary directory, transcoded to 16 kHz mono, and discarded. Successful transcripts are reused from `tmp/creator-notes-audio-transcripts/`. Whole podcast audio is not stored in Supabase. Whisper runs only as a local subprocess. Do not publish it.

Optional:

- `CREATOR_NOTES_LOCK_FILE=/run/creator-notes-batch.lock`

## Overlap prevention

The CLI acquires an exclusive lock file (`tmp/creator-notes-batch.lock`, overridable with `CREATOR_NOTES_LOCK_FILE`). A second start exits **0** with `creator-notes podcast batch already running` while the first run is alive. Stale locks from dead PIDs are replaced.

This lock is **separate** from `theme-memory-daily.lock`. Failures in creator-notes do not fail Theme Memory, and the two services should still be scheduled so they do not contend for the same CPU-only Ollama process.

systemd `Type=oneshot` also avoids overlapping units. Optional extra wrapping:

```
ExecStart=/usr/bin/flock -n /run/creator-notes.lock /usr/bin/npm run creator-notes:podcast-batch -- --limit 10 --transcribe-audio
```

## systemd

Install the example unit files yourself (this repo does **not** install or enable them from application code):

1. Copy `creator-notes.service.example` and `creator-notes.timer.example`
2. Replace placeholders (`User=`, `WorkingDirectory=`, `EnvironmentFile=`)
3. `systemctl enable --now creator-notes.timer`

Suggested cadence: **4 runs per day**, offset from Theme Memory's 06:15 timer.

Prefer the timer over cron. `Persistent=true` catches missed runs.

`TimeoutStartSec` is 4 hours. Local transcription plus sequential `gemma3:4b` extraction is CPU-bound. If a 10-episode run is killed, raise `TimeoutStartSec` on the installed unit. The example unit does not enable the timer.
