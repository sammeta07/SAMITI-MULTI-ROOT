import { query } from '../../config/db';

export async function hasEventsVotingPhaseStateColumn(): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT 1 AS column_exists
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'events'
       AND COLUMN_NAME = 'voting_phase_state'
     LIMIT 1`
  );

  return rows.length > 0;
}