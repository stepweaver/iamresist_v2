# Intel architecture map (end-to-end)

This is the concrete, grounded “wiring diagram” for the Intel system: **routes → services → DB → caches → cron**, plus the **known failure points** that cause “missed top-of-stack stories” and “stale desks.”

## System map (data flow)

```mermaid
flowchart LR
  subgraph Registry["Registry + governance"]
    manifest["`lib/intel/signal-sources.ts` (version-controlled manifest)"]
    types["`lib/intel/types.ts` (taxonomy: lanes, provenance, trust posture)"]
  end

  subgraph Ops["Ops entrypoints (secured cron routes)"]
    ingest["`GET /api/cron/ingest-signal`"]
    rescore["`GET /api/cron/intel-rescore`"]
    warm["`GET /api/cron/warm-home`"]
    keepAlive["`GET /api/cron/keep-alive`"]
  end

  subgraph Ingest["Ingest / normalize / store"]
    ingestSvc["`lib/intel/ingest.ts` (runIntelIngest)"]
    parsers["`lib/intel/parseRss.ts` / `parseHtmlIndex.ts` / `frApi.ts`"]
    relevance["`lib/intel/relevance.ts` (relevance_score + surface_state + explanations)"]
    upsert["`lib/intel/db.ts` (upsert intel.source_items)"]
  end

  subgraph Storage["Supabase Postgres (`intel` schema)"]
    sources["`intel.sources` (manifest-mirrored)"]
    items["`intel.source_items` (ingested artifacts)"]
    runs["`intel.ingest_runs` (ops audit)"]
    snap["`intel.live_desk_snapshot` (last-good desk payload)"]
  end

  subgraph ReadModel["Desk read model (build + rank)"]
    deskSvc["`lib/feeds/liveIntel.service.js` (buildLiveIntelDesk)"]
    rank["`lib/intel/rank.ts` (compareDeskItems, duplicate overlay)"]
    display["`lib/intel/displayPriority.ts` + `rankingProfile.ts`"]
    claims["`lib/intel/trustWarnings.ts` (trust badges + hero gating)"]
  end

  subgraph Surface["Next.js pages / ISR / cache"]
    osint["`app/intel/osint/page.jsx`"]
    lanePages["`app/intel/*/page.jsx` lanes"]
    ui["`components/intel/LiveDeskView.jsx`"]
    cache["`unstable_cache` tags: `intel-live`, `intel-sources`"]
  end

  manifest --> ingestSvc
  types --> ingestSvc
  ingest --> ingestSvc
  ingestSvc --> parsers --> relevance --> upsert --> items
  ingestSvc --> sources
  ingestSvc --> runs

  items --> deskSvc
  rank --> deskSvc
  display --> deskSvc
  claims --> deskSvc
  deskSvc --> snap
  deskSvc --> cache --> lanePages --> ui
  deskSvc --> cache --> osint --> ui

  rescore -->|"recompute relevance_*"| items
  warm -->|"prime cached reads"| cache
  keepAlive -->|"DB ping only"| Storage
```

## Canonical route wiring (read paths)

- **OSINT desk**: `app/intel/osint/page.jsx` → `getLiveIntelDesk()` → `lib/feeds/liveIntel.service.js`
- **Statements desk**: `app/intel/statements/page.jsx` → `getLiveIntelDesk('statements')` → same service
- **Sources audit**: `app/intel/sources/page.jsx` → `lib/feeds/intelSourcesAudit.service.ts` → direct DB reads
- **Homepage live briefing**: `app/page.jsx` → `lib/feeds/homepageBriefing.service.js` (merges newswire + desk lanes)

## Cron wiring (write paths)

- **Ingest**: `app/api/cron/ingest-signal/route.js` → `lib/intel/ingest.ts` → `lib/intel/db.ts`
- **Rescore**: `app/api/cron/intel-rescore/route.js` → `lib/intel/rescoreSourceItems.ts` → `lib/intel/relevance.ts`
- **Warm caches**: `app/api/cron/warm-home/route.js` → calls the server functions the homepage and index pages use

Deployment schedule lives in `vercel.json` under `crons`.

## Known failure points (what actually breaks)

- **Cron not invoked**: If `/api/cron/ingest-signal` isn’t running, the whole intel surface decays into “stale” despite correct ranking logic.
  - Fix is repo-level cron wiring in `vercel.json` (plus `CRON_SECRET` in Vercel env).
- **Supabase schema exposure**: PostgREST errors when `intel` isn’t in “Exposed schemas” (handled by `liveIntel.service.js` error augment).
- **HTML index parser gaps**: `fetch_kind: html_index` is implemented only for specific slugs in `lib/intel/ingest.ts`; new html index sources must be explicitly wired there.
- **Clustering limits**: `cluster_keys` are deterministic and currently narrow (`lib/intel/clusterKeys.ts`), so many accountability developments won’t cluster.
- **Trust boundary confusion**: Statement-like sources must be constrained via `trustWarningMode`, `requiresIndependentVerification`, and `heroEligibilityMode` so claims don’t pollute verified lanes.

