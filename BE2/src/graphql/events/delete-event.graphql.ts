import { getConnection, query } from '../../config/db';

function throwEventError(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function getAccessToken(context: any): string {
  const authHeader = context.headers?.authorization;
  const tokenFromCookie = context.cookies?.token;

  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  if (typeof tokenFromCookie === 'string' && tokenFromCookie.trim().length > 0) {
    return tokenFromCookie.trim();
  }

  return '';
}

async function getLoggedInUserId(context: any): Promise<number> {
  const accessToken = getAccessToken(context);
  if (!accessToken) {
    throwEventError('UNAUTHORIZED', 'Missing access token');
  }

  try {
    const decoded: any = await context.jwt.verify(accessToken);
    const loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);

    if (!Number.isInteger(loggedInUserId) || loggedInUserId <= 0) {
      throwEventError('UNAUTHORIZED', 'Invalid token payload');
    }

    return loggedInUserId;
  } catch {
    throwEventError('UNAUTHORIZED', 'Invalid or expired token');
  }
}

async function hasTableColumn(connection: any, tableName: string, columnName: string): Promise<boolean> {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );

  return rows.length > 0;
}

async function hasTable(connection: any, tableName: string): Promise<boolean> {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );

  return rows.length > 0;
}

export const deleteEventTypes = `
  type DeletedEventPayload {
    eventId: Int!
    eventName: String!
    deletedBy: Int!
    deletedAt: String!
  }
`;

export const deleteEventMutationFields = `
  deleteEvent(eventId: Int!): DeletedEventPayload!
`;

export const deleteEventResolvers = {
  Mutation: {
    async deleteEvent(_: any, args: { eventId: number }, context: any) {
      const loggedInUserId = await getLoggedInUserId(context);
      const eventId = Number(args?.eventId);

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }

      const eventRows = await query<any[]>(
        `SELECT id, name, committee_id AS committeeId
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      const event = eventRows[0];
      if (!event) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const adminCheck = await query<any[]>(
        `SELECT user_id
         FROM users_committees
         WHERE committee_id = ? AND user_id = ? AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         LIMIT 1`,
        [Number(event.committeeId), loggedInUserId]
      );

      if (adminCheck.length === 0) {
        throwEventError('FORBIDDEN', 'Only committee admins can delete events');
      }

      const connection = await getConnection();
      try {
        await connection.beginTransaction();

        const [eventSnapshotRows] = await connection.query(
          `SELECT *
           FROM events
           WHERE id = ?
           LIMIT 1`,
          [eventId]
        );

        const eventSnapshot = Array.isArray(eventSnapshotRows) && eventSnapshotRows.length > 0
          ? JSON.stringify(eventSnapshotRows[0])
          : null;
        const deletedAt = new Date();

        const hasDeletedEventsAuditTable = await hasTable(connection, 'deleted_events_audit');
        if (!hasDeletedEventsAuditTable) {
          throwEventError('INTERNAL', 'Missing deleted_events_audit table. Run migrations first.');
        }

        await connection.execute(
          `INSERT INTO deleted_events_audit (
             event_id,
             event_name,
             committee_id,
             deleted_by,
             deleted_at,
             event_snapshot
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            eventId,
            String(event.name || ''),
            Number(event.committeeId) || null,
            loggedInUserId,
            deletedAt,
            eventSnapshot
          ]
        );

        const cleanupTables = ['users_events', 'event_media_assets', 'tasks', 'programs', 'event_members'];

        for (const tableName of cleanupTables) {
          const canDeleteByEventId = await hasTableColumn(connection, tableName, 'event_id');
          if (canDeleteByEventId) {
            await connection.execute(`DELETE FROM ${tableName} WHERE event_id = ?`, [eventId]);
          }
        }

        const [deleteResult] = await connection.execute<any>(
          `DELETE FROM events WHERE id = ?`,
          [eventId]
        );

        if (!deleteResult?.affectedRows) {
          throwEventError('NOT_FOUND', 'Event not found');
        }

        await connection.commit();

        return {
          eventId,
          eventName: String(event.name || ''),
          deletedBy: loggedInUserId,
          deletedAt: deletedAt.toISOString()
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
  }
};
