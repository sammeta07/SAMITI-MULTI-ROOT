import { execute, getConnection, query } from '../../../../config/db';
import { RowDataPacket } from 'mysql2/promise';
import type { PoolConnection } from 'mysql2/promise';
import { throwEventError, getLoggedInUserId } from '../voting/event-voting-core.graphql';
import {
  hasCommitteeTaskProgramCreationRole,
  hasTaskBudgetApprovalAuthority,
  hasPermission,
  PERMISSIONS
} from '../../../../authorization/authorization';
import {
  getAuthorityFinanceActionTaskIds,
  getFinanceActionTaskIds,
  getFinanceParticipantTaskIds,
  getPendingReceiptTaskIds
} from '../../../tasks/task-finance.graphql';
import { loadTodoReservationCapacity } from '../../../todos/todos.graphql';

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
    availableInHand: String!
    initialBudgetRequestedAmount: String
    initialBudgetRequestStatus: String
    initialBudgetRequestId: Int
    canReviewInitialBudgetRequest: Boolean!
    budgetRequestId: Int
    requestedBudgetAmount: String
    budgetRequestStatus: String
    budgetApprovalStage: String
    budgetRequestedByName: String
    canReviewBudgetRequest: Boolean!
    canCancelBudgetRequest: Boolean!
    canRequestBudgetIncrease: Boolean!
    status: String
    ownerUserId: Int
    ownerName: String
    assignedByName: String
    createdByName: String
    updatedByName: String
    createdAt: String!
    ownerAssignedAt: String
    updatedAt: String!
    canManage: Boolean!
    canUpdateStatus: Boolean!
    canEditTask: Boolean!
    canAssignOwner: Boolean!
    canDelete: Boolean!
    canAccessFinance: Boolean
    isTaskCreator: Boolean!
    canViewCreatedSubtaskFinance: Boolean!
    needsFinanceAction: Boolean!
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
    canRequestBudgetIncrease: Boolean
  }

  type UpdatedInitialTaskBudgetRequest {
    requestedAmount: String!
  }

  input CreateEventTaskInput {
    eventId: Int!
    taskName: String!
    budgetAmount: String = "0"
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
    budgetApprovalStage: String
    budgetRequestedByName: String
    canReviewBudgetRequest: Boolean!
    canCancelBudgetRequest: Boolean!
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
    canUpdateStatus: Boolean!
    canEditTask: Boolean!
    canAssignOwner: Boolean!
    canDelete: Boolean!
  }
`;

export const eventTasksQueryFields = `
  eventTasks(id: Int!, drafts: Boolean = false): EventTasksPayload!
`;

export const createEventTaskMutationFields = `
  createEventTask(input: CreateEventTaskInput!): CreatedEventTask!
  assignEventTask(taskId: Int!, ownerUserId: Int): EventTaskEntry!
  updateEventTaskStatus(taskId: Int!, status: EventTaskStatus!): EventTaskEntry!
  updateEventTaskName(taskId: Int!, taskName: String!): UpdatedEventTaskName!
  updateEventTaskBudget(taskId: Int!, budgetAmount: String!, status: String): UpdatedEventTaskBudget!
  updateInitialTaskBudgetRequest(taskId: Int!, amount: String!): UpdatedInitialTaskBudgetRequest!
  requestTaskBudgetReduction(taskId: Int!, amount: String!): UpdatedEventTaskBudget!
  requestTaskBudgetIncrease(taskId: Int!, amount: String!): UpdatedEventTaskBudget!
  reviewTaskBudgetRequest(requestId: Int!, decision: String!): UpdatedEventTaskBudget!
  cancelTaskBudgetRequest(requestId: Int!): UpdatedEventTaskBudget!
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
  if (task.parentTaskId !== null) {
    throwEventError('BAD_REQUEST', 'Subtasks can only be created under top-level tasks');
  }
  return task;
}

async function hasTaskAdminPermission(
  userId: number,
  committeeId: number,
  eventId: number
): Promise<boolean> {
  if (await hasCommitteeTaskProgramCreationRole(userId, committeeId)) return true;
  return hasPermission(userId, PERMISSIONS.EVENT_TASK_MANAGE_ANY, { type: 'EVENT', id: eventId });
}

async function assertCanAssignTask(taskId: number, userId: number): Promise<void> {
  if (!await getTaskAssignmentPermission(taskId, userId)) {
    throwEventError('FORBIDDEN', 'Only a Committee Admin, Committee Master Admin, authorized event role, or parent task owner can assign tasks');
  }
}

async function getTaskAssignmentPermission(taskId: number, userId: number): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT t.event_id AS eventId, e.committee_id AS committeeId,
            t.owner_user_id AS ownerUserId, t.parent_id AS parentTaskId,
            parent.owner_user_id AS parentOwnerUserId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     LEFT JOIN tasks parent ON parent.id = t.parent_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (rows.length === 0) throwEventError('NOT_FOUND', 'Task not found');
  const task = rows[0];
  const rootTaskId = task.parentTaskId === null ? taskId : Number(task.parentTaskId);
  const draftRows = await query<any[]>(
    `SELECT EXISTS (
       SELECT 1
       FROM task_finance_requests initialRequest
       WHERE initialRequest.task_id = ?
         AND initialRequest.request_type = 'ADVANCE'
         AND initialRequest.reason = ?
         AND initialRequest.status <> 'APPROVED'
     ) AS isDraft`,
    [rootTaskId, INITIAL_TASK_BUDGET_FINANCE_REASON]
  );
  if (Number(draftRows[0]?.isDraft) === 1) return false;
  const canManageTasks = await hasTaskAdminPermission(
    userId,
    Number(task.committeeId),
    Number(task.eventId)
  );
  if (task.parentTaskId === null) {
    return canManageTasks ||
      hasPermission(userId, PERMISSIONS.EVENT_TASK_ASSIGN_OWNER, { type: 'EVENT', id: Number(task.eventId) });
  }
  return canManageTasks ||
    Number(task.parentOwnerUserId) === userId;
}

