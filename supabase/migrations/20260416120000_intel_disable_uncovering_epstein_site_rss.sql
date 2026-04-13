-- epsteincoverup.us/feed/ is not a reliable RSS source for our parser (200 OK, 0 items).
-- Ingest for this editorial project uses Substack: courier-the-cover-up.
UPDATE intel.sources
SET is_enabled = false, updated_at = now()
WHERE slug = 'uncovering-epstein-network';
