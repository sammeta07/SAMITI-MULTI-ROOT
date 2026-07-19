import { query } from '../../../config/db';

let cachedHasEventsDisplayNameColumn: boolean | null = null;

export async function hasEventsDisplayNameColumn(): Promise<boolean> {
  if (cachedHasEventsDisplayNameColumn !== null) {
    return cachedHasEventsDisplayNameColumn;
  }

  const rows = await query<any[]>(
    `SELECT 1 AS column_exists
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'events'
       AND COLUMN_NAME = 'display_name'
     LIMIT 1`
  );

  cachedHasEventsDisplayNameColumn = rows.length > 0;
  return cachedHasEventsDisplayNameColumn;
}