async function assertCanEditOrDeleteTask(taskId: number, userId: number): Promise<void> {
  const rows = await query<any[]>(
    `SELECT e.committee_id AS committeeId, t.event_id AS eventId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (rows.length === 0) throwEventError('NOT_FOUND', 'Task not found');
  const task = rows[0];
  if (!await hasTaskAdminPermission(userId, Number(task.committeeId), Number(task.eventId))) {
    throwEventError('FORBIDDEN', 'Only a Committee Admin or Committee Master Admin can edit or delete this task');
  }
}

async function getTaskDeletionPermission(taskId: number, userId: number): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT t.parent_id AS parentTaskId,
            e.committee_id AS committeeId,
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
  const canManageTasks = await hasTaskAdminPermission(
    userId,
    Number(task.committeeId),
    Number(task.eventId)
  );
  return canManageTasks ||
    (task.parentTaskId !== null && Number(task.parentOwnerUserId) === userId);
}

async function assertCanDeleteTask(taskId: number, userId: number): Promise<void> {
  if (!await getTaskDeletionPermission(taskId, userId)) {
    throwEventError(
      'FORBIDDEN',
      'Only a Committee Admin, Committee Master Admin, or direct parent task owner can delete this task'
    );
  }
}

async function getTaskManagementPermission(taskId: number, userId: number): Promise<boolean> {
  const taskRows = await query<any[]>(
    `SELECT t.owner_user_id AS ownerUserId, t.parent_id AS parentTaskId,
            parent.owner_user_id AS parentOwnerUserId,
            e.committee_id AS committeeId, t.event_id AS eventId
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
    hasTaskAdminPermission(userId, Number(task.committeeId), Number(task.eventId));
}

async function getTaskEditPermission(taskId: number, userId: number): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT e.committee_id AS committeeId, t.event_id AS eventId
     FROM tasks t
     INNER JOIN events e ON e.id = t.event_id
     WHERE t.id = ?
     LIMIT 1`,
    [taskId]
  );
  if (rows.length === 0) throwEventError('NOT_FOUND', 'Task not found');
  const task = rows[0];
  return hasTaskAdminPermission(userId, Number(task.committeeId), Number(task.eventId));
}

function validateTaskBudgetAmount(value: unknown): string {
  const amount = String(value ?? '0').trim();
  if (!/^\d{1,10}$/.test(amount)) {
    throwEventError('BAD_REQUEST', 'budgetAmount must be a non-negative whole number of rupees');
  }
  return amount;
}

function amountCents(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const MAX_TASK_BUDGET_CENTS = 999_999_999_900;
const INITIAL_TASK_BUDGET_FINANCE_REASON = 'Initial sanctioned task budget';

async function getMaximumTaskBudgetReductionCents(
  connection: PoolConnection,
  taskId: number,
  currentBudget: unknown
): Promise<number> {
  const [expenseRows] = await connection.query<any[]>(
    `SELECT COALESCE(SUM(CASE
       WHEN expense_status = 'CONFIRMED' OR
            (expense_status = 'RESERVED' AND status <> 'CANCELLED')
       THEN expense_amount ELSE 0
     END), 0) AS directExpenses
     FROM todos
     WHERE task_id = ?`,
    [taskId]
  );
  const [allocationRows] = await connection.query<any[]>(
    `SELECT COALESCE(SUM(budget_amount), 0) AS allocated
     FROM tasks
     WHERE parent_id = ?`,
    [taskId]
  );
  const committedCents =
    amountCents(expenseRows[0]?.directExpenses) + amountCents(allocationRows[0]?.allocated);
  return Math.max(0, amountCents(currentBudget) - committedCents);
}

async function insertSanctionedBudgetFinanceRequest(
  connection: PoolConnection,
  input: {
    taskId: number;
    requestType: 'ADVANCE' | 'TOP_UP';
    amount: string;
    reason: string;
    requestedBy: number;
    reviewedBy: number;
    sourceBudgetRequestId?: number;
    allowZero?: boolean;
  }
): Promise<void> {
  const amount = validateTaskBudgetAmount(input.amount);
  if (amountCents(amount) <= 0 && !input.allowZero) return;
  const requiresAuthorityReview = input.requestType === 'ADVANCE';
  await connection.execute(
    `INSERT INTO task_finance_requests
       (task_id, request_type, requested_amount, approved_amount, reason, status,
        approval_stage, requested_by, reviewed_by, reviewed_at, source_budget_request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.taskId,
      input.requestType,
      amount,
      requiresAuthorityReview ? null : amount,
      input.reason,
      requiresAuthorityReview ? 'PENDING' : 'APPROVED',
      requiresAuthorityReview ? 'AUTHORITY' : 'TREASURER',
      input.requestedBy,
      requiresAuthorityReview ? null : input.reviewedBy,
      requiresAuthorityReview ? null : new Date(),
      input.sourceBudgetRequestId ?? null
    ]
  );
}

