-- Migration: Move events.event_banner data into event_media_assets and drop duplicated column
-- Goal: Keep event_media_assets as single source of truth for event banner/media

INSERT INTO event_media_assets (event_id, media_url, media_type, sort_order, created_by, created_at)
SELECT
  e.id,
  e.event_banner,
  'BANNER',
  COALESCE((
    SELECT MAX(existing.sort_order) + 1
    FROM event_media_assets existing
    WHERE existing.event_id = e.id
  ), 1) AS next_sort_order,
  e.created_by,
  COALESCE(e.created_at, NOW())
FROM events e
WHERE e.event_banner IS NOT NULL
  AND TRIM(e.event_banner) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM event_media_assets existing
    WHERE existing.event_id = e.id
      AND existing.media_url = e.event_banner
  );

ALTER TABLE events
  DROP COLUMN event_banner;
