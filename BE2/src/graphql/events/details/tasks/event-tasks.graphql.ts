import { execute, query } from '../../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { throwEventError, getLoggedInUserId } from '../voting/event-voting-core.graphql';

export const eventTasksTypes = `
  enum EventTaskStatus {
    NEW
    IN_PROGRESS
    COMPLETED
    HOLD
    WONT_FIX
  }

  type EventTaskEntry {
    id: Int!
    taskId: Int!
    eventId: Int!
    parentTaskId: Int
    parentTaskName: String
    taskName: String!
    status: String
    ownerUserId: Int
    ownerName: String
    createdByName: String
    createdAt: String!
    ownerAssignedAt: String
    updatedAt: String!
  }

  type EventTaskAssignee {
    userId: Int!
    name: String!
    email: String!
    photo: String
    committeeRole: String!
    isWinner: Boolean!
    roleIcon: String
    roleColor: String
  }

  type EventTasksPayload {
    entries: [EventTaskEntry!]!
    canCreateTasks: Boolean!
    taskAssignees: [EventTaskAssignee!]!
  }

  type UpdatedEventTaskName {
    taskName: String!
    updatedAt: String!
  }

  input CreateEventTaskInput {
    eventId: Int!
    taskName: String!
    parentTaskId: Int
    status: EventTaskStatus = NEW
  }

  type CreatedEventTask {
    id: Int!
    taskId: Int!
    eventId: Int!
    parentTaskId: Int
    parentTaskName: String
    taskName: String!
    status: EventTaskStatus!
    ownerUserId: Int
    ownerName: String
    createdByName: String
    createdAt: String!
    ownerAssignedAt: String
    updatedAt: String!
  }
`;

export const eventTasksQueryFields = `
  eventTasks(id: Int!): EventTasksPayload!
`;

export const createEventTaskMutationFields = `
  createEventTask(input: CreateEventTaskInput!): CreatedEventTask!
  assignEventTask(taskId: Int!, ownerUserId: Int): EventTaskEntry!
  updateEventTaskStatus(taskId: Int!, status: EventTaskStatus!): EventTaskEntry!
  updateEventTaskName(taskId: Int!, taskName: String!): UpdatedEventTaskName!
  deleteEventTask(taskId: Int!): Boolean!
`;

