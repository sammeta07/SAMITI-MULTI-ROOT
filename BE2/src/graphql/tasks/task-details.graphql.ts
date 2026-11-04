import { query } from '../../config/db';
import { getLoggedInUserId, throwEventError } from '../events/details/voting/event-voting-core.graphql';
import { getTodoAssignees } from '../todos/todos.graphql';
import { hasPermission, PERMISSIONS } from '../../authorization/authorization';

export const taskDetailsTypes = `
  type TaskChild {
    taskId: Int!
    parentTaskId: Int
    taskName: String!
    status: String
    ownerUserId: Int
    ownerName: String
    assignedByName: String
    createdByName: String
    createdAt: String
    ownerAssignedAt: String
    canManage: Boolean!
    canEditTask: Boolean!
    canAssignOwner: Boolean!
    canDelete: Boolean!
  }

  type TaskDetailsAssignee {
    userId: Int!
    name: String!
    email: String!
    photo: String
    committeeRole: String!
    isWinner: Boolean!
    roleIcon: String
    roleColor: String
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
    createdByName: String
    createdAt: String!
    ownerAssignedAt: String
    updatedAt: String!
    children: [TaskChild!]!
    descendants: [TaskChild!]!
    taskAssignees: [TaskDetailsAssignee!]!
    todos: [TodoItem!]!
    todoAssignees: [TodoAssignee!]!
    canManage: Boolean!
    canEditTask: Boolean!
    canAssignOwner: Boolean!
    canDeleteTask: Boolean!
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
           parent.owner_user_id AS parentOwnerUserId,
           t.owner_user_id AS ownerUserId,
           t.created_by AS createdBy,
           owner.name AS ownerName,
           creator.name AS createdByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt,
           DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt,
           e.committee_id AS committeeId,
           uc.committee_role AS committeeRole
         FROM tasks t
         INNER JOIN events e ON e.id = t.event_id
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users creator ON creator.id = t.created_by
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
      const role = String(task.committeeRole || '').toUpperCase();
      const hasCommitteeAccess = [
        'COMMITTEE_MEMBER',
        'COMMITTEE_ADMIN',
        'COMMITTEE_MASTER_ADMIN'
      ].includes(role);
      const isTaskOwner = Number(task.ownerUserId) === userId;
      const isTaskCreator = Number(task.createdBy) === userId;
      const isParentTaskOwner = Number(task.parentOwnerUserId) === userId;
      if (!hasCommitteeAccess && !isTaskOwner && !isTaskCreator && !isParentTaskOwner) {
        throwEventError('FORBIDDEN', 'You are not allowed to access this task');
      }
      const isMasterAdmin = await hasPermission(
        userId,
        PERMISSIONS.EVENT_TASK_MANAGE_ANY,
        { type: 'EVENT', id: Number(task.eventId) }
      );
      const canAssignOwner = task.parentTaskId === null
        ? Number(task.createdBy) === userId || await hasPermission(
            userId,
            PERMISSIONS.EVENT_TASK_ASSIGN_OWNER,
            { type: 'EVENT', id: Number(task.eventId) }
          )
        : isMasterAdmin || isParentTaskOwner;
      const canDeleteRootTask = await hasPermission(
        userId,
        PERMISSIONS.EVENT_TASK_DELETE,
        { type: 'EVENT', id: Number(task.eventId) }
      );
      const canAssignRootTaskOwners = await hasPermission(
        userId,
        PERMISSIONS.EVENT_TASK_ASSIGN_OWNER,
        { type: 'EVENT', id: Number(task.eventId) }
      );

      const descendantRows = await query<any[]>(
        `SELECT
           t.id AS taskId,
           t.parent_id AS parentTaskId,
           parent.owner_user_id AS parentOwnerUserId,
           t.name AS taskName,
           t.status,
           t.owner_user_id AS ownerUserId,
           t.created_by AS createdBy,
           owner.name AS ownerName,
           assignedBy.name AS assignedByName,
           creator.name AS createdByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt
         FROM tasks t
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users assignedBy ON assignedBy.id = t.owner_assigned_by
         LEFT JOIN users creator ON creator.id = t.created_by
         WHERE t.event_id = ?
         ORDER BY t.created_at ASC, t.id ASC`,
        [Number(task.eventId)]
      );
      const mapChildPermissions = (child: any) => {
        const isRootTask = child.parentTaskId === null;
        const isChildParentOwner = Number(child.parentOwnerUserId) === userId;
        return {
          canEditTask: Number(child.createdBy) === userId || isMasterAdmin,
          canManage: isRootTask
            ? Number(child.ownerUserId) === userId || isMasterAdmin
            : isChildParentOwner || isMasterAdmin,
          canAssignOwner: isRootTask
            ? canAssignRootTaskOwners || Number(child.createdBy) === userId
            : isMasterAdmin || isChildParentOwner,
          canDelete: isRootTask
            ? canDeleteRootTask || Number(child.createdBy) === userId
            : isMasterAdmin || isChildParentOwner
        };
      };
      const childrenByParentId = new Map<number, any[]>();
      for (const descendant of descendantRows) {
        const parentId = descendant.parentTaskId === null ? null : Number(descendant.parentTaskId);
        if (parentId === null) continue;
        const siblings = childrenByParentId.get(parentId) ?? [];
        siblings.push(descendant);
        childrenByParentId.set(parentId, siblings);
      }

      const descendants: any[] = [];
      const visitedDescendants = new Set<number>([taskId]);
      const pendingDescendants = [...(childrenByParentId.get(taskId) ?? [])];
      while (pendingDescendants.length > 0) {
        const descendant = pendingDescendants.shift();
        if (!descendant) continue;
        const descendantId = Number(descendant.taskId);
        if (visitedDescendants.has(descendantId)) continue;
        visitedDescendants.add(descendantId);
        descendants.push(descendant);
        pendingDescendants.push(...(childrenByParentId.get(descendantId) ?? []));
      }
      const children = childrenByParentId.get(taskId) ?? [];

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

      const taskAssignees = await query<any[]>(
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
        [Number(task.eventId), Number(task.eventId), Number(task.committeeId)]
      );

      const canManageTodos = await hasPermission(
        userId,
        PERMISSIONS.TODO_MANAGE,
        { type: 'EVENT', id: Number(task.eventId) }
      ) || isTaskOwner;
      const canCreateSubtasks = isMasterAdmin || isTaskOwner;
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
        createdByName: task.createdByName || null,
        createdAt: String(task.createdAt),
        ownerAssignedAt: task.ownerAssignedAt || null,
        updatedAt: String(task.updatedAt),
        canEditTask: isTaskCreator || isMasterAdmin,
        canAssignOwner,
        canDeleteTask: task.parentTaskId !== null
          ? isMasterAdmin || isParentTaskOwner
          : canDeleteRootTask || isTaskCreator,
        children: children.map((child) => ({
          taskId: Number(child.taskId),
          parentTaskId: Number(taskId),
          taskName: String(child.taskName || 'Untitled Task'),
          status: child.status ? String(child.status) : null,
          ownerUserId: child.ownerUserId === null ? null : Number(child.ownerUserId),
          ownerName: child.ownerName || null,
          assignedByName: child.assignedByName || null,
          createdByName: child.createdByName || null,
          createdAt: child.createdAt ? String(child.createdAt) : null,
          ownerAssignedAt: child.ownerAssignedAt || null,
          ...mapChildPermissions(child)
        })),
        descendants: descendants.map((descendant) => ({
          taskId: Number(descendant.taskId),
          parentTaskId: descendant.parentTaskId === null ? null : Number(descendant.parentTaskId),
          taskName: String(descendant.taskName || 'Untitled Task'),
          status: descendant.status ? String(descendant.status) : null,
          ownerUserId: descendant.ownerUserId === null ? null : Number(descendant.ownerUserId),
          ownerName: descendant.ownerName || null,
          assignedByName: descendant.assignedByName || null,
          createdByName: descendant.createdByName || null,
          createdAt: descendant.createdAt ? String(descendant.createdAt) : null,
          ownerAssignedAt: descendant.ownerAssignedAt || null,
          ...mapChildPermissions(descendant)
        })),
        taskAssignees: taskAssignees.map((assignee) => ({
          userId: Number(assignee.userId),
          name: String(assignee.name || ''),
          email: String(assignee.email || ''),
          photo: assignee.photo || null,
          committeeRole: String(assignee.committeeRole || 'COMMITTEE_MEMBER'),
          isWinner: Number(assignee.isWinner) === 1,
          roleIcon: assignee.roleIcon || null,
          roleColor: assignee.roleColor || null
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
        canManage: task.parentTaskId !== null
          ? isMasterAdmin || isParentTaskOwner
          : isMasterAdmin || isTaskOwner,
        canCreateTasks: canCreateSubtasks,
        canManageTodos,
        canToggleTodos: canManageTodos
      };
    }
  }
};
