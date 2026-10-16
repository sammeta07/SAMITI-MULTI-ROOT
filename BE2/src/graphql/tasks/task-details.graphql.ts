import { query } from '../../config/db';
import { getLoggedInUserId, throwEventError } from '../events/details/voting/event-voting-core.graphql';
import { getTodoAssignees } from '../todos/todos.graphql';

export const taskDetailsTypes = `
  type TaskChild {
    taskId: Int!
    taskName: String!
    status: String
  }

  type TaskDetails {
    taskId: Int!
    taskName: String!
    status: String
    eventId: Int!
    eventName: String!
    parentTaskId: Int
    parentTaskName: String
    ownerUserId: Int
    ownerName: String
    createdAt: String!
    children: [TaskChild!]!
    todos: [TodoItem!]!
    todoAssignees: [TodoAssignee!]!
    canCreateTasks: Boolean!
    canManageTodos: Boolean!
    canToggleTodos: Boolean!
  }
`;

export const taskDetailsQueryFields = `
  taskDetails(id: Int!): TaskDetails!
`;

export const taskDetailsResolvers = {
  Query: {
    async taskDetails(_: any, args: { id: number }, context: any) {
      const taskId = Number(args?.id);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throwEventError('BAD_REQUEST', 'id must be a positive integer');
      }

      const userId = await getLoggedInUserId(context);
      const rows = await query<any[]>(
        `SELECT
           t.id AS taskId,
           t.name AS taskName,
           t.status,
           t.event_id AS eventId,
           e.name AS eventName,
           t.parent_id AS parentTaskId,
           parent.name AS parentTaskName,
           t.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           e.committee_id AS committeeId,
           uc.committee_role AS committeeRole
         FROM tasks t
         INNER JOIN events e ON e.id = t.event_id
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users_committees uc
           ON uc.committee_id = e.committee_id AND uc.user_id = ?
         WHERE t.id = ?
         LIMIT 1`,
        [userId, taskId]
      );

      if (rows.length === 0) {
        throwEventError('NOT_FOUND', 'Task not found');
      }

      const task = rows[0];
      const role = String(task.committeeRole || '');
      const hasCommitteeAccess = [
        'COMMITTEE_MEMBER',
        'COMMITTEE_ADMIN',
        'COMMITTEE_MASTER_ADMIN'
      ].includes(role);
      if (!hasCommitteeAccess) {
        throwEventError('FORBIDDEN', 'You are not allowed to access this task');
      }

      const children = await query<any[]>(
        `SELECT id AS taskId, name AS taskName, status
         FROM tasks
         WHERE parent_id = ? AND event_id = ?
         ORDER BY created_at ASC, id ASC`,
        [taskId, Number(task.eventId)]
      );

      const todos = await query<any[]>(
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
         WHERE todo.task_id = ?
         ORDER BY todo.created_at ASC, todo.id ASC`,
        [taskId]
      );

      const canManageTodos = role === 'COMMITTEE_ADMIN' || role === 'COMMITTEE_MASTER_ADMIN';
      return {
        taskId: Number(task.taskId),
        taskName: String(task.taskName || 'Untitled Task'),
        status: task.status ? String(task.status) : null,
        eventId: Number(task.eventId),
        eventName: String(task.eventName || ''),
        parentTaskId: task.parentTaskId === null ? null : Number(task.parentTaskId),
        parentTaskName: task.parentTaskName || null,
        ownerUserId: task.ownerUserId === null ? null : Number(task.ownerUserId),
        ownerName: task.ownerName || null,
        createdAt: String(task.createdAt),
        children: children.map((child) => ({
          taskId: Number(child.taskId),
          taskName: String(child.taskName || 'Untitled Task'),
          status: child.status ? String(child.status) : null
        })),
        todos: todos.map((todo) => ({
          id: Number(todo.id),
          title: String(todo.title),
          status: String(todo.status),
          isCompleted: Boolean(Number(todo.isCompleted)),
          assignedUserId: todo.assignedUserId === null ? null : Number(todo.assignedUserId),
          assignedUserName: todo.assignedUserName || null,
          createdAt: String(todo.createdAt)
        })),
        todoAssignees: await getTodoAssignees(Number(task.committeeId)),
        canCreateTasks: canManageTodos,
        canManageTodos,
        canToggleTodos: hasCommitteeAccess
      };
    }
  }
};
