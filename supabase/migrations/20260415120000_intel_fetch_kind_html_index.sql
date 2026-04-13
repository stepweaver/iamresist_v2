-- Allow html_index ingest (listing HTML → article links), e.g. Democracy Docket /news-alerts/.
ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_fetch_kind_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_fetch_kind_check CHECK (
    fetch_kind IN (
      'rss',
      'json_api',
      'podcast_rss',
      'unsupported',
      'manual',
      'newsletter_only',
      'scrape',
      'html_index'
    )
  );
