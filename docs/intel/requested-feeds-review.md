## Requested feeds review (repo-grounded)

This document is generated from the current repo state and live product behavior observed on `iamresist.org` (Apr 15, 2026).

### Legend
- **Status**: working | partial | broken_adapter | placeholder | manual_only | duplicate_keep_off
- **Adapter**: rss | atom | html_index | custom_parser | api_integration | manual_only | keep_disabled
- **Enablement**: enable | quarantine | rework | leave_off

---

### U.S. Army
- **Repo slug**: `army-mil-news`
- **Repo status**: placeholder (`endpointUrl: null`, `isEnabled: false`)
- **Live status**: disabled (no endpoint)
- **Status**: placeholder
- **Adapter**: rss (or html_index fallback)
- **Enablement**: rework
- **Notes**: `.mil` RSS endpoints frequently 403/404 from datacenter runtimes; requires a verified endpoint URL that works from the ingest runtime.

### CENTCOM
- **Repo slug**: `centcom-press`
- **Repo status**: placeholder (`endpointUrl: null`, `isEnabled: false`)
- **Live status**: disabled (no endpoint)
- **Status**: placeholder
- **Adapter**: rss or html_index
- **Enablement**: rework
- **Notes**: expected bot-block risk; prefer a public listing page + `html_index` parser if RSS is blocked.

### DVIDS
- **Repo slug**: `dvids-sandbox`
- **Repo status**: disabled placeholder (`endpointUrl: null`, `isEnabled: false`) explicitly due to firehose risk
- **Live status**: disabled
- **Status**: placeholder (policy-scoped)
- **Adapter**: rss (tight tag/org feed) or api_integration later
- **Enablement**: quarantine → enable only with tight scoping

### U.S. European Command
- **Repo slug**: `eucom-press`
- **Repo status**: placeholder (`endpointUrl: null`, `isEnabled: false`)
- **Live status**: disabled
- **Status**: placeholder
- **Adapter**: rss or html_index
- **Enablement**: rework

### Pentagon Pizza Index
- **Repo slug**: `indicator-pentagon-pizza`
- **Repo status**: `manual`, disabled by design
- **Live status**: disabled
- **Status**: manual_only
- **Adapter**: manual_only
- **Enablement**: leave_off (keep manual-only; never treat as evidence)

### The Kyiv Independent
- **Repo slug**: `kyiv-independent`
- **Repo status**: conditional enablement; requires `INTEL_KYIV_INDEPENDENT_RSS_URL`
- **Live status**: disabled (env unset)
- **Status**: placeholder
- **Adapter**: rss
- **Enablement**: rework (provide/verify URL in runtime)

### +972 Magazine
- **Repo slug**: `mag-972`
- **Repo status**: rss; **now enabled** in manifest for visibility
- **Live status**: previously observed as successfully ingesting (suggests production drift had it enabled)
- **Status**: partial (historically redirect-loop risk)
- **Adapter**: rss
- **Enablement**: enable (with audit-driven monitoring)

### OCCRP
- **Repo slug**: `occrp`
- **Repo status**: `unsupported`, disabled
- **Live status**: disabled
- **Status**: placeholder
- **Adapter**: manual_only now; rss/html_index once a stable fetchable endpoint is verified
- **Enablement**: quarantine → rework

### OFAC
- **Repo slug**: `ofac-recent-actions`
- **Repo status**: `unsupported`, disabled (legacy RSS retired)
- **Live status**: disabled
- **Status**: placeholder
- **Adapter**: html_index or api_integration (must be grounded in current OFAC publication endpoints)
- **Enablement**: rework

### SAM.gov
- **Repo slug**: `sam-gov-contracting`
- **Repo status**: `unsupported`, disabled; requires API key + ToS review
- **Live status**: disabled
- **Status**: placeholder
- **Adapter**: api_integration (or manual_only until approved)
- **Enablement**: quarantine → rework

### Statements
- **Repo slugs**: `statements-public-import` (manual), `statements-rss-sandbox` (rss placeholder)
- **Repo status**: disabled by design
- **Live status**: `/intel/statements` shows no ingested items
- **Status**: manual_only (quarantined lane)
- **Adapter**: rss for whitelisted statement feeds + manual_only import
- **Enablement**: quarantine (enable only with claim/evidence states and strict promotion constraints)

### USNI
- **Repo slug**: `usni-fleet-tracker`
- **Repo status**: `html_index`; **now enabled** in manifest for visibility
- **Live status**: previously observed as successfully ingesting (suggests production drift had it enabled)
- **Status**: partial (bot-block risk)
- **Adapter**: html_index
- **Enablement**: enable (with audit-driven monitoring)

### Uncovering the Epstein Network
- **Repo slug**: `uncovering-epstein-network`
- **Repo status**: disabled; DB migration explicitly disables due to “200 OK, 0 items”; canonical working feed is `courier-the-cover-up` (Substack)
- **Live status**: disabled
- **Status**: duplicate_keep_off
- **Adapter**: keep_disabled (or html_index later if canonical on-domain URLs are required)
- **Enablement**: leave_off

### DOJ Office of Inspector General
- **Repo slug**: `doj-oig`
- **Repo status**: enabled (`endpointUrl` set; `isEnabled: true`)
- **Live status**: expected working (public RSS: `https://oig.justice.gov/rss.xml`)
- **Status**: working
- **Adapter**: rss
- **Enablement**: enable
- **Notes**: Primary oversight artifacts (audits/reports/misconduct findings). Not a narrative completeness source; pair with corroborating reporting where needed.

### Just Security
- **Repo slug**: `just-security`
- **Repo status**: enabled (`endpointUrl` set; `isEnabled: true`)
- **Live status**: expected working (public RSS: `https://www.justsecurity.org/feed/`)
- **Status**: working
- **Adapter**: rss
- **Enablement**: enable
- **Notes**: Specialist analysis; requires independent verification via linked filings/orders/statutes. Good for context and procedural framing, not as primary evidence.

### Campaign Legal Center
- **Repo slug**: `campaign-legal-center`
- **Repo status**: enabled (`endpointUrl` set; `isEnabled: true`)
- **Live status**: expected working (public RSS: `https://campaignlegal.org/rss.xml`)
- **Status**: working
- **Adapter**: rss
- **Enablement**: enable
- **Notes**: Election integrity/democracy litigation + enforcement context; posture is advocacy. Use filings/agencies/independent reporting to confirm claims.

