import { query } from '../../../config/db';

let cachedHasVotingRolesLockedColumn: boolean | null = null;

export async function hasEventsVotingRolesLockedColumn(): Promise<boolean> {
  if (cachedHasVotingRolesLockedColumn !== null) {
    return cachedHasVotingRolesLockedColumn;
  }

  const rows = await query<any[]>(
    `SELECT 1 AS column_exists
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'events'
       AND COLUMN_NAME = 'voting_roles_locked'
     LIMIT 1`
  );

  cachedHasVotingRolesLockedColumn = rows.length > 0;
  return cachedHasVotingRolesLockedColumn;
}
