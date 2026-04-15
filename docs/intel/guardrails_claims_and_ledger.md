# Guardrails: public claims + accountability ledger (trust & safety)

These guardrails keep the system from collapsing editorial trust when we add **statements/claims ingestion** and eventually a **politician accountability ledger**.

## 1) Claims ingestion guardrails

- **Whitelist only**: every claims source must be explicitly named and governed in `lib/intel/signal-sources.ts`.
- **No social scraping**: no ToS-risk ingestion paths; prefer official sites, RSS, or APIs with explicit public syndication.
- **Quarantine by lane**:
  - Claims live in `desk_lane = statements` (or other explicitly “claims” lanes), never merged into verified desks by default.
  - Claims do not compete for OSINT lead selection.
- **Trust posture must be explicit** on every claims source:
  - `trustWarningMode: source_controlled_official_claims`
  - `requiresIndependentVerification: true`
  - `heroEligibilityMode: never_hero_without_corroboration`
  - `contentUseMode: metadata_only` when feasible (avoid accidental “summary as fact”)
- **No “evidence by default”**:
  - A claim item is not treated as verified action unless supported by a **primary record** (order, filing, transcript) or corroborated reporting.
- **Deterministic claim states (no guesswork)**:
  - `unverified_claim`
  - `corroborated_by_reporting`
  - `corroborated_by_primary_document`
  - `contradicted`
  - `unresolved`

## 2) Corroboration rules (what can corroborate what)

- **Primary records** can corroborate claims and can resolve contradictions.
- **Wire + specialist reporting** can corroborate claims (as “corroborated_by_reporting”), but should not upgrade to “primary-document corroborated.”
- **Commentary cannot corroborate**.
- **Claims cannot corroborate other claims** (no circular validation).

When persisted (events/ledger), corroboration must be modeled as **explicit evidence links** with roles:

- `primary`
- `reporting`
- `claim`
- `context`

## 3) UI/UX guardrails (avoid “claims look like facts”)

- **Visual separation**: claims pages and chips must clearly say “claims / not evidence.”
- **Evidence stack**: when we show a claim, it should prefer showing attached evidence links (primary/reporting) if present.
- **No sensational phrasing**: titles should remain source titles; any editorial labels must be conservative.
- **Explainability over magic**: if something is elevated, it must show a short “why” explanation.

## 4) Accountability ledger guardrails (defamation-aware)

- **Evidence-led**: every ledger entry must have:
  - at least one evidence link (preferably primary or high-quality reporting)
  - a clear `evidence_state`
  - provenance/trust warnings preserved from the underlying `source_items`
- **No reputation scoring**:
  - no numeric “badness” score
  - no generalized labels (“corrupt”, “criminal”) unless describing an explicit adjudicated outcome with primary evidence
- **State ladder is the product**:
  - Users should see the entry’s status as a state machine, not a judgment.
- **Prefer procedural language**:
  - “Complaint filed”, “Investigation opened”, “Charged”, “Convicted”, “Dismissed”, “Unresolved”
- **Corrections & reversibility**:
  - Ledger entries must support state transitions and clear timestamps.
  - A later `dismissed` or `resolved` state should remain visible (no silent erasure).

## 5) Editorial governance and auditability

- **All sources are governed** by the manifest and mirrored to `intel.sources`.
- **All elevations are reproducible**:
  - deterministic rules (regex / keys) and explanations stored on the object that’s being elevated (item/event/ledger entry)
- **Audit pages are part of safety**:
  - keep `/intel/sources` and extend it rather than hiding decisions behind the UI.

