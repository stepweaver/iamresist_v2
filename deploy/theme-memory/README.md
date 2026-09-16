# Theme Memory VPS batch

Run Theme Memory **on the same machine as Ollama**. The public Next.js deployment cannot reach `127.0.0.1:11434` on this host. Do not expose Ollama publicly.

```
Node process on this VPS
        ↓
localhost:11434  (Ollama)
        ↓
existing Supabase project  (Theme Memory tables)
```

Do **not** call the public website over HTTP.

## Commands

From the repository checkout:

```bash
npm run theme-memory:ai-check
npm run theme-memory:daily
```

Optional label refresh (still capped per run):

```bash
node --require ./scripts/theme-memory-preload.cjs --import tsx scripts/theme-memory-daily.ts --refresh-labels
```

Theme Memory ingest calls Notion/Newswire **uncached** (`getAllVoices`, `getNewswireStoriesUncached`) so the CLI does not require Next.js `incrementalCache`.

Creator Voice feeds that use YouTube RSS (`youtube.com/feeds/videos.xml`) can return **transient HTTP 404** even when the channel ID is valid. Fetch retries those 404s (and 429/5xx/timeouts) a bounded number of times; persistent YouTube RSS outages still mark those voices as failed for the run, not as empty feeds.


## Environment

Copy [env.example](./env.example) to a root `.env.local` (or `EnvironmentFile=` in systemd). Never commit real secrets.

Required for a meaningful daily run:

- Supabase URL + service role (`POSTGRES_SUPABASE_URL` / `SUPABASE_URL` and service role key)
- Notion Voices (`NOTION_API_KEY`, `NOTION_VOICES_DB_ID`)
- `THEME_AI_PROVIDER=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `OLLAMA_MODEL=` (set to an installed local model; do not hardcode in application logic)
- `THEME_AI_TIMEOUT_MS=45000` for per-classification / label requests
- `THEME_AI_STARTUP_TIMEOUT_MS=180000` for the Ollama readiness warm-up only (CPU-only model load can exceed 90s; do not raise `THEME_AI_TIMEOUT_MS` for that)
- `THEME_RANKING_MODE=shadow` for calibration (do not set `active` yet)

## Overlap prevention

The CLI acquires an exclusive lock file (`tmp/theme-memory-daily.lock`, overridable with `THEME_MEMORY_LOCK_FILE`). A second start exits non-zero while the first run is alive. Stale locks from dead PIDs are replaced.

systemd `Type=oneshot` also avoids overlapping units. Optional extra wrapping:

```
ExecStart=/usr/bin/flock -n /run/theme-memory.lock /usr/bin/npm run theme-memory:daily
```

## systemd

Install the example unit files yourself (this repo does not install them):

1. Copy `theme-memory.service.example` and `theme-memory.timer.example`
2. Replace placeholders (`User=`, `WorkingDirectory=`, `EnvironmentFile=`, `OnCalendar=`)
3. `systemctl enable --now theme-memory.timer`

Prefer the timer over cron. `Persistent=true` catches missed runs.