async function getTaskForAdminMutation(taskId: number, userId: number): Promise<any> {
  const taskRows = await query<any[]>(
    `SELECT t.id, t.event_id AS eventId, e.committee_id AS committeeId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (taskRows.length === 0) {
    throwEventError('NOT_FOUND', 'Task not found');
  }

  const task = taskRows[0];
  const adminRows = await query<any[]>(
    `SELECT committee_role
     FROM users_committees
     WHERE committee_id = ? AND user_id = ?
       AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
     LIMIT 1`,
    [Number(task.committeeId), userId]
  );
  if (adminRows.length === 0) {
    throwEventError('FORBIDDEN', 'Only committee admins can manage tasks');
  }
  return task;
}

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
        parentTaskName: string | null;
        taskName: string;
        status: string | null;
        ownerUserId: number | null;
        ownerName: string | null;
        createdByName: string | null;
        createdAt: string;
        ownerAssignedAt: string | null;
        updatedAt: string;
      }>>(
        `SELECT
           t.id AS taskId,
           t.event_id AS eventId,
           t.parent_id AS parentTaskId,
           parent.name AS parentTaskName,
           COALESCE(NULLIF(TRIM(t.name), ''), 'Untitled Task') AS taskName,
           t.status,
           t.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           creator.name AS createdByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt,
           DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
         FROM tasks t
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users creator ON creator.id = t.created_by
         WHERE t.event_id = ?
         ORDER BY t.created_at ASC, t.id ASC`,
        [eventId]
      );

      return {
        entries: taskRows.map((taskRow) => ({
          id: Number(taskRow.taskId),
          taskId: Number(taskRow.taskId),
          eventId: Number(taskRow.eventId),
          parentTaskId: taskRow.parentTaskId === null ? null : Number(taskRow.parentTaskId),
          parentTaskName: taskRow.parentTaskName || null,
          taskName: String(taskRow.taskName || 'Untitled Task'),
          status: taskRow.status ? String(taskRow.status) : null,
          ownerUserId: taskRow.ownerUserId === null ? null : Number(taskRow.ownerUserId),
          ownerName: taskRow.ownerName || null,
          createdByName: taskRow.createdByName || null,
          createdAt: String(taskRow.createdAt),
          ownerAssignedAt: taskRow.ownerAssignedAt || null,
          updatedAt: String(taskRow.updatedAt)
        })),
        canCreateTasks: ['COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN'].includes(String(membership?.committee_role || '')),
        taskAssignees: await query<Array<RowDataPacket & {
          userId: number;
          name: string;
          email: string;
          photo: string | null;
          committeeRole: string;
          isWinner: boolean;
          roleIcon: string | null;
          roleColor: string | null;
        }>>(
          `SELECT
             u.id AS userId,
             u.name,
             COALESCE(u.email, '') AS email,
             u.profile_photo AS photo,
             UPPER(COALESCE(NULLIF(TRIM(uc.committee_role), ''), 'COMMITTEE_MEMBER')) AS committeeRole,
             EXISTS (
               SELECT 1
               FROM event_winners ew
               WHERE ew.event_id = ? AND ew.winner_user_id = u.id
             ) AS isWinner,
             erm.icon AS roleIcon,
             erm.color AS roleColor
           FROM users_committees uc
           INNER JOIN users u ON u.id = uc.user_id
           LEFT JOIN users_events ue ON ue.user_id = u.id AND ue.event_id = ?
           LEFT JOIN events_roles_master erm ON erm.role_id = ue.role_id
           WHERE uc.committee_id = ?
             AND uc.committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN')
           ORDER BY u.name ASC`,
          [eventId, eventId, Number(event.committee_id)]
        ).then((assignees) => assignees.map((assignee) => ({
          userId: Number(assignee.userId),
          name: String(assignee.name || ''),
          email: String(assignee.email || ''),
          photo: assignee.photo || null,
          committeeRole: String(assignee.committeeRole || 'COMMITTEE_MEMBER'),
          isWinner: Number(assignee.isWinner) === 1,
          roleIcon: assignee.roleIcon || null,
          roleColor: assignee.roleColor || null
        })))
      };
    }
  },
  Mutation: {
    async updateEventTaskName(_: any, args: { taskId?: number; taskName?: string }, context: any) {
      const taskId = Number(args?.taskId);
      const taskName = String(args?.taskName || '').trim();
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
      }
      if (!taskName) {
        throwEventError('BAD_REQUEST', 'taskName is required');
      }
      if (taskName.length > 255) {
        throwEventError('BAD_REQUEST', 'taskName cannot exceed 255 characters');
      }

      const userId = await getLoggedInUserId(context);
      await getTaskForAdminMutation(taskId, userId);
      const result = await execute(
        `UPDATE tasks
         SET name = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [taskName, userId, taskId]
      );
      if (result.affectedRows !== 1) {
        throwEventError('NOT_FOUND', 'Task not found');
      }
      const updatedRows = await query<Array<RowDataPacket & { taskName: string; updatedAt: string }>>(
        `SELECT
           name AS taskName,
           DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
         FROM tasks
         WHERE id = ?
         LIMIT 1`,
        [taskId]
      );
      if (updatedRows.length === 0) {
        throwEventError('NOT_FOUND', 'Task not found');
      }
      return {
        taskName: String(updatedRows[0].taskName),
        updatedAt: String(updatedRows[0].updatedAt)
      };
    },
    async deleteEventTask(_: any, args: { taskId?: number }, context: any) {
      const taskId = Number(args?.taskId);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
      }

      const userId = await getLoggedInUserId(context);
      await getTaskForAdminMutation(taskId, userId);
      const childRows = await query<any[]>(
        `SELECT id
         FROM tasks
         WHERE parent_id = ?
         LIMIT 1`,
        [taskId]
      );
      if (childRows.length > 0) {
        throwEventError('BAD_REQUEST', 'Remove all subtasks before deleting this task');
      }

      const result = await execute('DELETE FROM tasks WHERE id = ?', [taskId]);
      if (result.affectedRows !== 1) {
        throwEventError('NOT_FOUND', 'Task not found');
      }
      return true;
    },
    async updateEventTaskStatus(_: any, args: { taskId?: number; status?: string }, context: any) {
      const taskId = Number(args?.taskId);
      const status = String(args?.status || '').trim().toUpperCase();
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
      }
      if (!['NEW', 'IN_PROGRESS', 'COMPLETED', 'HOLD', 'WONT_FIX'].includes(status)) {
        throwEventError('BAD_REQUEST', 'status must be NEW, IN_PROGRESS, COMPLETED, HOLD, or WONT_FIX');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const taskRows = await query<any[]>(
        `SELECT id, event_id AS eventId, owner_user_id AS ownerUserId
         FROM tasks
         WHERE id = ?
         LIMIT 1`,
        [taskId]
      );
      if (taskRows.length === 0) {
        throwEventError('NOT_FOUND', 'Task not found');
      }
      if (taskRows[0].ownerUserId === null || Number(taskRows[0].ownerUserId) !== loggedInUserId) {
        throwEventError('FORBIDDEN', 'Only the task owner can update its status');
      }

      const updateResult = await execute(
        `UPDATE tasks
         SET status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ?`,
        [status, loggedInUserId, taskId, loggedInUserId]
      );
      if (updateResult.affectedRows !== 1) {
        throwEventError('FORBIDDEN', 'Only the task owner can update its status');
      }

      const updatedRows = await query<any[]>(
        `SELECT
           t.id AS taskId,
           t.event_id AS eventId,
           t.parent_id AS parentTaskId,
           parent.name AS parentTaskName,
           COALESCE(NULLIF(TRIM(t.name), ''), 'Untitled Task') AS taskName,
           t.status,
           t.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           creator.name AS createdByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt,
           DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
         FROM tasks t
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users creator ON creator.id = t.created_by
         WHERE t.id = ?
         LIMIT 1`,
        [taskId]
      );
      const updatedTask = updatedRows[0];
      return {
        id: Number(updatedTask.taskId),
        taskId: Number(updatedTask.taskId),
        eventId: Number(updatedTask.eventId),
        parentTaskId: updatedTask.parentTaskId === null ? null : Number(updatedTask.parentTaskId),
        parentTaskName: updatedTask.parentTaskName || null,
        taskName: String(updatedTask.taskName),
        status: updatedTask.status ? String(updatedTask.status) : null,
        ownerUserId: updatedTask.ownerUserId === null ? null : Number(updatedTask.ownerUserId),
        ownerName: updatedTask.ownerName || null,
        createdByName: updatedTask.createdByName || null,
        createdAt: String(updatedTask.createdAt),
        ownerAssignedAt: updatedTask.ownerAssignedAt || null,
        updatedAt: String(updatedTask.updatedAt)
      };
    },
    async assignEventTask(_: any, args: { taskId?: number; ownerUserId?: number | null }, context: any) {
      const taskId = Number(args?.taskId);
      const ownerUserId = args?.ownerUserId == null ? null : Number(args.ownerUserId);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
      }
      if (ownerUserId !== null && (!Number.isInteger(ownerUserId) || ownerUserId <= 0)) {
        throwEventError('BAD_REQUEST', 'ownerUserId must be a positive integer or null');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const taskRows = await query<any[]>(
        `SELECT t.event_id AS eventId, e.committee_id AS committeeId
         FROM tasks t
         INNER JOIN events e ON e.id = t.event_id
         WHERE t.id = ?
         LIMIT 1`,
        [taskId]
      );
      if (taskRows.length === 0) {
        throwEventError('NOT_FOUND', 'Task not found');
      }

      const task = taskRows[0];
      const adminRows = await query<any[]>(
        `SELECT committee_role
         FROM users_committees
         WHERE committee_id = ? AND user_id = ?
           AND committee_role IN ('COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
         LIMIT 1`,
        [Number(task.committeeId), loggedInUserId]
      );
      if (adminRows.length === 0) {
        throwEventError('FORBIDDEN', 'Only committee admins can assign tasks');
      }

      if (ownerUserId !== null) {
        const ownerRows = await query<any[]>(
          `SELECT user_id
           FROM users_committees
           WHERE committee_id = ?
             AND user_id = ?
             AND committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
           LIMIT 1`,
          [Number(task.committeeId), ownerUserId]
        );
        if (ownerRows.length === 0) {
          throwEventError('BAD_REQUEST', 'The selected task owner must be a member of this committee');
        }
      }

      await execute(
        `UPDATE tasks
         SET owner_user_id = ?,
             owner_assigned_by = ?,
             owner_assigned_at = IF(? IS NULL, NULL, CURRENT_TIMESTAMP),
             updated_by = ?
         WHERE id = ?`,
        [ownerUserId, ownerUserId === null ? null : loggedInUserId, ownerUserId, loggedInUserId, taskId]
      );

      const updatedRows = await query<any[]>(
        `SELECT
           t.id AS taskId,
           t.event_id AS eventId,
           t.parent_id AS parentTaskId,
           parent.name AS parentTaskName,
           COALESCE(NULLIF(TRIM(t.name), ''), 'Untitled Task') AS taskName,
           t.status,
           t.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           creator.name AS createdByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt,
           DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
         FROM tasks t
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users creator ON creator.id = t.created_by
         WHERE t.id = ?
         LIMIT 1`,
        [taskId]
      );
      const updated = updatedRows[0];
      return {
        id: Number(updated.taskId),
        taskId: Number(updated.taskId),
        eventId: Number(updated.eventId),
        parentTaskId: updated.parentTaskId === null ? null : Number(updated.parentTaskId),
        parentTaskName: updated.parentTaskName || null,
        taskName: String(updated.taskName),
        status: updated.status ? String(updated.status) : null,
        ownerUserId: updated.ownerUserId === null ? null : Number(updated.ownerUserId),
        ownerName: updated.ownerName || null,
        createdByName: updated.createdByName || null,
        createdAt: String(updated.createdAt),
        ownerAssignedAt: updated.ownerAssignedAt || null,
        updatedAt: String(updated.updatedAt)
      };
    },
    async createEventTask(_: any, args: { input?: { eventId?: number; taskName?: string; parentTaskId?: number | null; status?: string | null } }, context: any) {
      const eventId = Number(args?.input?.eventId);
      const taskName = String(args?.input?.taskName || '').trim();
      const parentTaskId = args?.input?.parentTaskId == null ? null : Number(args.input.parentTaskId);
      const status = String(args?.input?.status || 'NEW').trim().toUpperCase();

      if (!Number.isInteger(eventId) || eventId <= 0) {
        throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
      }
      if (!taskName) {
        throwEventError('BAD_REQUEST', 'taskName is required');
      }
      if (taskName.length > 255) {
        throwEventError('BAD_REQUEST', 'taskName cannot exceed 255 characters');
      }
      if (!['NEW', 'IN_PROGRESS', 'COMPLETED', 'HOLD', 'WONT_FIX'].includes(status)) {
        throwEventError('BAD_REQUEST', 'status must be NEW, IN_PROGRESS, COMPLETED, HOLD, or WONT_FIX');
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
        `INSERT INTO tasks (
           event_id, parent_id, name, owner_user_id, status,
           created_by, updated_by, owner_assigned_by, owner_assigned_at
         )
         VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL)`,
        [
          eventId,
          parentTaskId,
          taskName,
          status,
          loggedInUserId,
          loggedInUserId
        ]
      );

      const createdRows = await query<any[]>(
        `SELECT
           t.id AS taskId,
           t.event_id AS eventId,
           t.parent_id AS parentTaskId,
           parent.name AS parentTaskName,
           COALESCE(NULLIF(TRIM(t.name), ''), 'Untitled Task') AS taskName,
           t.status,
           t.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           creator.name AS createdByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt,
           DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
         FROM tasks t
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users creator ON creator.id = t.created_by
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
        parentTaskName: task.parentTaskName || null,
        taskName: String(task.taskName),
        status: String(task.status),
        ownerUserId: task.ownerUserId === null ? null : Number(task.ownerUserId),
        ownerName: task.ownerName || null,
        createdByName: task.createdByName || null,
        createdAt: String(task.createdAt),
        ownerAssignedAt: task.ownerAssignedAt || null,
        updatedAt: String(task.updatedAt)
      };
    }
  }
};
