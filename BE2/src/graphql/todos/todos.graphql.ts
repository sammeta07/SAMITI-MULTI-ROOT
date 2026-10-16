import { execute, query } from '../../config/db';
import { getLoggedInUserId, throwEventError } from '../events/details/voting/event-voting-core.graphql';

export const todoTypes = `
  enum TodoStatus {
    PENDING
    IN_PROGRESS
    COMPLETED
  }

  enum TodoParentType {
    TASK
    PROGRAM
  }

  type TodoItem {
    id: Int!
    title: String!
    status: TodoStatus!
    isCompleted: Boolean!
    assignedUserId: Int
    assignedUserName: String
    createdAt: String!
  }

  type TodoAssignee {
    userId: Int!
    name: String!
  }

  input CreateTodoInput {
    parentType: TodoParentType!
    parentId: Int!
    title: String!
  }
`;

export const todoMutationFields = `
  createTodo(input: CreateTodoInput!): TodoItem!
  setTodoCompleted(todoId: Int!, isCompleted: Boolean!): TodoItem!
  setTodoStatus(todoId: Int!, status: TodoStatus!): TodoItem!
  assignTodo(todoId: Int!, ownerUserId: Int): TodoItem!
  deleteTodo(todoId: Int!): Boolean!
`;

type ParentType = 'TASK' | 'PROGRAM';

export async function getTodoAssignees(committeeId: number): Promise<Array<{ userId: number; name: string }>> {
  const rows = await query<any[]>(
    `SELECT u.id AS userId, u.name
     FROM users_committees uc
     INNER JOIN users u ON u.id = uc.user_id
     WHERE uc.committee_id = ?
       AND uc.committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
     ORDER BY u.name ASC`,
    [committeeId]
  );

  return rows.map((row) => ({ userId: Number(row.userId), name: String(row.name || '') }));
}

async function getParentEventId(parentType: ParentType, parentId: number): Promise<number> {
  const table = parentType === 'TASK' ? 'tasks' : 'programs';
  const rows = await query<any[]>(
    `SELECT event_id AS eventId
     FROM ${table}
     WHERE id = ?
     LIMIT 1`,
    [parentId]
  );

  if (rows.length === 0) {
    throwEventError('NOT_FOUND', `${parentType.toLowerCase()} not found`);
  }

  return Number(rows[0].eventId);
}

async function getCommitteePermission(eventId: number, userId: number) {
  const rows = await query<any[]>(
    `SELECT e.committee_id AS committeeId, uc.committee_role AS committeeRole
     FROM events e
     LEFT JOIN users_committees uc
       ON uc.committee_id = e.committee_id AND uc.user_id = ?
     WHERE e.id = ?
     LIMIT 1`,
    [userId, eventId]
  );

  if (rows.length === 0) {
    throwEventError('NOT_FOUND', 'Event not found');
  }

  const role = String(rows[0].committeeRole || '');
  const hasCommitteeAccess = [
    'COMMITTEE_MEMBER',
    'COMMITTEE_ADMIN',
    'COMMITTEE_MASTER_ADMIN'
  ].includes(role);

  return {
    hasCommitteeAccess,
    canManage: role === 'COMMITTEE_ADMIN' || role === 'COMMITTEE_MASTER_ADMIN'
  };
}

async function getTodoEventId(todoId: number): Promise<{ eventId: number; committeeId: number }> {
  const rows = await query<any[]>(
    `SELECT COALESCE(t.event_id, p.event_id) AS eventId, e.committee_id AS committeeId
     FROM todos todo
     LEFT JOIN tasks t ON t.id = todo.task_id
     LEFT JOIN programs p ON p.id = todo.program_id
     INNER JOIN events e ON e.id = COALESCE(t.event_id, p.event_id)
     WHERE todo.id = ?
     LIMIT 1`,
    [todoId]
  );

  if (rows.length === 0) {
    throwEventError('NOT_FOUND', 'Todo not found');
  }

  return {
    eventId: Number(rows[0].eventId),
    committeeId: Number(rows[0].committeeId)
  };
}

async function getTodoItem(todoId: number) {
  const rows = await query<any[]>(
    `SELECT
       todo.id,
       todo.title,
       todo.status,
       todo.is_completed AS isCompleted,
       todo.assigned_user_id AS assignedUserId,
       assignee.name AS assignedUserName,
       DATE_FORMAT(todo.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
     FROM todos todo
     LEFT JOIN users assignee ON assignee.id = todo.assigned_user_id
     WHERE todo.id = ?
     LIMIT 1`,
    [todoId]
  );
  const row = rows[0];

  return {
    id: Number(row.id),
    title: String(row.title),
    status: String(row.status),
    isCompleted: Boolean(Number(row.isCompleted)),
    assignedUserId: row.assignedUserId === null ? null : Number(row.assignedUserId),
    assignedUserName: row.assignedUserName || null,
    createdAt: String(row.createdAt)
  };
}