export const eventTasksResolvers = {
  Query: {
    async eventTasks(_: any, args: { id: number; drafts?: boolean }, context: any) {
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
      const initialRequestMatch = args.drafts === true ? 'EXISTS' : 'NOT EXISTS';
      const canAssignRootTasks = await hasCommitteeTaskProgramCreationRole(
        loggedInUserId,
        Number(event.committee_id)
      );
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
      const isBudgetAuthority = await hasTaskBudgetApprovalAuthority(loggedInUserId, eventId);
      const cashierRows = await query<Array<RowDataPacket & { isCashier: number }>>(
        `SELECT EXISTS (
           SELECT 1
           FROM users_events ue
           INNER JOIN events_roles_master erm ON erm.role_id = ue.role_id
           WHERE ue.event_id = ?
             AND ue.user_id = ?
             AND (
               UPPER(REPLACE(REPLACE(TRIM(erm.role_name), ' ', '_'), '-', '_')) IN ('TREASURER', 'CASHIER', 'KOSHADHYAKSHA') OR
               UPPER(REPLACE(REPLACE(TRIM(erm.english_name), ' ', '_'), '-', '_')) IN ('TREASURER', 'CASHIER', 'KOSHADHYAKSHA') OR
               UPPER(REPLACE(REPLACE(TRIM(erm.hindi_name), ' ', '_'), '-', '_')) IN ('TREASURER', 'CASHIER', 'KOSHADHYAKSHA')
             )
         ) AS isCashier`,
        [eventId, loggedInUserId]
      );
      const isEventCashier = Number(cashierRows[0]?.isCashier) === 1;
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
        availableInHand: string;
        initialBudgetRequestedAmount: string | null;
        initialBudgetRequestStatus: string | null;
        initialBudgetRequestId: number | null;
        isUnapprovedInitialTask: number;
        budgetRequestId: number | null;
        requestedBudgetAmount: string | null;
        budgetRequestStatus: string | null;
        budgetApprovalStage: string | null;
        budgetRequestedByName: string | null;
        budgetRequestedBy: number | null;
        status: string | null;
        createdBy: number | null;
        parentOwnerUserId: number | null;
        ownerUserId: number | null;
        ownerName: string | null;
        assignedByName: string | null;
        createdByName: string | null;
        updatedByName: string | null;
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
           CAST(CASE
             WHEN EXISTS (
               SELECT 1 FROM task_finance_requests unapprovedInitialRequest
               WHERE unapprovedInitialRequest.task_id = t.id
                 AND unapprovedInitialRequest.request_type = 'ADVANCE'
                 AND unapprovedInitialRequest.reason = '${INITIAL_TASK_BUDGET_FINANCE_REASON}'
                 AND unapprovedInitialRequest.status <> 'APPROVED'
             ) THEN 0
             ELSE t.budget_amount
           END AS CHAR) AS budgetAmount,
           (
             SELECT CAST(initialRequest.requested_amount AS CHAR)
             FROM task_finance_requests initialRequest
             WHERE initialRequest.task_id = t.id
               AND initialRequest.request_type = 'ADVANCE'
               AND initialRequest.reason = '${INITIAL_TASK_BUDGET_FINANCE_REASON}'
               AND initialRequest.status <> 'APPROVED'
             ORDER BY initialRequest.created_at DESC, initialRequest.id DESC
             LIMIT 1
           ) AS initialBudgetRequestedAmount,
           (
             SELECT initialRequest.status
             FROM task_finance_requests initialRequest
             WHERE initialRequest.task_id = t.id
               AND initialRequest.request_type = 'ADVANCE'
               AND initialRequest.reason = '${INITIAL_TASK_BUDGET_FINANCE_REASON}'
             ORDER BY initialRequest.created_at DESC, initialRequest.id DESC
             LIMIT 1
           ) AS initialBudgetRequestStatus,
           (
             SELECT initialRequest.id
             FROM task_finance_requests initialRequest
             WHERE initialRequest.task_id = t.id
               AND initialRequest.request_type = 'ADVANCE'
               AND initialRequest.reason = '${INITIAL_TASK_BUDGET_FINANCE_REASON}'
               AND initialRequest.status = 'PENDING'
               AND initialRequest.approval_stage = 'AUTHORITY'
             ORDER BY initialRequest.created_at DESC, initialRequest.id DESC
             LIMIT 1
           ) AS initialBudgetRequestId,
           EXISTS (
             SELECT 1 FROM task_finance_requests unapprovedInitialRequest
             WHERE unapprovedInitialRequest.task_id = COALESCE(t.parent_id, t.id)
               AND unapprovedInitialRequest.request_type = 'ADVANCE'
               AND unapprovedInitialRequest.reason = '${INITIAL_TASK_BUDGET_FINANCE_REASON}'
               AND unapprovedInitialRequest.status <> 'APPROVED'
           ) AS isUnapprovedInitialTask,
           CAST(GREATEST(
             0,
             COALESCE(taskCash.advanceIssued, 0)
               + COALESCE(taskTransferIn.amount, 0)
               - COALESCE(taskCash.advanceSpent, 0)
               - COALESCE(taskCash.returnConfirmed, 0)
               - COALESCE(taskTransferOut.amount, 0)
               - COALESCE(taskChecklist.checklistExpenses, 0)
               - COALESCE(taskCash.returnPending, 0)
               - COALESCE(taskChecklist.checklistReserved, 0)
           ) AS CHAR) AS availableInHand,
           budgetRequest.id AS budgetRequestId,
           CAST(budgetRequest.requested_amount - budgetRequest.budget_before_request AS CHAR) AS requestedBudgetAmount,
           budgetRequest.status AS budgetRequestStatus,
           budgetRequest.approval_stage AS budgetApprovalStage,
           budgetRequester.name AS budgetRequestedByName,
           budgetRequest.requested_by AS budgetRequestedBy,
           t.status,
           t.owner_user_id AS ownerUserId,
           owner.name AS ownerName,
           assignedBy.name AS assignedByName,
           creator.name AS createdByName,
           updater.name AS updatedByName,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
           DATE_FORMAT(t.owner_assigned_at, '%Y-%m-%d %H:%i:%s') AS ownerAssignedAt,
           DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
         FROM tasks t
         LEFT JOIN tasks parent ON parent.id = t.parent_id
         LEFT JOIN task_budget_requests budgetRequest
           ON budgetRequest.task_id = t.id AND budgetRequest.status = 'PENDING'
         LEFT JOIN (
           SELECT transaction.task_id,
             SUM(CASE WHEN transaction.transaction_type = 'ADVANCE_ISSUED'
               AND transaction.status = 'CONFIRMED'
               AND transaction.received_at IS NOT NULL THEN transaction.amount ELSE 0 END) AS advanceIssued,
             SUM(CASE WHEN transaction.transaction_type = 'ADVANCE_EXPENSE'
               AND transaction.status = 'CONFIRMED' THEN transaction.amount ELSE 0 END) AS advanceSpent,
             SUM(CASE WHEN transaction.transaction_type = 'ADVANCE_RETURN'
               AND transaction.status = 'PENDING' THEN transaction.amount ELSE 0 END) AS returnPending,
             SUM(CASE WHEN transaction.transaction_type = 'ADVANCE_RETURN'
               AND transaction.status = 'CONFIRMED' THEN transaction.amount ELSE 0 END) AS returnConfirmed
           FROM task_finance_transactions transaction
           INNER JOIN tasks financeTask ON financeTask.id = transaction.task_id
           WHERE financeTask.event_id = ?
             AND transaction.transaction_type IN ('ADVANCE_ISSUED', 'ADVANCE_EXPENSE', 'ADVANCE_RETURN')
           GROUP BY transaction.task_id
         ) taskCash ON taskCash.task_id = t.id
         LEFT JOIN (
           SELECT transfer.subtask_id AS task_id, SUM(transfer.amount) AS amount
           FROM task_subtask_transfers transfer
           INNER JOIN tasks financeSubtask ON financeSubtask.id = transfer.subtask_id
           WHERE financeSubtask.event_id = ? AND transfer.status = 'CONFIRMED'
           GROUP BY transfer.subtask_id
         ) taskTransferIn ON taskTransferIn.task_id = t.id
         LEFT JOIN (
           SELECT transfer.parent_task_id AS task_id, SUM(transfer.amount) AS amount
           FROM task_subtask_transfers transfer
           INNER JOIN tasks financeParent ON financeParent.id = transfer.parent_task_id
           WHERE financeParent.event_id = ? AND transfer.status = 'CONFIRMED'
           GROUP BY transfer.parent_task_id
         ) taskTransferOut ON taskTransferOut.task_id = t.id
         LEFT JOIN (
           SELECT todo.task_id,
             SUM(CASE WHEN todo.expense_status = 'CONFIRMED' THEN todo.expense_amount ELSE 0 END) AS checklistExpenses,
             SUM(CASE WHEN todo.expense_status = 'RESERVED' AND todo.status <> 'CANCELLED'
               THEN todo.expense_amount ELSE 0 END) AS checklistReserved
           FROM todos todo
           INNER JOIN tasks financeTask ON financeTask.id = todo.task_id
           WHERE financeTask.event_id = ?
           GROUP BY todo.task_id
         ) taskChecklist ON taskChecklist.task_id = t.id
         LEFT JOIN users budgetRequester ON budgetRequester.id = budgetRequest.requested_by
         LEFT JOIN users owner ON owner.id = t.owner_user_id
         LEFT JOIN users assignedBy ON assignedBy.id = t.owner_assigned_by
         LEFT JOIN users creator ON creator.id = t.created_by
         LEFT JOIN users updater ON updater.id = t.updated_by
         WHERE t.event_id = ?
           AND (
             (
               t.parent_id IS NULL
               AND ${initialRequestMatch} (
                 SELECT 1 FROM task_finance_requests initialRequest
                 WHERE initialRequest.task_id = t.id
                   AND initialRequest.request_type = 'ADVANCE'
                   AND initialRequest.reason = '${INITIAL_TASK_BUDGET_FINANCE_REASON}'
                   AND initialRequest.status <> 'APPROVED'
               )
             )
             OR (
               t.parent_id IS NOT NULL
               AND ${initialRequestMatch} (
                 SELECT 1 FROM task_finance_requests initialRequest
                 WHERE initialRequest.task_id = t.parent_id
                   AND initialRequest.request_type = 'ADVANCE'
                   AND initialRequest.reason = '${INITIAL_TASK_BUDGET_FINANCE_REASON}'
                   AND initialRequest.status <> 'APPROVED'
               )
             )
           )
         ORDER BY t.created_at ASC, t.id ASC`,
        [eventId, eventId, eventId, eventId, eventId]
      );
      const financeActionTaskIds = isEventCashier
        ? await getFinanceActionTaskIds(taskRows.map((taskRow) => Number(taskRow.taskId)))
        : new Set<number>();
      const financeParticipantTaskIds = await getFinanceParticipantTaskIds(
        taskRows.map((taskRow) => Number(taskRow.taskId)),
        loggedInUserId
      );
      const creatorParentTaskIds = new Set(taskRows
        .filter((taskRow) =>
          taskRow.parentTaskId !== null && Number(taskRow.createdBy) === loggedInUserId
        )
        .map((taskRow) => Number(taskRow.parentTaskId)));
      const authorityFinanceActionTaskIds = isBudgetAuthority
        ? await getAuthorityFinanceActionTaskIds(taskRows.map((taskRow) => Number(taskRow.taskId)))
        : new Set<number>();
      const receiptTaskIds = await getPendingReceiptTaskIds(
        taskRows.map((taskRow) => Number(taskRow.taskId)),
        loggedInUserId
      );

      return {
        entries: taskRows.map((taskRow) => {
          const isRootTask = taskRow.parentTaskId === null;
          const taskOwnerUserId = taskRow.ownerUserId === null ? null : Number(taskRow.ownerUserId);
          const taskId = Number(taskRow.taskId);
          const hideBudgetReduction = isEventCashier &&
            taskRow.budgetRequestId !== null &&
            Number(taskRow.requestedBudgetAmount) < 0;
          const budgetRequestId = hideBudgetReduction ? null : taskRow.budgetRequestId;
          const canReviewBudgetRequest = Boolean(budgetRequestId) &&
            (
              (taskRow.budgetApprovalStage === 'CREATOR' && Number(taskRow.createdBy) === loggedInUserId) ||
              (taskRow.budgetApprovalStage === 'AUTHORITY' && isBudgetAuthority)
            );
          return {
          id: Number(taskRow.taskId),
          taskId: Number(taskRow.taskId),
          eventId: Number(taskRow.eventId),
          parentTaskId: taskRow.parentTaskId === null ? null : Number(taskRow.parentTaskId),
          parentTaskName: taskRow.parentTaskName || null,
          taskName: String(taskRow.taskName || 'Untitled Task'),
          budgetAmount: String(taskRow.budgetAmount),
          availableInHand: String(taskRow.availableInHand),
          initialBudgetRequestedAmount: taskRow.initialBudgetRequestedAmount === null
            ? null
            : String(taskRow.initialBudgetRequestedAmount),
          initialBudgetRequestStatus: taskRow.initialBudgetRequestStatus || null,
          initialBudgetRequestId: taskRow.initialBudgetRequestId === null
            ? null
            : Number(taskRow.initialBudgetRequestId),
          canReviewInitialBudgetRequest: taskRow.initialBudgetRequestId !== null &&
            isRootTask &&
            isBudgetAuthority &&
            taskOwnerUserId !== loggedInUserId,
          budgetRequestId: budgetRequestId === null ? null : Number(budgetRequestId),
          requestedBudgetAmount: hideBudgetReduction || taskRow.requestedBudgetAmount === null
            ? null
            : String(taskRow.requestedBudgetAmount),
          budgetRequestStatus: hideBudgetReduction ? null : taskRow.budgetRequestStatus || null,
          budgetApprovalStage: taskRow.budgetApprovalStage || null,
          budgetRequestedByName: hideBudgetReduction ? null : taskRow.budgetRequestedByName || null,
          canReviewBudgetRequest,
          canCancelBudgetRequest: Boolean(budgetRequestId) &&
            (Number(taskRow.budgetRequestedBy) === loggedInUserId || canManageAnyTasks),
          canRequestBudgetIncrease: Number(taskRow.ownerUserId) === loggedInUserId &&
            Number(taskRow.createdBy) !== loggedInUserId &&
            !canManageAnyTasks,
          status: taskRow.status ? String(taskRow.status) : null,
          ownerUserId: taskRow.ownerUserId === null ? null : Number(taskRow.ownerUserId),
          ownerName: taskRow.ownerName || null,
          assignedByName: taskRow.assignedByName || null,
          createdByName: taskRow.createdByName || null,
          updatedByName: taskRow.updatedByName || null,
          createdAt: String(taskRow.createdAt),
          ownerAssignedAt: taskRow.ownerAssignedAt || null,
          updatedAt: String(taskRow.updatedAt),
          canManage: Number(taskRow.ownerUserId) === loggedInUserId ||
            canManageAnyTasks || canAssignRootTasks,
          canUpdateStatus: Number(taskRow.ownerUserId) === loggedInUserId || canManageAnyTasks,
          canEditTask: canManageAnyTasks || canAssignRootTasks,
          canAssignOwner: Number(taskRow.isUnapprovedInitialTask) !== 1 && (
            isRootTask
              ? canAssignRootTaskOwners || canAssignRootTasks
              : canManageAnyTasks || canAssignRootTasks ||
                Number(taskRow.parentOwnerUserId) === loggedInUserId
          ),
          canDelete: canManageAnyTasks ||
            canAssignRootTasks ||
            (!isRootTask && Number(taskRow.parentOwnerUserId) === loggedInUserId),
          canAccessFinance: Number(taskRow.ownerUserId) === loggedInUserId ||
            Number(taskRow.createdBy) === loggedInUserId ||
            isEventCashier ||
            isBudgetAuthority ||
            canAssignRootTasks ||
            canManageAnyTasks ||
            financeParticipantTaskIds.has(taskId) ||
            creatorParentTaskIds.has(taskId),
          isTaskCreator: Number(taskRow.createdBy) === loggedInUserId,
          canViewCreatedSubtaskFinance: creatorParentTaskIds.has(taskId),
          needsFinanceAction: (
            isEventCashier &&
            isRootTask &&
            taskOwnerUserId !== loggedInUserId &&
            financeActionTaskIds.has(taskId)
          ) || (
            isBudgetAuthority &&
            isRootTask &&
            taskOwnerUserId !== loggedInUserId &&
            authorityFinanceActionTaskIds.has(taskId)
          ) ||
            receiptTaskIds.has(taskId) || canReviewBudgetRequest
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
    async updateInitialTaskBudgetRequest(
      _: any,
      args: { taskId?: number; amount?: string },
      context: any
    ) {
      const taskId = Number(args?.taskId);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
      }
      const amount = validateTaskBudgetAmount(args?.amount);
      const userId = await getLoggedInUserId(context);
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [taskRows] = await connection.query<any[]>(
          `SELECT task.id, task.parent_id AS parentTaskId,
                  task.event_id AS eventId, event.committee_id AS committeeId
           FROM tasks task
           INNER JOIN events event ON event.id = task.event_id
           WHERE task.id = ? FOR UPDATE`,
          [taskId]
        );
        const task = taskRows[0];
        if (!task) throwEventError('NOT_FOUND', 'Task not found');
        if (task.parentTaskId !== null) {
          throwEventError('BAD_REQUEST', 'Only a root task can have an initial budget request');
        }
        if (!await hasTaskAdminPermission(userId, Number(task.committeeId), Number(task.eventId))) {
          throwEventError('FORBIDDEN', 'Only a Committee Admin or Committee Master Admin can edit this draft budget');
        }

        const [requestRows] = await connection.query<any[]>(
          `SELECT id
           FROM task_finance_requests
           WHERE task_id = ? AND request_type = 'ADVANCE'
             AND reason = ? AND status <> 'APPROVED'
           ORDER BY created_at DESC, id DESC
           LIMIT 1 FOR UPDATE`,
          [taskId, INITIAL_TASK_BUDGET_FINANCE_REASON]
        );
        const request = requestRows[0];
        if (!request) {
          throwEventError('CONFLICT', 'Only an unapproved initial budget request can be edited');
        }

        await connection.execute(
          `UPDATE task_finance_requests
           SET requested_amount = ?, requested_by = ?, status = 'PENDING',
               approved_amount = NULL, approval_stage = 'AUTHORITY',
               reviewed_by = NULL, reviewed_at = NULL, review_note = NULL,
               authority_decision = NULL, authority_reviewed_by = NULL,
               authority_reviewed_at = NULL, authority_review_note = NULL,
               created_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [amount, userId, Number(request.id)]
        );
        await connection.execute(
          `UPDATE tasks
           SET budget_amount = 0, updated_by = ?
           WHERE id = ?`,
          [userId, taskId]
        );
        await connection.commit();
        return { requestedAmount: amount };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async deleteEventTask(_: any, args: { taskId?: number }, context: any) {
      const taskId = Number(args?.taskId);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
      }

      const userId = await getLoggedInUserId(context);
      await assertCanDeleteTask(taskId, userId);
      const taskRows = await query<any[]>(
        `SELECT task.status, task.parent_id AS parentTaskId,
                EXISTS (
                  SELECT 1
                  FROM task_finance_requests initialRequest
                  WHERE initialRequest.task_id = task.id
                    AND initialRequest.request_type = 'ADVANCE'
                    AND initialRequest.reason = ?
                    AND initialRequest.status <> 'APPROVED'
                ) AS isUnapprovedDraft
         FROM tasks task
         WHERE task.id = ?
         LIMIT 1`,
        [INITIAL_TASK_BUDGET_FINANCE_REASON, taskId]
      );
      if (taskRows.length === 0) {
        throwEventError('NOT_FOUND', 'Task not found');
      }
      const taskIsDraft = taskRows[0].parentTaskId === null &&
        Number(taskRows[0].isUnapprovedDraft) === 1;
      if (String(taskRows[0]?.status || '').toUpperCase() !== 'NEW' && !taskIsDraft) {
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
        canUpdateStatus: true,
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
                t.owner_user_id AS ownerUserId, t.parent_id AS parentTaskId,
                parent.owner_user_id AS parentOwnerUserId
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
      await assertCanAssignTask(taskId, loggedInUserId);

      if (
        task.parentTaskId !== null &&
        ownerUserId !== null &&
        Number(task.parentOwnerUserId) === ownerUserId
      ) {
        throwEventError('BAD_REQUEST', 'A subtask cannot be assigned to its parent task owner');
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

      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [lockedRows] = await connection.query<any[]>(
          `SELECT t.parent_id AS parentTaskId,
                  t.created_by AS createdBy,
                  t.budget_amount AS budgetAmount,
                  parent.owner_user_id AS parentOwnerUserId
           FROM tasks t
           LEFT JOIN tasks parent ON parent.id = t.parent_id
           WHERE t.id = ?
           FOR UPDATE`,
          [taskId]
        );
        const lockedTask = lockedRows[0];
        if (!lockedTask) throwEventError('NOT_FOUND', 'Task not found');
        if (
          lockedTask.parentTaskId !== null &&
          ownerUserId !== null &&
          Number(lockedTask.parentOwnerUserId) === ownerUserId
        ) {
          throwEventError('BAD_REQUEST', 'A subtask cannot be assigned to its parent task owner');
        }

        await connection.execute(
          `UPDATE tasks
           SET owner_user_id = ?,
               owner_assigned_by = ?,
               owner_assigned_at = IF(? IS NULL, NULL, CURRENT_TIMESTAMP),
               updated_by = ?
           WHERE id = ?`,
          [ownerUserId, ownerUserId === null ? null : loggedInUserId, ownerUserId, loggedInUserId, taskId]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
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
        canUpdateStatus: Number(updated.ownerUserId) === loggedInUserId ||
          await hasPermission(
            loggedInUserId,
            PERMISSIONS.EVENT_TASK_MANAGE_ANY,
            { type: 'EVENT', id: Number(updated.eventId) }
          ),
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

      let createdTaskId: number;
      let createdBudgetRequestId: number | null = null;

      if (parentTaskId !== null) {
        await getTaskForAdminMutation(parentTaskId, loggedInUserId);
      } else {
        const canCreateTopLevel = await hasCommitteeTaskProgramCreationRole(
          loggedInUserId,
          Number(eventRows[0].committee_id)
        );
        if (!canCreateTopLevel) {
          throwEventError('FORBIDDEN', 'Only Committee Admins and Committee Master Admins can create top-level tasks');
        }
      }

      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        if (parentTaskId !== null) {
          const [lockedParentRows] = await connection.query<any[]>(
            `SELECT id, event_id AS eventId, parent_id AS parentTaskId,
                    budget_amount AS budgetAmount
             FROM tasks WHERE id = ? FOR UPDATE`,
            [parentTaskId]
          );
          const lockedParent = lockedParentRows[0];
          if (!lockedParent || Number(lockedParent.eventId) !== eventId) {
            throwEventError('BAD_REQUEST', 'parentTaskId must belong to the selected event');
          }
          if (lockedParent.parentTaskId !== null) {
            throwEventError('BAD_REQUEST', 'Subtasks can only be created under top-level tasks');
          }
          const [allocationRows] = await connection.query<any[]>(
            `SELECT COALESCE(SUM(budget_amount), 0) AS allocated
             FROM tasks WHERE parent_id = ?`,
            [parentTaskId]
          );
          const [untransferredAllocationRows] = await connection.query<any[]>(
            `SELECT COALESCE(SUM(child.budget_amount), 0) AS allocated
             FROM tasks child
             WHERE child.parent_id = ?
               AND NOT EXISTS (
                 SELECT 1
                 FROM task_subtask_transfers transfer
                 WHERE transfer.subtask_id = child.id
                   AND transfer.status = 'CONFIRMED'
               )`,
            [parentTaskId]
          );
          const remainingCents = amountCents(lockedParent.budgetAmount) - amountCents(allocationRows[0].allocated);
          if (amountCents(budgetAmount) > remainingCents) {
            throwEventError('BAD_REQUEST', 'Subtask budget exceeds the parent task remaining budget');
          }
          const cashCapacity = await loadTodoReservationCapacity(connection, parentTaskId, null);
          const remainingInHandCents = cashCapacity.availableInHand -
            BigInt(amountCents(untransferredAllocationRows[0].allocated));
          if (BigInt(amountCents(budgetAmount)) > (remainingInHandCents > 0n ? remainingInHandCents : 0n)) {
            throwEventError('BAD_REQUEST', 'Subtask budget exceeds the available in-hand amount');
          }
        }

        const [insertResult] = await connection.execute<any>(
          `INSERT INTO tasks (
             event_id, parent_id, name, budget_amount, owner_user_id, status,
             created_by, updated_by, owner_assigned_by, owner_assigned_at
           )
           VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL)`,
          [
            eventId,
            parentTaskId,
            taskName,
            parentTaskId === null ? '0' : budgetAmount,
            status,
            loggedInUserId,
            loggedInUserId
          ]
        );
        createdTaskId = Number(insertResult.insertId);
        if (parentTaskId === null) {
          await insertSanctionedBudgetFinanceRequest(connection, {
            taskId: createdTaskId,
            requestType: 'ADVANCE',
            amount: budgetAmount,
            reason: INITIAL_TASK_BUDGET_FINANCE_REASON,
            requestedBy: loggedInUserId,
            reviewedBy: loggedInUserId,
            allowZero: true
          });
        } else if (amountCents(budgetAmount) > 0) {
          const [budgetRequestResult] = await connection.execute<any>(
            `INSERT INTO task_budget_requests
               (task_id, requested_amount, budget_before_request, requested_by, approval_stage)
             VALUES (?, ?, '0', ?, 'CREATOR')`,
            [createdTaskId, budgetAmount, loggedInUserId]
          );
          createdBudgetRequestId = Number(budgetRequestResult.insertId);
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
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
        budgetRequestId: createdBudgetRequestId,
        requestedBudgetAmount: createdBudgetRequestId === null ? null : String(task.budgetAmount),
        budgetRequestStatus: createdBudgetRequestId === null ? null : 'PENDING',
        budgetApprovalStage: createdBudgetRequestId === null ? null : 'CREATOR',
        budgetRequestedByName: createdBudgetRequestId === null ? null : task.createdByName || null,
        canReviewBudgetRequest: createdBudgetRequestId !== null,
        canCancelBudgetRequest: false,
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
        canUpdateStatus: await hasPermission(
          loggedInUserId,
          PERMISSIONS.EVENT_TASK_MANAGE_ANY,
          { type: 'EVENT', id: Number(task.eventId) }
        ),
        canEditTask: await getTaskEditPermission(Number(task.taskId), loggedInUserId),
        canAssignOwner: await getTaskAssignmentPermission(Number(task.taskId), loggedInUserId),
        canDelete: await getTaskDeletionPermission(Number(task.taskId), loggedInUserId)
      };
    },
    async requestTaskBudgetReduction(_: any, args: { taskId: number; amount: string }, context: any) {
      const taskId = Number(args?.taskId);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
      }
      const amount = validateTaskBudgetAmount(args?.amount);
      const reductionCents = amountCents(amount);
      if (reductionCents <= 0) {
        throwEventError('BAD_REQUEST', 'Budget reduction amount must be greater than zero');
      }

      const userId = await getLoggedInUserId(context);
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [taskRows] = await connection.query<any[]>(
          `SELECT t.id, t.parent_id AS parentTaskId, t.budget_amount AS budgetAmount, t.status,
                  t.event_id AS eventId, e.committee_id AS committeeId,
                  DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
           FROM tasks t
           INNER JOIN events e ON e.id = t.event_id
           WHERE t.id = ? FOR UPDATE`,
          [taskId]
        );
        const task = taskRows[0];
        if (!task) throwEventError('NOT_FOUND', 'Task not found');
        if (!await hasTaskAdminPermission(userId, Number(task.committeeId), Number(task.eventId))) {
          throwEventError('FORBIDDEN', 'Only a Committee Admin or Master Admin can request a budget reduction');
        }
        const [pendingReturnRows] = await connection.query<any[]>(
          `SELECT id FROM task_finance_transactions
           WHERE task_id = ? AND transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING'
           LIMIT 1 FOR UPDATE`,
          [taskId]
        );
        if (pendingReturnRows.length > 0) {
          throwEventError('CONFLICT', 'Resolve the pending cash return request before requesting a budget change');
        }

        const [pendingRequestRows] = await connection.query<any[]>(
          `SELECT id FROM task_budget_requests
           WHERE task_id = ? AND status = 'PENDING'
           LIMIT 1 FOR UPDATE`,
          [taskId]
        );
        const pendingRequest = pendingRequestRows[0] ?? null;
        if (pendingRequest) {
          await connection.execute(
            `UPDATE task_budget_requests
             SET status = 'CANCELLED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'PENDING'`,
            [userId, Number(pendingRequest.id)]
          );
        }
        const [pendingInitialFinanceRows] = await connection.query<any[]>(
          `SELECT id
           FROM task_finance_requests
           WHERE task_id = ? AND request_type = 'ADVANCE'
             AND reason = ? AND status = 'PENDING' AND approval_stage = 'AUTHORITY'
           LIMIT 1 FOR UPDATE`,
          [taskId, INITIAL_TASK_BUDGET_FINANCE_REASON]
        );
        if (pendingInitialFinanceRows.length > 0) {
          throwEventError('CONFLICT', 'Resolve the initial budget approval before requesting a reduction');
        }

        const currentBudgetCents = amountCents(task.budgetAmount);
        const maxReductionCents = await getMaximumTaskBudgetReductionCents(
          connection,
          taskId,
          task.budgetAmount
        );
        if (reductionCents > maxReductionCents) {
          throwEventError(
            'BAD_REQUEST',
            `Budget reduction cannot exceed the remaining reducible amount of ${String(maxReductionCents / 100)}`
          );
        }
        const targetBudget = String((currentBudgetCents - reductionCents) / 100);
        const approvalStage = task.parentTaskId === null ? 'AUTHORITY' : 'CREATOR';
        const [insertResult] = await connection.execute<any>(
          `INSERT INTO task_budget_requests
             (task_id, requested_amount, budget_before_request, requested_by, approval_stage)
           VALUES (?, ?, ?, ?, ?)`,
          [taskId, targetBudget, String(task.budgetAmount), userId, approvalStage]
        );
        await connection.commit();
        return {
          budgetAmount: String(task.budgetAmount),
          status: String(task.status),
          updatedAt: String(task.updatedAt),
          requestId: Number(insertResult.insertId),
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
          `SELECT t.id, t.parent_id AS parentTaskId, t.created_by AS createdBy, t.owner_user_id AS ownerUserId,
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
        const [pendingReturnRows] = await connection.query<any[]>(
          `SELECT id FROM task_finance_transactions
           WHERE task_id = ? AND transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING'
           LIMIT 1 FOR UPDATE`,
          [taskId]
        );
        if (pendingReturnRows.length > 0) {
          throwEventError('CONFLICT', 'Resolve the pending cash return request before requesting a budget change');
        }
        const targetBudgetCents = amountCents(task.budgetAmount) + amountCents(amount);
        if (targetBudgetCents > MAX_TASK_BUDGET_CENTS) {
          throwEventError('BAD_REQUEST', 'The requested increase exceeds the maximum task budget');
        }
        const targetBudget = String(targetBudgetCents / 100);
        const approvalStage = task.parentTaskId === null ? 'AUTHORITY' : 'CREATOR';

        const [pendingRows] = await connection.query<any[]>(
          `SELECT id, requested_amount AS requestedAmount,
                  budget_before_request AS budgetBeforeRequest,
                  requested_by AS requestedBy
           FROM task_budget_requests
           WHERE task_id = ? AND status = 'PENDING'
           LIMIT 1 FOR UPDATE`,
          [taskId]
        );
        const pendingRequest = pendingRows[0] ?? null;
        if (pendingRequest) {
          if (
            Number(pendingRequest.requestedBy) !== userId ||
            amountCents(pendingRequest.requestedAmount) <= amountCents(pendingRequest.budgetBeforeRequest)
          ) {
            throwEventError('CONFLICT', 'A different budget request is already pending approval');
          }
          await connection.execute(
            `UPDATE task_budget_requests
             SET status = 'CANCELLED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'PENDING'`,
            [userId, Number(pendingRequest.id)]
          );
        }
        if (task.parentTaskId !== null) {
          const [undisbursedRows] = await connection.query<any[]>(
            `SELECT request.id
             FROM task_budget_requests request
             WHERE request.task_id = ? AND request.status = 'APPROVED'
               AND request.requested_amount > request.budget_before_request
               AND NOT EXISTS (
                 SELECT 1 FROM task_subtask_transfers transfer
                 WHERE transfer.source_budget_request_id = request.id
               )
               AND NOT EXISTS (
                 SELECT 1 FROM task_finance_requests financeRequest
                 WHERE financeRequest.source_budget_request_id = request.id
               )
             LIMIT 1 FOR UPDATE`,
            [taskId]
          );
          if (undisbursedRows.length > 0) {
            throwEventError('CONFLICT', 'Disburse the approved subtask budget before requesting another increase');
          }
        }
        await connection.execute(
          `INSERT INTO task_budget_requests
             (task_id, requested_amount, budget_before_request, requested_by, approval_stage)
           VALUES (?, ?, ?, ?, ?)`,
          [
            taskId,
            targetBudget,
            String(task.budgetAmount),
            userId,
            approvalStage
          ]
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
          `SELECT t.id, t.parent_id AS parentTaskId,
                  t.owner_user_id AS ownerUserId, t.budget_amount AS budgetAmount,
                  t.event_id AS eventId, e.committee_id AS committeeId
           FROM tasks t
           INNER JOIN events e ON e.id = t.event_id
           WHERE t.id = ? FOR UPDATE`,
          [taskId]
        );
        const task = taskRows[0];
        if (!task) throwEventError('NOT_FOUND', 'Task not found');

        const canManageTasks = await hasTaskAdminPermission(
          loggedInUserId,
          Number(task.committeeId),
          Number(task.eventId)
        );
        const isTaskOwner = task.ownerUserId !== null && Number(task.ownerUserId) === loggedInUserId;
        if (!canManageTasks && !isTaskOwner) {
          throwEventError('FORBIDDEN', 'Only a Committee Admin, Committee Master Admin, or task owner can edit this budget');
        }
        const isMasterAdmin = await hasPermission(
          loggedInUserId,
          PERMISSIONS.EVENT_TASK_MANAGE_ANY,
          { type: 'EVENT', id: Number(task.eventId) }
        );
        if (status !== null && !isTaskOwner && !isMasterAdmin) {
          throwEventError('FORBIDDEN', 'Only the task owner or a master admin can update its status');
        }

        const currentBudgetCents = amountCents(task.budgetAmount);
        const requestedBudgetCents = amountCents(budgetAmount);
        const budgetChanged = requestedBudgetCents !== currentBudgetCents;
        if (requestedBudgetCents < currentBudgetCents) {
          throwEventError('BAD_REQUEST', 'Task budgets cannot be decreased');
        }
        if (budgetChanged) {
          const [pendingReturnRows] = await connection.query<any[]>(
            `SELECT id FROM task_finance_transactions
             WHERE task_id = ? AND transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING'
             LIMIT 1 FOR UPDATE`,
            [taskId]
          );
          if (pendingReturnRows.length > 0) {
            throwEventError('CONFLICT', 'Resolve the pending cash return request before requesting a budget change');
          }
        }
        if (task.parentTaskId !== null && budgetChanged) {
          throwEventError(
            'FORBIDDEN',
            'Subtask budget increases must go through the budget request approval flow'
          );
        }
        if (isTaskOwner && !canManageTasks && budgetChanged) {
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
             SET status = 'CANCELLED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'PENDING'`,
            [loggedInUserId, Number(pendingRequest.id)]
          );
        }
        const budgetIncreaseNeedsApproval =
          requestedBudgetCents > currentBudgetCents && task.parentTaskId === null;
        if (requestedBudgetCents > currentBudgetCents && task.parentTaskId === null) {
          const [pendingInitialRequestRows] = await connection.query<any[]>(
            `SELECT id
             FROM task_finance_requests
             WHERE task_id = ? AND request_type = 'ADVANCE'
               AND reason = ? AND status = 'PENDING' AND approval_stage = 'AUTHORITY'
             ORDER BY created_at DESC, id DESC
             LIMIT 1 FOR UPDATE`,
            [taskId, INITIAL_TASK_BUDGET_FINANCE_REASON]
          );
          const pendingInitialRequest = pendingInitialRequestRows[0] ?? null;
          if (pendingInitialRequest) {
            await connection.execute(
              `UPDATE task_finance_requests
               SET requested_amount = ?, requested_by = ?, created_at = CURRENT_TIMESTAMP
               WHERE id = ? AND status = 'PENDING' AND approval_stage = 'AUTHORITY'`,
              [budgetAmount, loggedInUserId, Number(pendingInitialRequest.id)]
            );
          } else {
            await connection.execute(
              `INSERT INTO task_budget_requests
                 (task_id, requested_amount, budget_before_request, requested_by, approval_stage)
               VALUES (?, ?, ?, ?, 'AUTHORITY')`,
              [taskId, budgetAmount, String(task.budgetAmount), loggedInUserId]
            );
          }
        }
        const persistedBudgetAmount = budgetIncreaseNeedsApproval
          ? String(task.budgetAmount)
          : budgetAmount;
        if (status === null) {
          await connection.execute(
            `UPDATE tasks
             SET budget_amount = ?, updated_by = ?
             WHERE id = ?`,
            [persistedBudgetAmount, loggedInUserId, taskId]
          );
        } else {
          await connection.execute(
            `UPDATE tasks
             SET budget_amount = ?, status = ?, updated_by = ?
             WHERE id = ?`,
            [persistedBudgetAmount, status, loggedInUserId, taskId]
          );
        }
        const [updatedRows] = await connection.query<any[]>(
          `SELECT CAST(budget_amount AS CHAR) AS budgetAmount, status,
                  DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
           FROM tasks WHERE id = ? LIMIT 1`,
          [taskId]
        );
        const [requestRows] = await connection.query<any[]>(
          `SELECT id, CAST(requested_amount AS CHAR) AS requestedAmount,
                  CAST(budget_before_request AS CHAR) AS budgetBeforeRequest, status
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
          requestStatus: activeRequest
            ? String(activeRequest.status)
            : budgetIncreaseNeedsApproval ? 'PENDING' : null,
          requestedBudgetAmount: activeRequest
            ? String((amountCents(activeRequest.requestedAmount) - amountCents(activeRequest.budgetBeforeRequest)) / 100)
            : budgetIncreaseNeedsApproval
              ? String((requestedBudgetCents - currentBudgetCents) / 100)
              : null
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
        const [requestTaskRows] = await connection.query<any[]>(
          `SELECT task_id AS taskId
           FROM task_budget_requests
           WHERE id = ?`,
          [requestId]
        );
        if (!requestTaskRows[0]) throwEventError('NOT_FOUND', 'Budget request not found');
        await connection.query(
          'SELECT id FROM tasks WHERE id = ? FOR UPDATE',
          [Number(requestTaskRows[0].taskId)]
        );
        const [requestRows] = await connection.query<any[]>(
          `SELECT request.id, request.task_id AS taskId,
                  request.requested_amount AS requestedAmount,
                  request.budget_before_request AS budgetBeforeRequest,
                  request.requested_by AS requestedBy,
                  request.status,
                  task.parent_id AS parentTaskId, task.budget_amount AS currentBudget,
                  task.created_by AS createdBy, parent.budget_amount AS parentBudget,
                  task.event_id AS eventId,
                  request.approval_stage AS approvalStage,
                  request.creator_decision AS creatorDecision,
                  request.authority_decision AS authorityDecision
           FROM task_budget_requests request
           INNER JOIN tasks task ON task.id = request.task_id
           LEFT JOIN tasks parent ON parent.id = task.parent_id
           WHERE request.id = ? FOR UPDATE`,
          [requestId]
        );
        const request = requestRows[0];
        if (!request) throwEventError('NOT_FOUND', 'Budget request not found');
        if (request.status !== 'PENDING') throwEventError('CONFLICT', 'This budget request has already been reviewed');
        if (request.approvalStage === 'CREATOR' && Number(request.createdBy) !== loggedInUserId) {
          throwEventError('FORBIDDEN', 'Only the child task creator can review this budget request');
        }
        const isAuthority = request.approvalStage === 'AUTHORITY' &&
          request.parentTaskId === null &&
          await hasTaskBudgetApprovalAuthority(loggedInUserId, Number(request.eventId));
        if (request.approvalStage === 'AUTHORITY' && request.parentTaskId !== null) {
          throwEventError('FORBIDDEN', 'Subtask budget requests are reviewed by their creator');
        }
        if (request.approvalStage === 'AUTHORITY' && !isAuthority) {
          throwEventError(
            'FORBIDDEN',
            'Only the event Adhyaksha, Upadhyaksha, or Committee Master Admin can review this budget request'
          );
        }
        if (request.approvalStage !== 'CREATOR' && request.approvalStage !== 'AUTHORITY') {
          throwEventError('CONFLICT', 'This budget request has an invalid approval stage');
        }

        if (request.approvalStage === 'CREATOR') {
          const isInitialSubtaskBudget =
            request.parentTaskId !== null &&
            amountCents(request.budgetBeforeRequest) === 0 &&
            amountCents(request.requestedAmount) === amountCents(request.currentBudget);
          if (decision === 'APPROVE') {
            if (request.parentTaskId !== null) {
              const [allocationRows] = await connection.query<any[]>(
                `SELECT COALESCE(SUM(budget_amount), 0) AS allocated
                 FROM tasks WHERE parent_id = ?`,
                [Number(request.parentTaskId)]
              );
              const availableCents =
                amountCents(request.parentBudget) - amountCents(allocationRows[0].allocated);
              const requestedDelta =
                amountCents(request.requestedAmount) - amountCents(request.currentBudget);
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
          } else if (isInitialSubtaskBudget) {
            await connection.execute(
              `UPDATE tasks SET budget_amount = ?, updated_by = ? WHERE id = ?`,
              [request.budgetBeforeRequest, loggedInUserId, Number(request.taskId)]
            );
          }
          const [updateResult] = await connection.execute<any>(
            `UPDATE task_budget_requests
             SET approval_stage = ?, status = ?, creator_decision = ?, creator_reviewed_by = ?,
                 creator_review_note = NULL, creator_reviewed_at = CURRENT_TIMESTAMP,
                 reviewed_by = ?, review_note = NULL,
                 reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'PENDING' AND approval_stage = 'CREATOR'`,
            ['CREATOR', decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
              decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
              loggedInUserId, loggedInUserId, requestId]
          );
          if (updateResult.affectedRows !== 1) {
            throwEventError('CONFLICT', 'This budget request has already been reviewed');
          }
          const [taskRows] = await connection.query<any[]>(
            `SELECT CAST(budget_amount AS CHAR) AS budgetAmount, status,
                    DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
             FROM tasks WHERE id = ?`,
            [Number(request.taskId)]
          );
          await connection.commit();
          return {
            budgetAmount: String(taskRows[0].budgetAmount),
            status: String(taskRows[0].status),
            updatedAt: String(taskRows[0].updatedAt),
            requestId,
            requestStatus: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            requestedBudgetAmount: String(request.requestedAmount)
          };
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
          const currentBudgetCents = amountCents(request.currentBudget);
          const requestedBudgetCents = amountCents(request.requestedAmount);
          if (requestedBudgetCents < currentBudgetCents) {
            const maxReductionCents = await getMaximumTaskBudgetReductionCents(
              connection,
              Number(request.taskId),
              request.currentBudget
            );
            if (currentBudgetCents - requestedBudgetCents > maxReductionCents) {
              throwEventError(
                'CONFLICT',
                'The reducible budget changed while this request was pending. Refresh and submit a new request.'
              );
            }
          }
          await connection.execute(
            `UPDATE tasks SET budget_amount = ?, updated_by = ? WHERE id = ?`,
            [request.requestedAmount, loggedInUserId, Number(request.taskId)]
          );
          const approvedIncreaseCents = amountCents(request.requestedAmount) - amountCents(request.currentBudget);
          if (approvedIncreaseCents > 0 && request.parentTaskId === null) {
            await insertSanctionedBudgetFinanceRequest(connection, {
              taskId: Number(request.taskId),
              requestType: 'TOP_UP',
              amount: String(approvedIncreaseCents / 100),
              reason: `Approved task budget increase to ${request.requestedAmount}`,
              requestedBy: Number(request.requestedBy),
              reviewedBy: loggedInUserId,
              sourceBudgetRequestId: requestId
            });
          }
        }
        await connection.execute(
          `UPDATE task_budget_requests
           SET status = ?, authority_decision = ?, authority_reviewed_by = ?,
               authority_review_note = NULL, authority_reviewed_at = CURRENT_TIMESTAMP,
               reviewed_by = ?, review_note = NULL, reviewed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'PENDING' AND approval_stage = 'AUTHORITY'`,
          [decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            loggedInUserId, loggedInUserId, requestId]
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
    },
    async cancelTaskBudgetRequest(_: any, args: { requestId: number }, context: any) {
      const requestId = Number(args?.requestId);
      if (!Number.isInteger(requestId) || requestId <= 0) {
        throwEventError('BAD_REQUEST', 'requestId must be a positive integer');
      }

      const loggedInUserId = await getLoggedInUserId(context);
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [requestRows] = await connection.query<any[]>(
          `SELECT request.id, request.task_id AS taskId,
                  request.requested_amount AS requestedAmount,
                  request.requested_by AS requestedBy, request.status,
                  task.budget_amount AS currentBudget, task.status AS taskStatus,
                  task.event_id AS eventId,
                  task.owner_user_id AS ownerUserId, task.created_by AS createdBy,
                  DATE_FORMAT(task.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
           FROM task_budget_requests request
           INNER JOIN tasks task ON task.id = request.task_id
           WHERE request.id = ? FOR UPDATE`,
          [requestId]
        );
        const request = requestRows[0];
        if (!request) throwEventError('NOT_FOUND', 'Budget request not found');
        if (request.status !== 'PENDING') {
          throwEventError('CONFLICT', 'This budget request is no longer pending');
        }

        const isMasterAdmin = await hasPermission(
          loggedInUserId,
          PERMISSIONS.EVENT_TASK_MANAGE_ANY,
          { type: 'EVENT', id: Number(request.eventId) }
        );
        if (Number(request.requestedBy) !== loggedInUserId && !isMasterAdmin) {
          throwEventError('FORBIDDEN', 'Only the requester or a master admin can cancel this budget request');
        }

        await connection.execute(
          `UPDATE task_budget_requests
           SET status = 'CANCELLED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'PENDING'`,
          [loggedInUserId, requestId]
        );
        await connection.commit();
        return {
          budgetAmount: String(request.currentBudget),
          status: String(request.taskStatus),
          updatedAt: String(request.updatedAt),
          requestId,
          requestStatus: 'CANCELLED',
          requestedBudgetAmount: String(request.requestedAmount),
          canRequestBudgetIncrease: Number(request.ownerUserId) === loggedInUserId &&
            Number(request.createdBy) !== loggedInUserId &&
            !isMasterAdmin
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
