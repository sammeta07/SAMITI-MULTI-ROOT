import { execute, getConnection, query } from '../../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { throwEventError, getLoggedInUserId } from '../voting/event-voting-core.graphql';
import { hasPermission, PERMISSIONS } from '../../../../authorization/authorization';

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
    budgetAmount: String!
    budgetRequestId: Int
    requestedBudgetAmount: String
    budgetRequestStatus: String
    budgetRequestedByName: String
    canReviewBudgetRequest: Boolean!
    canRequestBudgetIncrease: Boolean!
    status: String
    ownerUserId: Int
    ownerName: String
    assignedByName: String
    createdByName: String
    createdAt: String!
    ownerAssignedAt: String
    updatedAt: String!
    canManage: Boolean!
    canEditTask: Boolean!
    canAssignOwner: Boolean!
    canDelete: Boolean!
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

  type UpdatedEventTaskBudget {
    budgetAmount: String!
    status: String!
    updatedAt: String!
    requestId: Int
    requestStatus: String
    requestedBudgetAmount: String
  }

  input CreateEventTaskInput {
    eventId: Int!
    taskName: String!
    budgetAmount: String = "0.00"
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
    budgetAmount: String!
    budgetRequestId: Int
    requestedBudgetAmount: String
    budgetRequestStatus: String
    budgetRequestedByName: String
    canReviewBudgetRequest: Boolean!
    canRequestBudgetIncrease: Boolean!
    status: EventTaskStatus!
    ownerUserId: Int
    ownerName: String
    assignedByName: String
    createdByName: String
    createdAt: String!
    ownerAssignedAt: String
    updatedAt: String!
    canManage: Boolean!
    canEditTask: Boolean!
    canAssignOwner: Boolean!
    canDelete: Boolean!
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
  updateEventTaskBudget(taskId: Int!, budgetAmount: String!, status: String): UpdatedEventTaskBudget!
  requestTaskBudgetIncrease(taskId: Int!, amount: String!): UpdatedEventTaskBudget!
  reviewTaskBudgetRequest(requestId: Int!, decision: String!): UpdatedEventTaskBudget!
  deleteEventTask(taskId: Int!): Boolean!
`;

async function getTaskForAdminMutation(taskId: number, userId: number): Promise<any> {
  const taskRows = await query<any[]>(
    `SELECT t.id, t.event_id AS eventId,
            t.owner_user_id AS ownerUserId, t.created_by AS createdBy,
            t.parent_id AS parentTaskId, parent.owner_user_id AS parentOwnerUserId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     LEFT JOIN tasks parent ON parent.id = t.parent_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (taskRows.length === 0) {
    throwEventError('NOT_FOUND', 'Task not found');
  }

  const task = taskRows[0];
  const isMasterAdmin = await hasPermission(
    userId,
    PERMISSIONS.EVENT_TASK_MANAGE_ANY,
    { type: 'EVENT', id: Number(task.eventId) }
  );
  if (!isMasterAdmin && Number(task.ownerUserId) !== userId) {
    throwEventError('FORBIDDEN', 'Only the parent task owner or a master admin can add subtasks');
  }
  return task;
}

async function canCreateEventTask(eventId: number, userId: number): Promise<boolean> {
  return hasPermission(userId, PERMISSIONS.EVENT_TASK_CREATE, { type: 'EVENT', id: eventId });
}