export const todoResolvers = {
  Mutation: {
    async createTodo(_: any, args: { input?: { parentType?: ParentType; parentId?: number; title?: string } }, context: any) {
      const parentType = args?.input?.parentType;
      const parentId = Number(args?.input?.parentId);
      const title = String(args?.input?.title || '').trim();

      if (parentType !== 'TASK' && parentType !== 'PROGRAM') {
        throwEventError('BAD_REQUEST', 'parentType must be TASK or PROGRAM');
      }
      if (!Number.isInteger(parentId) || parentId <= 0) {
        throwEventError('BAD_REQUEST', 'parentId must be a positive integer');
      }
      if (!title || title.length > 255) {
        throwEventError('BAD_REQUEST', 'title must contain 1 to 255 characters');
      }

      const userId = await getLoggedInUserId(context);
      const eventId = await getParentEventId(parentType, parentId);
      const permission = await getCommitteePermission(eventId, userId);
      if (!permission.canManage) {
        throwEventError('FORBIDDEN', 'Only committee admins can add checklist items');
      }

      const parentColumn = parentType === 'TASK' ? 'task_id' : 'program_id';
      const result = await execute(
        `INSERT INTO todos (${parentColumn}, title, created_by, updated_by)
         VALUES (?, ?, ?, ?)`,
        [parentId, title, userId, userId]
      );
      return getTodoItem(result.insertId);
    },

    async setTodoCompleted(_: any, args: { todoId?: number; isCompleted?: boolean }, context: any) {
      const todoId = Number(args?.todoId);
      if (!Number.isInteger(todoId) || todoId <= 0 || typeof args?.isCompleted !== 'boolean') {
        throwEventError('BAD_REQUEST', 'todoId and isCompleted are required');
      }

      const userId = await getLoggedInUserId(context);
      const { eventId } = await getTodoEventId(todoId);
      const permission = await getCommitteePermission(eventId, userId);
      if (!permission.hasCommitteeAccess) {
        throwEventError('FORBIDDEN', 'You are not allowed to update this checklist');
      }

      await execute(
        `UPDATE todos
         SET is_completed = ?, status = ?, updated_by = ?
         WHERE id = ?`,
        [args.isCompleted ? 1 : 0, args.isCompleted ? 'COMPLETED' : 'PENDING', userId, todoId]
      );
      return getTodoItem(todoId);
    },

    async setTodoStatus(_: any, args: { todoId?: number; status?: string }, context: any) {
      const todoId = Number(args?.todoId);
      const status = String(args?.status || '').toUpperCase();
      if (!Number.isInteger(todoId) || todoId <= 0 ||
        !['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
        throwEventError('BAD_REQUEST', 'todoId and a valid status are required');
      }

      const userId = await getLoggedInUserId(context);
      const { eventId } = await getTodoEventId(todoId);
      const permission = await getCommitteePermission(eventId, userId);
      if (!permission.hasCommitteeAccess) {
        throwEventError('FORBIDDEN', 'You are not allowed to update this checklist');
      }

      await execute(
        `UPDATE todos
         SET status = ?, is_completed = ?, updated_by = ?
         WHERE id = ?`,
        [status, status === 'COMPLETED' ? 1 : 0, userId, todoId]
      );
      return getTodoItem(todoId);
    },

    async assignTodo(_: any, args: { todoId?: number; ownerUserId?: number | null }, context: any) {
      const todoId = Number(args?.todoId);
      const ownerUserId = args.ownerUserId == null ? null : Number(args.ownerUserId);
      if (!Number.isInteger(todoId) || todoId <= 0 ||
        (ownerUserId !== null && (!Number.isInteger(ownerUserId) || ownerUserId <= 0))) {
        throwEventError('BAD_REQUEST', 'todoId and a valid ownerUserId are required');
      }

      const userId = await getLoggedInUserId(context);
      const { eventId, committeeId } = await getTodoEventId(todoId);
      const permission = await getCommitteePermission(eventId, userId);
      if (!permission.canManage) {
        throwEventError('FORBIDDEN', 'Only committee admins can assign checklist items');
      }

      if (ownerUserId !== null) {
        const memberRows = await query<any[]>(
          `SELECT user_id
           FROM users_committees
           WHERE committee_id = ? AND user_id = ?
             AND committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
           LIMIT 1`,
          [committeeId, ownerUserId]
        );
        if (memberRows.length === 0) {
          throwEventError('BAD_REQUEST', 'The assignee must be a member of this committee');
        }
      }

      await execute(
        `UPDATE todos
         SET assigned_user_id = ?, assigned_by = ?, assigned_at = IF(? IS NULL, NULL, CURRENT_TIMESTAMP),
             updated_by = ?
         WHERE id = ?`,
        [ownerUserId, ownerUserId === null ? null : userId, ownerUserId, userId, todoId]
      );
      return getTodoItem(todoId);
    },

    async deleteTodo(_: any, args: { todoId?: number }, context: any) {
      const todoId = Number(args?.todoId);
      if (!Number.isInteger(todoId) || todoId <= 0) {
        throwEventError('BAD_REQUEST', 'todoId must be a positive integer');
      }

      const userId = await getLoggedInUserId(context);
      const { eventId } = await getTodoEventId(todoId);
      const permission = await getCommitteePermission(eventId, userId);
      if (!permission.canManage) {
        throwEventError('FORBIDDEN', 'Only committee admins can remove checklist items');
      }

      await execute('DELETE FROM todos WHERE id = ?', [todoId]);
      return true;
    }
  }
};
