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
eligible recent podcast episodes with a public transcript
        ↓
localhost:11434  (Ollama / gemma3:4b)
        ↓
existing Supabase project  (creator-notes tables only)
```

YouTube caption batch selection is disabled. Use `npm run creator-notes:podcast-batch`.

Do **not** call the public website over HTTP.

## Commands

From the repository checkout:

```bash
npm run creator-notes:podcast-batch -- --limit 10
npm run creator-notes:review -- --limit 50
```

Dry-run (extract + print, zero creator-note writes):

```bash
npm run creator-notes:podcast-batch -- --limit 10 --dry-run
```

## Environment

Reuse the Theme Memory / Ollama environment. Copy [env.example](./env.example) into the repository `.env.local` (or `EnvironmentFile=` in systemd). Never commit real secrets.

Required:

- Supabase URL + service role (`POSTGRES_SUPABASE_URL` / `SUPABASE_URL` and service role key)
- Notion Voices (`NOTION_API_KEY`, `NOTION_VOICES_DB_ID`)
- `THEME_AI_PROVIDER=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `OLLAMA_MODEL=gemma3:4b`
- `THEME_AI_TIMEOUT_MS=45000`
- `THEME_AI_STARTUP_TIMEOUT_MS=180000` for the Ollama readiness warm-up only

Optional:

- `CREATOR_NOTES_LOCK_FILE=/run/creator-notes-batch.lock`

## Overlap prevention

The CLI acquires an exclusive lock file (`tmp/creator-notes-batch.lock`, overridable with `CREATOR_NOTES_LOCK_FILE`). A second start exits **0** with `creator-notes batch already running` while the first run is alive. Stale locks from dead PIDs are replaced.

This lock is **separate** from `theme-memory-daily.lock`. Failures in creator-notes do not fail Theme Memory, and the two services should still be scheduled so they do not contend for the same CPU-only Ollama process.

systemd `Type=oneshot` also avoids overlapping units. Optional extra wrapping:

```
ExecStart=/usr/bin/flock -n /run/creator-notes.lock /usr/bin/npm run creator-notes:podcast-batch -- --limit 10
```

## systemd

Install the example unit files yourself (this repo does **not** install or enable them from application code):

1. Copy `creator-notes.service.example` and `creator-notes.timer.example`
2. Replace placeholders (`User=`, `WorkingDirectory=`, `EnvironmentFile=`)
3. `systemctl enable --now creator-notes.timer`

Suggested cadence: **4 runs per day**, offset from Theme Memory's 06:15 timer.

Prefer the timer over cron. `Persistent=true` catches missed runs.

`TimeoutStartSec` is 4 hours because sequential `gemma3:4b` extraction is expected to be slow.