async function assertCanAssignTask(taskId: number, userId: number): Promise<void> {
  const rows = await query<any[]>(
    `SELECT t.event_id AS eventId, t.owner_user_id AS ownerUserId, t.parent_id AS parentTaskId,
            t.created_by AS createdBy, parent.owner_user_id AS parentOwnerUserId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     LEFT JOIN tasks parent ON parent.id = t.parent_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (rows.length === 0) throwEventError('NOT_FOUND', 'Task not found');
  const task = rows[0];
  const canManageAssignment = task.parentTaskId === null
    ? Number(task.createdBy) === userId ||
      await hasPermission(userId, PERMISSIONS.EVENT_TASK_ASSIGN_OWNER, { type: 'EVENT', id: Number(task.eventId) })
    : await hasPermission(userId, PERMISSIONS.EVENT_TASK_MANAGE_ANY, { type: 'EVENT', id: Number(task.eventId) }) ||
      Number(task.parentOwnerUserId) === userId;
  if (!canManageAssignment) {
    throwEventError(
      'FORBIDDEN',
      task.parentTaskId === null
        ? 'Only the task creator or an authorized event role can assign root tasks'
        : 'Only the parent task owner or a master admin can assign subtasks'
    );
  }
}

async function getTaskAssignmentPermission(taskId: number, userId: number): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT t.event_id AS eventId,
            t.owner_user_id AS ownerUserId, t.parent_id AS parentTaskId,
            t.created_by AS createdBy, parent.owner_user_id AS parentOwnerUserId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     LEFT JOIN tasks parent ON parent.id = t.parent_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (rows.length === 0) throwEventError('NOT_FOUND', 'Task not found');
  const task = rows[0];
  if (task.parentTaskId === null) {
    return Number(task.createdBy) === userId ||
      hasPermission(userId, PERMISSIONS.EVENT_TASK_ASSIGN_OWNER, { type: 'EVENT', id: Number(task.eventId) });
  }
  const canManageAny = await hasPermission(
    userId,
    PERMISSIONS.EVENT_TASK_MANAGE_ANY,
    { type: 'EVENT', id: Number(task.eventId) }
  );
  return canManageAny ||
    Number(task.parentOwnerUserId) === userId;
}

async function assertCanEditOrDeleteTask(taskId: number, userId: number): Promise<void> {
  const rows = await query<any[]>(
    `SELECT t.created_by AS createdBy, t.event_id AS eventId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (rows.length === 0) throwEventError('NOT_FOUND', 'Task not found');
  const task = rows[0];
  if (Number(task.createdBy) !== userId &&
    !await hasPermission(userId, PERMISSIONS.EVENT_TASK_MANAGE_ANY, { type: 'EVENT', id: Number(task.eventId) })) {
    throwEventError('FORBIDDEN', 'Only the task creator or a master admin can edit this task title');
  }
}

async function getTaskDeletionPermission(taskId: number, userId: number): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT t.parent_id AS parentTaskId, t.created_by AS createdBy,
            t.event_id AS eventId, parent.owner_user_id AS parentOwnerUserId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     LEFT JOIN tasks parent ON parent.id = t.parent_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (rows.length === 0) throwEventError('NOT_FOUND', 'Task not found');
  const task = rows[0];
  const isMasterAdmin = await hasPermission(
    userId,
    PERMISSIONS.EVENT_TASK_MANAGE_ANY,
    { type: 'EVENT', id: Number(task.eventId) }
  );
  return isMasterAdmin ||
    Number(task.createdBy) === userId ||
    (task.parentTaskId !== null && Number(task.parentOwnerUserId) === userId);
}

async function assertCanDeleteTask(taskId: number, userId: number): Promise<void> {
  if (!await getTaskDeletionPermission(taskId, userId)) {
    throwEventError(
      'FORBIDDEN',
      'Only the task creator, the direct parent task owner, or a master admin can delete this task'
    );
  }
}

