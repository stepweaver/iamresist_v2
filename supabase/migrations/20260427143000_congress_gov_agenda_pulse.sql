-- Congress.gov structured primary records + Agenda Pulse state-change hints.

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_fetch_kind_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_fetch_kind_check CHECK (
    fetch_kind IN (
      'rss',
      'json_api',
      'congress_api',
      'podcast_rss',
      'unsupported',
      'manual',
      'newsletter_only',
      'scrape',
      'html_index'
    )
  );

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_source_family_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_source_family_check CHECK (
    source_family IN (
      'general',
      'congress_primary',
      'defense_primary',
      'combatant_command',
      'defense_specialist',
      'watchdog_global',
      'indicator_hard',
      'indicator_soft',
      'indicator_anecdotal',
      'claims_public'
    )
  );

ALTER TABLE intel.source_items DROP CONSTRAINT IF EXISTS source_items_state_change_type_check;
ALTER TABLE intel.source_items
  ADD CONSTRAINT source_items_state_change_type_check CHECK (
    state_change_type IN (
      'unknown',
      'pre_publication',
      'published_document',
      'presidential_action',
      'press_statement',
      'legislative_feed_item',
      'congressional_record_feed_item',
      'committee_meeting',
      'committee_markup',
      'witness_list_posted',
      'witness_statement_posted',
      'bill_action',
      'bill_summary',
      'bill_text_updated',
      'house_roll_call_vote',
      'crs_report',
      'wire_item',
      'specialist_item',
      'commentary_item',
      'scheduled_release'
    )
  );

COMMENT ON CONSTRAINT sources_fetch_kind_check ON intel.sources IS
  'Includes congress_api for Congress.gov v3 JSON ingestion; API keys are appended at fetch time only.';
COMMENT ON CONSTRAINT sources_source_family_check ON intel.sources IS
  'Includes congress_primary for structured Congress.gov primary records.';
COMMENT ON CONSTRAINT source_items_state_change_type_check ON intel.source_items IS
  'Includes Congress.gov/Agenda Pulse congressional state-change hints.';
