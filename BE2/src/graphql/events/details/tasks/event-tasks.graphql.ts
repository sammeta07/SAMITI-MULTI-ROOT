import { execute, query } from '../../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { throwEventError, getLoggedInUserId } from '../voting/event-voting-core.graphql';

export const eventTasksTypes = `
  type EventTaskEntry {
    id: Int!
    taskId: Int!
    eventId: Int!
    parentTaskId: Int
    taskName: String!
    status: String
    ownerUserId: Int
    ownerName: String
  }

  type EventTasksPayload {
    entries: [EventTaskEntry!]!
    canCreateTasks: Boolean!
  }

  input CreateEventTaskInput {
    eventId: Int!
    taskName: String!
    parentTaskId: Int
  }

  type CreatedEventTask {
    id: Int!
    taskId: Int!
    eventId: Int!
    parentTaskId: Int
    taskName: String!
    status: String!
    ownerUserId: Int
    ownerName: String
  }
`;

export const eventTasksQueryFields = `
  eventTasks(id: Int!): EventTasksPayload!
`;

export const createEventTaskMutationFields = `
  createEventTask(input: CreateEventTaskInput!): CreatedEventTask!
`;

export const eventTasksResolvers = {
  Query: {
    async eventTasks(_: any, args: { id: number }, context: any) {
      const eventId = Number(args?.id);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'id must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const eventResult = await query<any[]>(
        `SELECT id, committee_id
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );

      if (!eventResult || eventResult.length === 0) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventResult[0];
      const committeeMembership = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
         LIMIT 1`,
        [Number(event.committee_id), loggedInUserId]
      );

      const membership = committeeMembership[0];
      const hasCommitteeAccess = Boolean(
        membership &&
        (
          String(membership.committee_role || '') === 'COMMITTEE_MEMBER' ||
          String(membership.committee_role || '') === 'COMMITTEE_ADMIN' ||
          String(membership.committee_role || '') === 'COMMITTEE_MASTER_ADMIN'
        )
      );

      if (!hasCommitteeAccess) {
        throwEventError('FORBIDDEN', 'You are not allowed to access this event');
      }

      const taskRows = await query<Array<RowDataPacket & {
        taskId: number;
        eventId: number;
        parentTaskId: number | null;
        taskName: string;
        status: string | null;
        ownerUserId: number | null;
        ownerName: string | null;
      }>>(
        `SELECT
           t.id AS taskId,
           t.event_id AS eventId,
           t.parent_id AS parentTaskId,
           COALESCE(NULLIF(TRIM(t.title), ''), NULLIF(TRIM(t.name), ''), 'Untitled Task') AS taskName,
           t.status,
           t.owner_id AS ownerUserId,
           owner.name AS ownerName
         FROM tasks t
         LEFT JOIN users owner ON owner.id = t.owner_id
         WHERE t.event_id = ?
         ORDER BY t.parent_id ASC, t.created_at ASC, t.id ASC`,
        [eventId]
      );

      return {
        entries: taskRows.map((taskRow) => ({
          id: Number(taskRow.taskId),
          taskId: Number(taskRow.taskId),
          eventId: Number(taskRow.eventId),
          parentTaskId: taskRow.parentTaskId === null ? null : Number(taskRow.parentTaskId),
          taskName: String(taskRow.taskName || 'Untitled Task'),
          status: taskRow.status ? String(taskRow.status) : null,
          ownerUserId: taskRow.ownerUserId === null ? null : Number(taskRow.ownerUserId),
          ownerName: taskRow.ownerName || null
        })),
        canCreateTasks: ['COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN'].includes(
          String(membership?.committee_role || '')
        )
      };
    }
  },
  Mutation: {
    async createEventTask(_: any, args: { input?: { eventId?: number; taskName?: string; parentTaskId?: number | null } }, context: any) {
      const eventId = Number(args?.input?.eventId);
      const taskName = String(args?.input?.taskName || '').trim();
      const parentTaskId = args?.input?.parentTaskId == null ? null : Number(args.input.parentTaskId);

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }
      if (!taskName) {
        throwEventError('BAD_REQUEST', 'taskName is required');
      }
      if (taskName.length > 255) {
        throwEventError('BAD_REQUEST', 'taskName cannot exceed 255 characters');
      }
      if (parentTaskId !== null && (!Number.isInteger(parentTaskId) || parentTaskId <= 0)) {
        throwEventError('BAD_REQUEST', 'parentTaskId must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const eventRows = await query<any[]>(
        `SELECT id, committee_id
         FROM events
         WHERE id = ?
         LIMIT 1`,
        [eventId]
      );
      if (eventRows.length === 0) {
        throwEventError('NOT_FOUND', 'Event not found');
      }

      const event = eventRows[0];
      const adminRows = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
           AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         LIMIT 1`,
        [Number(event.committee_id), loggedInUserId]
      );
      if (adminRows.length === 0) {
        throwEventError('FORBIDDEN', 'Only committee admins can create tasks');
      }

      if (parentTaskId !== null) {
        const parentRows = await query<any[]>(
          `SELECT id
           FROM tasks
           WHERE id = ? AND event_id = ?
           LIMIT 1`,
          [parentTaskId, eventId]
        );
        if (parentRows.length === 0) {
          throwEventError('BAD_REQUEST', 'parentTaskId must belong to the selected event');
        }
      }

      const result = await execute(
        `INSERT INTO tasks (event_id, parent_id, name, title, status)
         VALUES (?, ?, ?, ?, 'PENDING')`,
        [eventId, parentTaskId, taskName, taskName]
      );

      const createdRows = await query<any[]>(
        `SELECT
           t.id AS taskId,
           t.event_id AS eventId,
           t.parent_id AS parentTaskId,
           t.title AS taskName,
           t.status,
           t.owner_id AS ownerUserId,
           owner.name AS ownerName
         FROM tasks t
         LEFT JOIN users owner ON owner.id = t.owner_id
         WHERE t.id = ?
         LIMIT 1`,
        [result.insertId]
      );
      const task = createdRows[0];
      return {
        id: Number(task.taskId),
        taskId: Number(task.taskId),
        eventId: Number(task.eventId),
        parentTaskId: task.parentTaskId === null ? null : Number(task.parentTaskId),
        taskName: String(task.taskName),
        status: String(task.status),
        ownerUserId: task.ownerUserId === null ? null : Number(task.ownerUserId),
        ownerName: task.ownerName || null
      };
    }
  }
};