async function getTaskManagementPermission(taskId: number, userId: number): Promise<boolean> {
  const taskRows = await query<any[]>(
    `SELECT t.owner_user_id AS ownerUserId, t.parent_id AS parentTaskId,
            parent.owner_user_id AS parentOwnerUserId, t.event_id AS eventId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     LEFT JOIN tasks parent ON parent.id = t.parent_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (taskRows.length === 0) {
    throwEventError('NOT_FOUND', 'Task not found');
  }
  const task = taskRows[0];
  return Number(task.ownerUserId) === userId ||
    hasPermission(userId, PERMISSIONS.EVENT_TASK_MANAGE_ANY, { type: 'EVENT', id: Number(task.eventId) });
}

async function getTaskEditPermission(taskId: number, userId: number): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT t.created_by AS createdBy, t.event_id AS eventId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (rows.length === 0) throwEventError('NOT_FOUND', 'Task not found');
  const task = rows[0];
  return Number(task.createdBy) === userId ||
    hasPermission(userId, PERMISSIONS.EVENT_TASK_MANAGE_ANY, { type: 'EVENT', id: Number(task.eventId) });
}

function validateTaskBudgetAmount(value: unknown): string {
  const amount = String(value ?? '0.00').trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) {
    throwEventError('BAD_REQUEST', 'budgetAmount must be a non-negative amount with up to 2 decimal places');
  }
  return amount;
}

function amountCents(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const MAX_TASK_BUDGET_CENTS = 999_999_999_999;

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
      const canAssignRootTasks = await canCreateEventTask(eventId, loggedInUserId);
      const canAssignRootTaskOwners = await hasPermission(
        loggedInUserId,
        PERMISSIONS.EVENT_TASK_ASSIGN_OWNER,
        { type: 'EVENT', id: eventId }
      );
      const canUpdateRootTasks = await hasPermission(
        loggedInUserId,
        PERMISSIONS.EVENT_TASK_UPDATE,
        { type: 'EVENT', id: eventId }
      );
      const canManageAnyTasks = await hasPermission(
        loggedInUserId,
        PERMISSIONS.EVENT_TASK_MANAGE_ANY,
        { type: 'EVENT', id: eventId }
      );
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

      const ownedTaskRows = hasCommitteeAccess ? [] : await query<any[]>(
        `SELECT id
         FROM tasks
         WHERE event_id = ? AND (owner_user_id = ? OR created_by = ?)
         LIMIT 1`,
        [eventId, loggedInUserId, loggedInUserId]
      );
      if (!hasCommitteeAccess && !canAssignRootTasks &&
        !canManageAnyTasks && !canUpdateRootTasks && ownedTaskRows.length === 0) {
        throwEventError('FORBIDDEN', 'You are not allowed to access this event');
      }

      const taskRows = await query<Array<RowDataPacket & {
        taskId: number;
        eventId: number;
        parentTaskId: number | null;
        parentTaskName: string | null;
        taskName: string;
        budgetAmount: string;
        budgetRequestId: number | null;
        requestedBudgetAmount: string | null;
        budgetRequestStatus: string | null;
        budgetRequestedByName: string | null;
        status: string | null;
        createdBy: number | null;
        parentOwnerUserId: number | null;
        ownerUserId: number | null;
        ownerName: string | null;
        assignedByName: string | null;
        createdByName: string | null;
        createdAt: string;
        ownerAssignedAt: string | null;
        updatedAt: string;
      }>>(
        `SELECT
           t.id AS taskId,
           t.event_id AS eventId,
           t.parent_id AS parentTaskId,
           t.created_by AS createdBy,
           parent.owner_user_id AS parentOwnerUserId,
           parent.name AS parentTaskName,
           COALESCE(NULLIF(TRIM(t.name), ''), 'Untitled Task') AS taskName,
           CAST(t.budget_amount AS CHAR) AS budgetAmount,
           budgetRequest.id AS budgetRequestId,
           CAST(GREATEST(0, budgetRequest.requested_amount - t.budget_amount) AS CHAR) AS requestedBudgetAmount,
           budgetRequest.status AS budgetRequestStatus,
           budgetRequester.name AS budgetRequestedByName,
           t.status,
           t.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           assignedBy.name AS assignedByName,
           creator.name AS createdByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt,
           DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
         FROM tasks t
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN task_budget_requests budgetRequest
           ON budgetRequest.task_id = t.id AND budgetRequest.status = 'PENDING'
         LEFT JOIN users budgetRequester ON budgetRequester.id = budgetRequest.requested_by
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users assignedBy ON assignedBy.id = t.owner_assigned_by
         LEFT JOIN users creator ON creator.id = t.created_by
         WHERE t.event_id = ?
         ORDER BY t.created_at ASC, t.id ASC`,
        [eventId]
      );

      return {
        entries: taskRows.map((taskRow) => {
          const isRootTask = taskRow.parentTaskId === null;
          return {
          id: Number(taskRow.taskId),
          taskId: Number(taskRow.taskId),
          eventId: Number(taskRow.eventId),
          parentTaskId: taskRow.parentTaskId === null ? null : Number(taskRow.parentTaskId),
          parentTaskName: taskRow.parentTaskName || null,
          taskName: String(taskRow.taskName || 'Untitled Task'),
          budgetAmount: String(taskRow.budgetAmount),
          budgetRequestId: taskRow.budgetRequestId === null ? null : Number(taskRow.budgetRequestId),
          requestedBudgetAmount: taskRow.requestedBudgetAmount === null ? null : String(taskRow.requestedBudgetAmount),
          budgetRequestStatus: taskRow.budgetRequestStatus || null,
          budgetRequestedByName: taskRow.budgetRequestedByName || null,
          canReviewBudgetRequest: Boolean(taskRow.budgetRequestId) &&
            (Number(taskRow.createdBy) === loggedInUserId || canManageAnyTasks),
          canRequestBudgetIncrease: Number(taskRow.ownerUserId) === loggedInUserId &&
            Number(taskRow.createdBy) !== loggedInUserId &&
            !canManageAnyTasks,
          status: taskRow.status ? String(taskRow.status) : null,
          ownerUserId: taskRow.ownerUserId === null ? null : Number(taskRow.ownerUserId),
          ownerName: taskRow.ownerName || null,
          assignedByName: taskRow.assignedByName || null,
          createdByName: taskRow.createdByName || null,
          createdAt: String(taskRow.createdAt),
          ownerAssignedAt: taskRow.ownerAssignedAt || null,
          updatedAt: String(taskRow.updatedAt),
          canManage: Number(taskRow.ownerUserId) === loggedInUserId || canManageAnyTasks,
          canEditTask: Number(taskRow.createdBy) === loggedInUserId || canManageAnyTasks,
          canAssignOwner: isRootTask
            ? canAssignRootTaskOwners || Number(taskRow.createdBy) === loggedInUserId
            : canManageAnyTasks || Number(taskRow.parentOwnerUserId) === loggedInUserId,
          canDelete: canManageAnyTasks ||
            Number(taskRow.createdBy) === loggedInUserId ||
            (!isRootTask && Number(taskRow.parentOwnerUserId) === loggedInUserId)
          };
        }),
        canCreateTasks: canAssignRootTasks,
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
      await assertCanEditOrDeleteTask(taskId, userId);
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
      await assertCanDeleteTask(taskId, userId);
      const taskRows = await query<any[]>(
        `SELECT status
         FROM tasks
         WHERE id = ?
         LIMIT 1`,
        [taskId]
      );
      if (taskRows.length === 0) {
        throwEventError('NOT_FOUND', 'Task not found');
      }
      if (String(taskRows[0]?.status || '').toUpperCase() !== 'NEW') {
        throwEventError('BAD_REQUEST', 'Only NEW tasks can be deleted');
      }

      const nonNewDescendantRows = await query<any[]>(
        `WITH RECURSIVE task_descendants (id, status) AS (
           SELECT id, status
           FROM tasks
           WHERE parent_id = ?
           UNION ALL
           SELECT child.id, child.status
           FROM tasks child
           INNER JOIN task_descendants parent ON child.parent_id = parent.id
         )
         SELECT id
         FROM task_descendants
         WHERE UPPER(COALESCE(status, '')) <> 'NEW'
         LIMIT 1`,
        [taskId]
      );
      if (nonNewDescendantRows.length > 0) {
        throwEventError('BAD_REQUEST', 'Cannot delete this task because a descendant is not NEW');
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
      const taskCommitteeRows = await query<any[]>(
        `SELECT e.committee_id AS committeeId
         FROM events e
         WHERE e.id = ? LIMIT 1`,
        [Number(taskRows[0].eventId)]
      );
      const isMasterAdmin = taskCommitteeRows.length > 0 && await hasPermission(
        loggedInUserId,
        PERMISSIONS.EVENT_TASK_MANAGE_ANY,
        { type: 'EVENT', id: Number(taskRows[0].eventId) }
      );
      if (!isMasterAdmin && (taskRows[0].ownerUserId === null || Number(taskRows[0].ownerUserId) !== loggedInUserId)) {
        throwEventError('FORBIDDEN', 'Only the task owner or a master admin can update its status');
      }

      const updateResult = await execute(
        `UPDATE tasks
         SET status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND (owner_user_id = ? OR ? = 1)`,
        [status, loggedInUserId, taskId, loggedInUserId, isMasterAdmin ? 1 : 0]
      );
      if (updateResult.affectedRows !== 1) {
        throwEventError('FORBIDDEN', 'Only the task owner or a master admin can update its status');
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
           assignedBy.name AS assignedByName,
           creator.name AS createdByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt,
           DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
         FROM tasks t
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users assignedBy ON assignedBy.id = t.owner_assigned_by
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
        assignedByName: updatedTask.assignedByName || null,
        createdByName: updatedTask.createdByName || null,
        createdAt: String(updatedTask.createdAt),
        ownerAssignedAt: updatedTask.ownerAssignedAt || null,
        updatedAt: String(updatedTask.updatedAt),
        canManage: await getTaskManagementPermission(taskId, loggedInUserId),
        canEditTask: await getTaskEditPermission(taskId, loggedInUserId),
        canAssignOwner: await getTaskAssignmentPermission(taskId, loggedInUserId),
        canDelete: await getTaskDeletionPermission(taskId, loggedInUserId)
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
        `SELECT t.event_id AS eventId, e.committee_id AS committeeId,
                t.owner_user_id AS ownerUserId
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
      await assertCanAssignTask(taskId, loggedInUserId);

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
           assignedBy.name AS assignedByName,
           creator.name AS createdByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt,
           DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
         FROM tasks t
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users assignedBy ON assignedBy.id = t.owner_assigned_by
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
        assignedByName: updated.assignedByName || null,
        createdByName: updated.createdByName || null,
        createdAt: String(updated.createdAt),
        ownerAssignedAt: updated.ownerAssignedAt || null,
        updatedAt: String(updated.updatedAt),
        canManage: await getTaskManagementPermission(taskId, loggedInUserId),
        canEditTask: await getTaskEditPermission(taskId, loggedInUserId),
        canAssignOwner: await getTaskAssignmentPermission(taskId, loggedInUserId),
        canDelete: await getTaskDeletionPermission(taskId, loggedInUserId)
      };
    },
    async createEventTask(_: any, args: { input?: { eventId?: number; taskName?: string; budgetAmount?: string | null; parentTaskId?: number | null; status?: string | null } }, context: any) {
      const eventId = Number(args?.input?.eventId);
      const taskName = String(args?.input?.taskName || '').trim();
      const budgetAmount = validateTaskBudgetAmount(args?.input?.budgetAmount);
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
      let createdTaskId: number;

      if (parentTaskId !== null) {
        const parentRows = await query<any[]>(
          `SELECT id, owner_user_id AS ownerUserId, budget_amount AS budgetAmount
           FROM tasks
           WHERE id = ? AND event_id = ?
           LIMIT 1`,
          [parentTaskId, eventId]
        );
        if (parentRows.length === 0) {
          throwEventError('BAD_REQUEST', 'parentTaskId must belong to the selected event');
        }
        await getTaskForAdminMutation(parentTaskId, loggedInUserId);
        const connection = await getConnection();
        try {
          await connection.beginTransaction();
          const [lockedParentRows] = await connection.query<any[]>(
            `SELECT id, budget_amount AS budgetAmount
             FROM tasks WHERE id = ? FOR UPDATE`,
            [parentTaskId]
          );
          const lockedParent = lockedParentRows[0];
          if (!lockedParent) throwEventError('NOT_FOUND', 'Parent task not found');
          const [allocationRows] = await connection.query<any[]>(
            `SELECT COALESCE(SUM(budget_amount), 0) AS allocated
            FROM tasks WHERE parent_id = ?`,
            [parentTaskId]
          );
          const remainingCents = Math.round(Number(lockedParent.budgetAmount) * 100) -
            Math.round(Number(allocationRows[0].allocated) * 100);
          if (Math.round(Number(budgetAmount) * 100) > remainingCents) {
            throwEventError('BAD_REQUEST', 'Subtask budget exceeds the parent task remaining budget');
          }
          const [insertResult] = await connection.execute<any>(
            `INSERT INTO tasks (
               event_id, parent_id, name, budget_amount, owner_user_id, status,
               created_by, updated_by, owner_assigned_by, owner_assigned_at
             )
             VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL)`,
            [eventId, parentTaskId, taskName, budgetAmount, status, loggedInUserId, loggedInUserId]
          );
          await connection.commit();
          createdTaskId = Number(insertResult.insertId);
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      } else {
        const canCreateTopLevel = await canCreateEventTask(eventId, loggedInUserId);
        if (!canCreateTopLevel) {
          throwEventError('FORBIDDEN', 'Only a master admin, Adhyaksha, or Upadhyaksha can create event-level tasks');
        }
        const result = await execute(
          `INSERT INTO tasks (
             event_id, parent_id, name, budget_amount, owner_user_id, status,
             created_by, updated_by, owner_assigned_by, owner_assigned_at
           )
           VALUES (?, NULL, ?, ?, NULL, ?, ?, ?, NULL, NULL)`,
          [
            eventId,
            taskName,
            budgetAmount,
            status,
            loggedInUserId,
            loggedInUserId
          ]
        );
        createdTaskId = Number(result.insertId);
      }

      const createdRows = await query<any[]>(
        `SELECT
           t.id AS taskId,
           t.event_id AS eventId,
           t.parent_id AS parentTaskId,
           parent.name AS parentTaskName,
           COALESCE(NULLIF(TRIM(t.name), ''), 'Untitled Task') AS taskName,
           CAST(t.budget_amount AS CHAR) AS budgetAmount,
           t.status,
           t.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           assignedBy.name AS assignedByName,
           creator.name AS createdByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt,
           DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
         FROM tasks t
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users assignedBy ON assignedBy.id = t.owner_assigned_by
         LEFT JOIN users creator ON creator.id = t.created_by
         WHERE t.id = ?
         LIMIT 1`,
        [createdTaskId]
      );
      const task = createdRows[0];
      return {
        id: Number(task.taskId),
        taskId: Number(task.taskId),
        eventId: Number(task.eventId),
        parentTaskId: task.parentTaskId === null ? null : Number(task.parentTaskId),
        parentTaskName: task.parentTaskName || null,
        taskName: String(task.taskName),
        budgetAmount: String(task.budgetAmount),
        budgetRequestId: null,
        requestedBudgetAmount: null,
        budgetRequestStatus: null,
        budgetRequestedByName: null,
        canReviewBudgetRequest: false,
        canRequestBudgetIncrease: false,
        status: String(task.status),
        ownerUserId: task.ownerUserId === null ? null : Number(task.ownerUserId),
        ownerName: task.ownerName || null,
        assignedByName: task.assignedByName || null,
        createdByName: task.createdByName || null,
        createdAt: String(task.createdAt),
        ownerAssignedAt: task.ownerAssignedAt || null,
        updatedAt: String(task.updatedAt),
        canManage: await getTaskManagementPermission(Number(task.taskId), loggedInUserId),
        canEditTask: await getTaskEditPermission(Number(task.taskId), loggedInUserId),
        canAssignOwner: await getTaskAssignmentPermission(Number(task.taskId), loggedInUserId),
        canDelete: await getTaskDeletionPermission(Number(task.taskId), loggedInUserId)
      };
    },
    async requestTaskBudgetIncrease(_: any, args: { taskId: number; amount: string }, context: any) {
      const taskId = Number(args?.taskId);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
      }
      const amount = validateTaskBudgetAmount(args?.amount);
      if (amountCents(amount) <= 0) {
        throwEventError('BAD_REQUEST', 'Budget increase amount must be greater than zero');
      }

      const userId = await getLoggedInUserId(context);
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [taskRows] = await connection.query<any[]>(
          `SELECT t.id, t.created_by AS createdBy, t.owner_user_id AS ownerUserId,
                  t.budget_amount AS budgetAmount, t.status, t.event_id AS eventId,
                  DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
           FROM tasks t WHERE t.id = ? FOR UPDATE`,
          [taskId]
        );
        const task = taskRows[0];
        if (!task) throwEventError('NOT_FOUND', 'Task not found');
        const isMasterAdmin = await hasPermission(
          userId,
          PERMISSIONS.EVENT_TASK_MANAGE_ANY,
          { type: 'EVENT', id: Number(task.eventId) }
        );
        if (Number(task.ownerUserId) !== userId || Number(task.createdBy) === userId || isMasterAdmin) {
          throwEventError('FORBIDDEN', 'Only the task owner can request an increase to this task budget');
        }
        const targetBudgetCents = amountCents(task.budgetAmount) + amountCents(amount);
        if (targetBudgetCents > MAX_TASK_BUDGET_CENTS) {
          throwEventError('BAD_REQUEST', 'The requested increase exceeds the maximum task budget');
        }
        const targetBudget = (targetBudgetCents / 100).toFixed(2);

        const [pendingRows] = await connection.query<any[]>(
          `SELECT id FROM task_budget_requests
           WHERE task_id = ? AND status = 'PENDING'
           LIMIT 1 FOR UPDATE`,
          [taskId]
        );
        if (pendingRows.length > 0) {
          throwEventError('CONFLICT', 'A budget increase request is already pending approval');
        }
        await connection.execute(
          `INSERT INTO task_budget_requests (task_id, requested_amount, requested_by)
           VALUES (?, ?, ?)`,
          [taskId, targetBudget, userId]
        );
        const [requestRows] = await connection.query<any[]>(
          `SELECT id, CAST(requested_amount AS CHAR) AS requestedAmount
           FROM task_budget_requests
           WHERE task_id = ? AND status = 'PENDING'
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [taskId]
        );
        const request = requestRows[0];
        await connection.commit();
        return {
          budgetAmount: String(task.budgetAmount),
          status: String(task.status),
          updatedAt: String(task.updatedAt),
          requestId: Number(request.id),
          requestStatus: 'PENDING',
          requestedBudgetAmount: amount
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async updateEventTaskBudget(_: any, args: { taskId: number; budgetAmount: string; status?: string | null }, context: any) {
      const taskId = Number(args?.taskId);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
      }

      const budgetAmount = validateTaskBudgetAmount(args?.budgetAmount);
      const status = args.status == null ? null : String(args.status).trim().toUpperCase();
      if (status !== null && !['NEW', 'IN_PROGRESS', 'COMPLETED', 'HOLD', 'WONT_FIX'].includes(status)) {
        throwEventError('BAD_REQUEST', 'status must be NEW, IN_PROGRESS, COMPLETED, HOLD, or WONT_FIX');
      }
      const loggedInUserId = await getLoggedInUserId(context);
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [taskRows] = await connection.query<any[]>(
          `SELECT t.id, t.parent_id AS parentTaskId, t.created_by AS createdBy,
                  t.owner_user_id AS ownerUserId, t.budget_amount AS budgetAmount,
                  t.event_id AS eventId
           FROM tasks t WHERE t.id = ? FOR UPDATE`,
          [taskId]
        );
        const task = taskRows[0];
        if (!task) throwEventError('NOT_FOUND', 'Task not found');

        const isMasterAdmin = await hasPermission(
          loggedInUserId,
          PERMISSIONS.EVENT_TASK_MANAGE_ANY,
          { type: 'EVENT', id: Number(task.eventId) }
        );
        const isCreator = Number(task.createdBy) === loggedInUserId;
        const isTaskOwner = task.ownerUserId !== null && Number(task.ownerUserId) === loggedInUserId;
        if (!isCreator && !isTaskOwner && !isMasterAdmin) {
          throwEventError('FORBIDDEN', 'Only the task creator, task owner, or a master admin can edit this budget');
        }
        if (status !== null && !isTaskOwner && !isMasterAdmin) {
          throwEventError('FORBIDDEN', 'Only the task owner or a master admin can update its status');
        }

        const currentBudgetCents = amountCents(task.budgetAmount);
        const requestedBudgetCents = amountCents(budgetAmount);
        const budgetChanged = requestedBudgetCents !== currentBudgetCents;
        if (isTaskOwner && !isCreator && !isMasterAdmin && budgetChanged) {
          throwEventError('FORBIDDEN', 'Task owners must request additional budget using the budget increase request');
        }
        const [pendingRequestRows] = await connection.query<any[]>(
          `SELECT id, requested_amount AS requestedAmount
           FROM task_budget_requests
           WHERE task_id = ? AND status = 'PENDING'
           ORDER BY created_at DESC, id DESC
           LIMIT 1 FOR UPDATE`,
          [taskId]
        );
        const pendingRequest = pendingRequestRows[0] ?? null;
        if (pendingRequest && budgetChanged && !isCreator && !isMasterAdmin) {
          throwEventError('CONFLICT', 'A budget increase request is already pending approval');
        }

        if (task.parentTaskId !== null) {
          const [parentRows] = await connection.query<any[]>(
            `SELECT id, budget_amount AS budgetAmount
             FROM tasks WHERE id = ? FOR UPDATE`,
            [Number(task.parentTaskId)]
          );
          const parent = parentRows[0];
          if (!parent) throwEventError('NOT_FOUND', 'Parent task not found');
          const [allocationRows] = await connection.query<any[]>(
            `SELECT COALESCE(SUM(budget_amount), 0) AS allocated
             FROM tasks WHERE parent_id = ? AND id <> ?`,
            [Number(task.parentTaskId), taskId]
          );
          const remainingCents = amountCents(parent.budgetAmount) - amountCents(allocationRows[0].allocated);
          if (amountCents(budgetAmount) > remainingCents) {
            throwEventError('BAD_REQUEST', 'Budget exceeds the parent task remaining budget');
          }
        }

        const [childAllocationRows] = await connection.query<any[]>(
          `SELECT COALESCE(SUM(budget_amount), 0) AS allocated
           FROM tasks WHERE parent_id = ?`,
          [taskId]
        );
        if (requestedBudgetCents < amountCents(childAllocationRows[0].allocated)) {
          throwEventError('BAD_REQUEST', 'Budget cannot be lower than the amount already allocated to subtasks');
        }

        if (pendingRequest && budgetChanged) {
          await connection.execute(
            `UPDATE task_budget_requests
             SET status = 'REJECTED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'PENDING'`,
            [loggedInUserId, Number(pendingRequest.id)]
          );
        }
        if (status === null) {
          await connection.execute(
            `UPDATE tasks
             SET budget_amount = ?, updated_by = ?
             WHERE id = ?`,
            [budgetAmount, loggedInUserId, taskId]
          );
        } else {
          await connection.execute(
            `UPDATE tasks
             SET budget_amount = ?, status = ?, updated_by = ?
             WHERE id = ?`,
            [budgetAmount, status, loggedInUserId, taskId]
          );
        }
        const [updatedRows] = await connection.query<any[]>(
          `SELECT CAST(budget_amount AS CHAR) AS budgetAmount, status,
                  DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
           FROM tasks WHERE id = ? LIMIT 1`,
          [taskId]
        );
        const [requestRows] = await connection.query<any[]>(
          `SELECT id, CAST(requested_amount AS CHAR) AS requestedAmount, status
           FROM task_budget_requests
           WHERE task_id = ? AND status = 'PENDING'
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [taskId]
        );
        const activeRequest = requestRows[0] ?? null;
        await connection.commit();
        return {
          budgetAmount: String(updatedRows[0].budgetAmount),
          status: String(updatedRows[0].status),
          updatedAt: String(updatedRows[0].updatedAt),
          requestId: activeRequest ? Number(activeRequest.id) : null,
          requestStatus: activeRequest ? String(activeRequest.status) : null,
          requestedBudgetAmount: activeRequest ? String(activeRequest.requestedAmount) : null
        };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async reviewTaskBudgetRequest(_: any, args: { requestId: number; decision: string }, context: any) {
      const requestId = Number(args?.requestId);
      if (!Number.isInteger(requestId) || requestId <= 0) {
        throwEventError('BAD_REQUEST', 'requestId must be a positive integer');
      }
      const decision = String(args?.decision || '').trim().toUpperCase();
      if (!['APPROVE', 'REJECT'].includes(decision)) {
        throwEventError('BAD_REQUEST', 'decision must be APPROVE or REJECT');
      }
      const loggedInUserId = await getLoggedInUserId(context);
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [requestRows] = await connection.query<any[]>(
          `SELECT request.id, request.task_id AS taskId,
                  request.requested_amount AS requestedAmount,
                  request.status,
                  task.parent_id AS parentTaskId, task.budget_amount AS currentBudget,
                  task.created_by AS createdBy, parent.budget_amount AS parentBudget,
                  task.event_id AS eventId
           FROM task_budget_requests request
           INNER JOIN tasks task ON task.id = request.task_id
           LEFT JOIN tasks parent ON parent.id = task.parent_id
           WHERE request.id = ? FOR UPDATE`,
          [requestId]
        );
        const request = requestRows[0];
        if (!request) throwEventError('NOT_FOUND', 'Budget request not found');
        if (request.status !== 'PENDING') throwEventError('CONFLICT', 'This budget request has already been reviewed');
        const isMasterAdmin = await hasPermission(
          loggedInUserId,
          PERMISSIONS.EVENT_TASK_MANAGE_ANY,
          { type: 'EVENT', id: Number(request.eventId) }
        );
        if (Number(request.createdBy) !== loggedInUserId && !isMasterAdmin) {
          throwEventError('FORBIDDEN', 'Only the task creator can review this budget request');
        }
        if (decision === 'APPROVE') {
          if (request.parentTaskId !== null) {
            const [allocationRows] = await connection.query<any[]>(
              `SELECT COALESCE(SUM(budget_amount), 0) AS allocated
               FROM tasks WHERE parent_id = ?`,
              [Number(request.parentTaskId)]
            );
            const availableCents = amountCents(request.parentBudget) - amountCents(allocationRows[0].allocated);
            const requestedDelta = amountCents(request.requestedAmount) - amountCents(request.currentBudget);
            if (requestedDelta > availableCents) {
              throwEventError('BAD_REQUEST', 'Requested budget exceeds the parent task remaining budget');
            }
          }
          if (amountCents(request.requestedAmount) > MAX_TASK_BUDGET_CENTS) {
            throwEventError('BAD_REQUEST', 'The approved increase exceeds the maximum task budget');
          }
          const [childAllocationRows] = await connection.query<any[]>(
            `SELECT COALESCE(SUM(budget_amount), 0) AS allocated
             FROM tasks WHERE parent_id = ?`,
            [Number(request.taskId)]
          );
          if (amountCents(request.requestedAmount) < amountCents(childAllocationRows[0].allocated)) {
            throwEventError('BAD_REQUEST', 'Requested budget cannot be lower than the amount already allocated to subtasks');
          }
          await connection.execute(
            `UPDATE tasks SET budget_amount = ?, updated_by = ? WHERE id = ?`,
            [request.requestedAmount, loggedInUserId, Number(request.taskId)]
          );
        }
        await connection.execute(
          `UPDATE task_budget_requests
           SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'PENDING'`,
          [decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', loggedInUserId, requestId]
        );
        const [updatedRows] = await connection.query<any[]>(
          `SELECT CAST(task.budget_amount AS CHAR) AS budgetAmount,
                  task.status,
                  DATE_FORMAT(task.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
           FROM tasks task WHERE task.id = ?`,
          [Number(request.taskId)]
        );
        await connection.commit();
        return {
          budgetAmount: String(updatedRows[0].budgetAmount),
          status: String(updatedRows[0].status),
          updatedAt: String(updatedRows[0].updatedAt),
          requestId,
          requestStatus: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          requestedBudgetAmount: String(request.requestedAmount)
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
