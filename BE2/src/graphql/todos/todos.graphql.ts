import { execute, query } from '../../config/db';
import { getLoggedInUserId, throwEventError } from '../events/details/voting/event-voting-core.graphql';
import { hasPermission, PERMISSIONS } from '../../authorization/authorization';

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
  updateTodo(todoId: Int!, title: String!, isCompleted: Boolean!): TodoItem!
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

async function getParentPermission(parentType: ParentType, parentId: number, userId: number) {
  const table = parentType === 'TASK' ? 'tasks' : 'programs';
  const rows = await query<any[]>(
    `SELECT entity.event_id AS eventId,
            event.committee_id AS committeeId,
            entity.owner_user_id AS ownerUserId,
            entity.created_by AS createdBy,
            uc.committee_role AS committeeRole
     FROM ${table} entity
     INNER JOIN events event ON event.id = entity.event_id
     LEFT JOIN users_committees uc
       ON uc.committee_id = event.committee_id AND uc.user_id = ?
     WHERE entity.id = ?
     LIMIT 1`,
    [userId, parentId]
  );

  if (rows.length === 0) {
    throwEventError('NOT_FOUND', `${parentType.toLowerCase()} not found`);
  }

  const row = rows[0];
  const role = String(row.committeeRole || '').toUpperCase();
  const hasCommitteeAccess = [
    'COMMITTEE_MEMBER',
    'COMMITTEE_ADMIN',
    'COMMITTEE_MASTER_ADMIN'
  ].includes(role);

  const eventId = Number(row.eventId);
  return {
    eventId,
    committeeId: Number(row.committeeId),
    hasCommitteeAccess,
    canManage: await hasPermission(
      userId,
      PERMISSIONS.TODO_MANAGE,
      { type: 'EVENT', id: eventId }
    ) ||
      Number(row.ownerUserId) === userId ||
      (parentType === 'TASK' && Number(row.createdBy) === userId)
  };
}

async function getTodoParent(todoId: number): Promise<{ parentType: ParentType; parentId: number }> {
  const rows = await query<any[]>(
    `SELECT todo.task_id AS taskId, todo.program_id AS programId
     FROM todos todo
     WHERE todo.id = ?
     LIMIT 1`,
    [todoId]
  );

  if (rows.length === 0) {
    throwEventError('NOT_FOUND', 'Todo not found');
  }

  const parentType: ParentType = rows[0].taskId !== null ? 'TASK' : 'PROGRAM';
  return {
    parentType,
    parentId: Number(parentType === 'TASK' ? rows[0].taskId : rows[0].programId)
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
      const permission = await getParentPermission(parentType, parentId, userId);
      if (!permission.canManage) {
        throwEventError('FORBIDDEN', 'Only the task or program owner or a master admin can manage checklist items');
      }

      const parentColumn = parentType === 'TASK' ? 'task_id' : 'program_id';
      const result = await execute(
        `INSERT INTO todos (${parentColumn}, title, created_by, updated_by)
         VALUES (?, ?, ?, ?)`,
        [parentId, title, userId, userId]
      );
      return getTodoItem(result.insertId);
    },

    async updateTodo(_: any, args: { todoId?: number; title?: string; isCompleted?: boolean }, context: any) {
      const todoId = Number(args?.todoId);
      const title = String(args?.title || '').trim();
      if (!Number.isInteger(todoId) || todoId <= 0 || !title || title.length > 255 || typeof args?.isCompleted !== 'boolean') {
        throwEventError('BAD_REQUEST', 'todoId, a title containing 1 to 255 characters, and isCompleted are required');
      }

      const userId = await getLoggedInUserId(context);
      const parent = await getTodoParent(todoId);
      const permission = await getParentPermission(parent.parentType, parent.parentId, userId);
      if (!permission.canManage) {
        throwEventError('FORBIDDEN', 'Only the task or program owner or a master admin can manage checklist items');
      }

      await execute(
        `UPDATE todos
         SET title = ?,
             status = CASE WHEN is_completed <> ? THEN ? ELSE status END,
             is_completed = ?,
             updated_by = ?
         WHERE id = ?`,
        [title, args.isCompleted ? 1 : 0, args.isCompleted ? 'COMPLETED' : 'PENDING', args.isCompleted ? 1 : 0, userId, todoId]
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
      const parent = await getTodoParent(todoId);
      const permission = await getParentPermission(parent.parentType, parent.parentId, userId);
      if (!permission.canManage) {
        throwEventError('FORBIDDEN', 'Only the task or program owner or a master admin can manage checklist items');
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
      const parent = await getTodoParent(todoId);
      const permission = await getParentPermission(parent.parentType, parent.parentId, userId);
      if (!permission.canManage) {
        throwEventError('FORBIDDEN', 'Only the task or program owner or a master admin can manage checklist items');
      }

      if (ownerUserId !== null) {
        const memberRows = await query<any[]>(
          `SELECT user_id
           FROM users_committees
           WHERE committee_id = ? AND user_id = ?
             AND committee_role IN ('COMMITTEE_MEMBER', 'COMMITTEE_ADMIN', 'COMMITTEE_MASTER_ADMIN')
           LIMIT 1`,
          [permission.committeeId, ownerUserId]
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
      const parent = await getTodoParent(todoId);
      const permission = await getParentPermission(parent.parentType, parent.parentId, userId);
      if (!permission.canManage) {
        throwEventError('FORBIDDEN', 'Only the task or program owner or a master admin can manage checklist items');
      }

      await execute('DELETE FROM todos WHERE id = ?', [todoId]);
      return true;
    }
  }
};
