import { RowDataPacket } from 'mysql2/promise';
import { getConnection, query } from '../../config/db';
import {
  hasCommitteeTaskProgramCreationRole,
  hasTaskBudgetApprovalAuthority,
  hasTaskBudgetRequestReviewRole,
  hasPermission,
  PERMISSIONS
} from '../../authorization/authorization';
import { getLoggedInUserId, throwEventError } from '../events/details/voting/event-voting-core.graphql';
import { loadTodoReservationCapacity } from '../todos/todos.graphql';

const transactionTypes = [
  'ADVANCE_ISSUED',
  'ADVANCE_EXPENSE',
  'ADVANCE_RETURN'
] as const;

type TransactionType = typeof transactionTypes[number];

export async function getFinanceActionTaskIds(taskIds: number[]): Promise<Set<number>> {
  const ids = [...new Set(taskIds.filter((taskId) => Number.isInteger(taskId) && taskId > 0))];
  if (ids.length === 0) return new Set<number>();

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await query<Array<RowDataPacket & { taskId: number }>>(
    `SELECT taskId FROM (
       SELECT task_id AS taskId
       FROM task_finance_transactions
       WHERE task_id IN (${placeholders})
         AND transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING'
       UNION
       SELECT request.task_id AS taskId
       FROM task_finance_requests request
       LEFT JOIN task_finance_transactions payment
         ON payment.request_id = request.id
         AND payment.transaction_type = 'ADVANCE_ISSUED' AND payment.status = 'CONFIRMED'
       WHERE request.task_id IN (${placeholders})
         AND request.request_type IN ('ADVANCE', 'TOP_UP')
         AND request.status IN ('APPROVED', 'PARTIALLY_APPROVED')
       GROUP BY request.id, request.task_id, request.approved_amount
       HAVING COALESCE(request.approved_amount, 0) > COALESCE(SUM(payment.amount), 0)
     ) financeActions`,
    [...ids, ...ids]
  );
  return new Set(rows.map((row) => Number(row.taskId)));
}

export async function getAuthorityFinanceActionTaskIds(taskIds: number[]): Promise<Set<number>> {
  const ids = [...new Set(taskIds.filter((taskId) => Number.isInteger(taskId) && taskId > 0))];
  if (ids.length === 0) return new Set<number>();

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await query<Array<RowDataPacket & { taskId: number }>>(
    `SELECT DISTINCT task_id AS taskId
     FROM task_finance_requests
     WHERE task_id IN (${placeholders})
       AND request_type = 'ADVANCE'
       AND status = 'PENDING'
       AND approval_stage = 'AUTHORITY'`,
    ids
  );
  return new Set(rows.map((row) => Number(row.taskId)));
}

export async function getPendingReceiptTaskIds(taskIds: number[], userId: number): Promise<Set<number>> {
  const ids = [...new Set(taskIds.filter((taskId) => Number.isInteger(taskId) && taskId > 0))];
  if (ids.length === 0) return new Set<number>();

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await query<Array<RowDataPacket & { taskId: number }>>(
    `SELECT DISTINCT task_id AS taskId
     FROM task_finance_transactions
     WHERE task_id IN (${placeholders})
       AND recipient_user_id = ?
       AND received_at IS NULL
       AND transaction_type = 'ADVANCE_ISSUED' AND status = 'CONFIRMED'`,
    [...ids, userId]
  );
  return new Set(rows.map((row) => Number(row.taskId)));
}

export async function getFinanceParticipantTaskIds(taskIds: number[], userId: number): Promise<Set<number>> {
  const ids = [...new Set(taskIds.filter((taskId) => Number.isInteger(taskId) && taskId > 0))];
  if (ids.length === 0) return new Set<number>();

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await query<Array<RowDataPacket & { taskId: number }>>(
    `SELECT taskId FROM (
       SELECT task_id AS taskId
       FROM task_budget_requests
       WHERE task_id IN (${placeholders}) AND requested_by = ?
       UNION
       SELECT task_id AS taskId
       FROM task_finance_requests
       WHERE task_id IN (${placeholders}) AND requested_by = ?
       UNION
       SELECT task_id AS taskId
       FROM task_finance_transactions
       WHERE task_id IN (${placeholders}) AND recipient_user_id = ?
     ) financeParticipants`,
    [
      ...ids, userId,
      ...ids, userId,
      ...ids, userId
    ]
  );
  return new Set(rows.map((row) => Number(row.taskId)));
}

export const taskFinanceTypes = `
  enum TaskFinanceRequestType { ADVANCE TOP_UP }
  enum TaskFinanceRequestStatus { PENDING APPROVED PARTIALLY_APPROVED REJECTED }
  enum TaskFinanceTransactionType { ADVANCE_ISSUED ADVANCE_EXPENSE ADVANCE_RETURN }
  enum TaskFinanceTransactionStatus { RECORDED PENDING CONFIRMED REJECTED }
  type TaskFinanceRequest {
    id: Int!
    taskId: Int!
    isSubtask: Boolean!
    sourceBudgetRequestId: Int
    taskName: String!
    taskBudgetAmount: String!
    budgetAvailableForDisbursement: String!
    remainingSanctionedBudget: String!
    checklistExpenseAmount: String!
    taskOwnerName: String
    taskOwnerUserId: Int
    requestType: TaskFinanceRequestType!
    approvalStage: String!
    requestedAmount: String!
    approvedAmount: String
    reason: String!
    status: TaskFinanceRequestStatus!
    requestedByName: String!
    reviewedByName: String
    reviewNote: String
    authorityDecision: String
    authorityReviewedByName: String
    authorityReviewNote: String
    authorityReviewedAt: String
    canReviewAuthority: Boolean!
    createdAt: String!
    taskCreatedAt: String!
    reviewedAt: String
  }

  type TaskFinanceTransaction {
    id: Int!
    taskId: Int!
    isSubtask: Boolean!
    taskName: String!
    taskOwnerName: String
    requestId: Int
    transactionType: TaskFinanceTransactionType!
    amount: String!
    description: String!
    status: TaskFinanceTransactionStatus!
    checklistExpenseAmount: String!
    checklistReservedAmount: String!
    createdByName: String!
    confirmedByName: String
    createdAt: String!
    taskCreatedAt: String!
    confirmedAt: String
    recipientName: String
    receivedByName: String
    receivedAt: String
    canConfirmReceipt: Boolean!
    canConfirmReturn: Boolean!
    canCancel: Boolean!
  }

  type TaskBudgetRequest {
    id: Int!
    taskId: Int!
    isSubtask: Boolean!
    taskName: String!
    taskOwnerName: String
    taskCreatedByName: String
    taskBudgetAmount: String!
    remainingSanctionedBudget: String!
    checklistExpenseAmount: String!
    requestedAmount: String!
    budgetBeforeRequest: String!
    requestedIncrease: String!
    requestedByName: String!
    actionByName: String
    status: String!
    approvalStage: String!
    creatorDecision: String
    creatorReviewedByName: String
    creatorReviewerDesignation: String
    creatorReviewedAt: String
    authorityDecision: String
    authorityReviewedByName: String
    authorityReviewerDesignation: String
    authorityReviewedAt: String
    createdAt: String!
    taskCreatedAt: String!
    canReviewCreator: Boolean!
    canReviewAuthority: Boolean!
    canCancel: Boolean!
  }

  type TaskFinanceSummary {
    sanctionedBudget: String!
    checklistExpenses: String!
    checklistReserved: String!
    subtaskSpent: String!
    remainingBudget: String!
    advanceIssued: String!
    advanceSpent: String!
    returnPending: String!
    returnConfirmed: String!
    advanceBalance: String!
    availableInHand: String!
  }

  type TaskFinancePayload {
    requests: [TaskFinanceRequest!]!
    budgetRequests: [TaskBudgetRequest!]!
    transactions: [TaskFinanceTransaction!]!
    summary: TaskFinanceSummary!
    budgetAmount: String!
    budgetRequestId: Int
    requestedBudgetAmount: String
    budgetRequestStatus: String
    budgetRequestedByName: String
    canEditBudget: Boolean!
    canReduceBudget: Boolean!
    maxBudgetReduction: String!
    canRequestBudgetIncrease: Boolean!
    canReviewBudgetRequest: Boolean!
    canCancelBudgetRequest: Boolean!
    canRequest: Boolean!
    canApprove: Boolean!
    isBudgetAuthority: Boolean!
    canViewBudgetIncreaseRequests: Boolean!
    canViewTaskAssignee: Boolean!
    canViewCreatedSubtaskFinance: Boolean!
    isEventScope: Boolean!
  }

  input TaskFinanceReviewInput {
    requestId: Int!
    decision: String!
    note: String
  }

  input TaskFinanceTransactionInput {
    taskId: Int!
    transactionType: TaskFinanceTransactionType!
    amount: String!
    description: String
    requestId: Int
  }

  input TaskFinanceReturnReviewInput {
    transactionId: Int!
    decision: String!
    note: String
  }

`;

export const taskFinanceQueryFields = `
  taskFinance(taskId: Int!): TaskFinancePayload!
  eventTaskFinance(eventId: Int!): TaskFinancePayload!
  creatorSubtaskFinance(eventId: Int!, parentTaskId: Int!): TaskFinancePayload!
  creatorEventSubtaskFinance(eventId: Int!): TaskFinancePayload!
`;

export const taskFinanceMutationFields = `
  reviewTaskFinanceRequest(input: TaskFinanceReviewInput!): TaskFinanceRequest!
  recordTaskFinanceTransaction(input: TaskFinanceTransactionInput!): TaskFinanceTransaction!
  confirmTaskFinanceReceipt(transactionId: Int!): TaskFinanceTransaction!
  reviewTaskFinanceReturn(input: TaskFinanceReturnReviewInput!): TaskFinanceTransaction!
  cancelTaskFinanceReturn(transactionId: Int!): TaskFinanceTransaction!
`;

function parseAmount(value: unknown): { amount: string; cents: bigint } {
  const raw = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d{0,9})$/.test(raw)) {
    throwEventError('BAD_REQUEST', 'Amount must be a positive whole number of rupees');
  }
  const cents = BigInt(raw) * 100n;
  if (cents <= 0n) throwEventError('BAD_REQUEST', 'Amount must be greater than zero');
  return { amount: raw, cents };
}

function decimalCents(value: unknown): bigint {
  const raw = String(value ?? '0');
  const [whole, fraction = ''] = raw.split('.');
  return BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

async function loadTaskBudgetCapacityCents(
  taskIds: number[]
): Promise<Map<number, {
  available: bigint;
  reducible: bigint;
  checklistExpenses: bigint;
  checklistReserved: bigint;
  checklistBudgetUsage: bigint;
}>> {
  const ids = [...new Set(taskIds.filter((taskId) => Number.isInteger(taskId) && taskId > 0))];
  if (ids.length === 0) {
    return new Map<number, {
      available: bigint;
      reducible: bigint;
      checklistExpenses: bigint;
      checklistReserved: bigint;
      checklistBudgetUsage: bigint;
    }>();
  }
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await query<any[]>(
    `SELECT task.id AS taskId,
            CAST(COALESCE(expenses.checklistExpenses, 0) AS CHAR) AS checklistExpenses,
            CAST(COALESCE(expenses.checklistReserved, 0) AS CHAR) AS checklistReserved,
            CAST(COALESCE(expenses.checklistBudgetUsage, 0) AS CHAR) AS checklistBudgetUsage,
            CAST(GREATEST(0, task.budget_amount - GREATEST(
              COALESCE(expenses.checklistBudgetUsage, 0) + COALESCE(children.allocated, 0),
              GREATEST(
                0,
                COALESCE(cash.issued, 0) - COALESCE(cash.returned, 0)
              )
            )) AS CHAR) AS budgetAvailable,
            CAST(GREATEST(
              0,
              task.budget_amount - COALESCE(expenses.checklistBudgetUsage, 0) - COALESCE(children.allocated, 0)
            ) AS CHAR) AS budgetReducible
     FROM tasks task
     LEFT JOIN (
       SELECT task_id,
              SUM(CASE
                WHEN expense_status = 'CONFIRMED' OR status <> 'CANCELLED'
                THEN expense_amount ELSE 0
              END) AS checklistBudgetUsage,
              SUM(CASE WHEN expense_status = 'CONFIRMED' THEN expense_amount ELSE 0 END) AS checklistExpenses,
              SUM(CASE
                WHEN expense_status = 'RESERVED' AND status <> 'CANCELLED'
                THEN expense_amount ELSE 0
              END) AS checklistReserved
       FROM todos
       WHERE task_id IN (${placeholders})
       GROUP BY task_id
     ) expenses ON expenses.task_id = task.id
     LEFT JOIN (
       SELECT parent_id, SUM(budget_amount) AS allocated
       FROM tasks
       WHERE parent_id IN (${placeholders})
       GROUP BY parent_id
     ) children ON children.parent_id = task.id
     LEFT JOIN (
       SELECT task_id,
              SUM(CASE WHEN transaction_type = 'ADVANCE_ISSUED' AND status = 'CONFIRMED' THEN amount ELSE 0 END) AS issued,
              SUM(CASE WHEN transaction_type = 'ADVANCE_RETURN' AND status IN ('PENDING', 'CONFIRMED') THEN amount ELSE 0 END) AS returned
       FROM task_finance_transactions
       WHERE task_id IN (${placeholders})
       GROUP BY task_id
     ) cash ON cash.task_id = task.id
     WHERE task.id IN (${placeholders})`,
    [...ids, ...ids, ...ids, ...ids]
  );
  return new Map(rows.map((row) => [Number(row.taskId), {
    available: decimalCents(row.budgetAvailable),
    reducible: decimalCents(row.budgetReducible),
    checklistExpenses: decimalCents(row.checklistExpenses),
    checklistReserved: decimalCents(row.checklistReserved),
    checklistBudgetUsage: decimalCents(row.checklistBudgetUsage)
  }]));
}

function centsToWholeRupees(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  const rounded = (absolute + 50n) / 100n;
  return String(value < 0n ? -rounded : rounded);
}

function cleanText(value: unknown, field: string, maximum = 1000): string {
  const text = String(value ?? '').trim();
  if (!text || text.length > maximum) {
    throwEventError('BAD_REQUEST', `${field} is required and must be at most ${maximum} characters`);
  }
  return text;
}

async function getFinanceAccess(taskId: number, userId: number, allowReadOnly = false): Promise<{
  taskId: number;
  eventId: number;
  parentTaskId: number | null;
  ownerUserId: number | null;
  createdBy: number;
  isOwner: boolean;
  isSubtaskCreator: boolean;
  isCashier: boolean;
  isBudgetAuthority: boolean;
  isMasterAdmin: boolean;
  isCommitteeTaskManager: boolean;
  isParticipant: boolean;
  canViewCreatedSubtaskFinance: boolean;
}> {
  if (!Number.isInteger(taskId) || taskId <= 0) throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
  const tasks = await query<Array<RowDataPacket & {
    taskId: number;
    eventId: number;
    parentTaskId: number | null;
    ownerUserId: number | null;
    createdBy: number;
    committeeId: number;
  }>>(
    `SELECT task.id AS taskId, task.event_id AS eventId,
            task.owner_user_id AS ownerUserId, task.created_by AS createdBy,
            task.parent_id AS parentTaskId,
            event.committee_id AS committeeId
     FROM tasks task
     INNER JOIN events event ON event.id = task.event_id
     WHERE task.id = ? LIMIT 1`,
    [taskId]
  );
  const task = tasks[0];
  if (!task) throwEventError('NOT_FOUND', 'Task not found');
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
    [Number(task.eventId), userId]
  );
  const isOwner = Number(task.ownerUserId) === userId;
  const isCashier = Number(cashierRows[0]?.isCashier) === 1;
  const isBudgetAuthority = await hasTaskBudgetApprovalAuthority(userId, Number(task.eventId));
  const isMasterAdmin = await hasPermission(
    userId,
    PERMISSIONS.EVENT_TASK_MANAGE_ANY,
    { type: 'EVENT', id: Number(task.eventId) }
  );
  const isCommitteeTaskManager = await hasCommitteeTaskProgramCreationRole(
    userId,
    Number(task.committeeId)
  );
  const isParticipant = (await getFinanceParticipantTaskIds([taskId], userId)).has(taskId);
  const isCreator = Number(task.createdBy) === userId;
  const isSubtaskCreator = task.parentTaskId !== null && isCreator;
  const createdSubtaskRows = allowReadOnly
    ? await query<any[]>(
        `SELECT id FROM tasks WHERE parent_id = ? AND created_by = ? LIMIT 1`,
        [taskId, userId]
      )
    : [];
  const createdSubtaskFinanceViewer = createdSubtaskRows.length > 0;
  if (allowReadOnly && !isOwner && !isCashier && !isCreator &&
      !isBudgetAuthority && !isMasterAdmin && !isCommitteeTaskManager && !isParticipant &&
      !createdSubtaskFinanceViewer) {
    throwEventError('FORBIDDEN', 'You are not allowed to view this task finance information');
  }
  if (!allowReadOnly && !isOwner && !isCashier && !isSubtaskCreator) {
    throwEventError('FORBIDDEN', 'Only the task owner, subtask creator, or assigned event treasurer can perform task finance actions');
  }
  return {
    taskId: Number(task.taskId),
    eventId: Number(task.eventId),
    parentTaskId: task.parentTaskId === null ? null : Number(task.parentTaskId),
    ownerUserId: task.ownerUserId === null ? null : Number(task.ownerUserId),
    createdBy: Number(task.createdBy),
    isOwner,
    isSubtaskCreator,
    isCashier,
    isBudgetAuthority,
    isMasterAdmin,
    isCommitteeTaskManager,
    isParticipant,
    canViewCreatedSubtaskFinance: createdSubtaskFinanceViewer
  };
}

async function getRequestAccess(requestId: number, userId: number, allowReadOnly = false) {
  const rows = await query<Array<RowDataPacket & { taskId: number }>>(
    `SELECT task_id AS taskId FROM task_finance_requests WHERE id = ? LIMIT 1`,
    [requestId]
  );
  if (!rows[0]) throwEventError('NOT_FOUND', 'Finance request not found');
  return getFinanceAccess(Number(rows[0].taskId), userId, allowReadOnly);
}

async function getTransactionAccess(transactionId: number, userId: number) {
  const rows = await query<Array<RowDataPacket & { taskId: number }>>(
    `SELECT task_id AS taskId FROM task_finance_transactions WHERE id = ? LIMIT 1`,
    [transactionId]
  );
  if (!rows[0]) throwEventError('NOT_FOUND', 'Finance transaction not found');
  return getFinanceAccess(Number(rows[0].taskId), userId);
}

async function loadRequest(requestId: number, userId: number): Promise<any> {
  const access = await getRequestAccess(requestId, userId, true);
  const rows = await query<any[]>(
    `SELECT r.id, r.task_id AS taskId,
            task.parent_id AS parentTaskId,
            r.source_budget_request_id AS sourceBudgetRequestId,
           COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
            CAST(task.budget_amount AS CHAR) AS taskBudgetAmount,
            taskOwner.name AS taskOwnerName,
           task.owner_user_id AS taskOwnerUserId,
            r.request_type AS requestType, r.approval_stage AS approvalStage,
            CAST(r.requested_amount AS CHAR) AS requestedAmount,
            CAST(r.approved_amount AS CHAR) AS approvedAmount, r.reason, r.status,
            requester.name AS requestedByName, reviewer.name AS reviewedByName, r.review_note AS reviewNote,
            r.authority_decision AS authorityDecision,
            authorityReviewer.name AS authorityReviewedByName,
            r.authority_review_note AS authorityReviewNote,
            DATE_FORMAT(r.authority_reviewed_at, '%Y-%m-%d %H:%i:%s') AS authorityReviewedAt,
            DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
            DATE_FORMAT(task.created_at, '%Y-%m-%d %H:%i:%s') AS taskCreatedAt,
            DATE_FORMAT(r.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewedAt
     FROM task_finance_requests r
     INNER JOIN tasks task ON task.id = r.task_id
     INNER JOIN users requester ON requester.id = r.requested_by
     LEFT JOIN users taskOwner ON taskOwner.id = task.owner_user_id
     LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
     LEFT JOIN users authorityReviewer ON authorityReviewer.id = r.authority_reviewed_by
     WHERE r.id = ?`,
    [requestId]
  );
  const request = rows[0];
  if (!request) throwEventError('NOT_FOUND', 'Finance request not found');
  const capacityByTask = await loadTaskBudgetCapacityCents([Number(request.taskId)]);
  return {
    ...request,
    isSubtask: request.parentTaskId !== null,
    budgetAvailableForDisbursement: centsToWholeRupees(
      capacityByTask.get(Number(request.taskId))?.available ?? 0n
    ),
    remainingSanctionedBudget: centsToWholeRupees(
      capacityByTask.get(Number(request.taskId))?.reducible ?? 0n
    ),
    checklistExpenseAmount: centsToWholeRupees(
      capacityByTask.get(Number(request.taskId))?.checklistExpenses ?? 0n
    ),
    canReviewAuthority: request.status === 'PENDING' &&
      request.approvalStage === 'AUTHORITY' &&
      request.requestType === 'ADVANCE' &&
      access.isBudgetAuthority &&
      access.parentTaskId === null &&
      !access.isOwner,
  };
}

async function loadTransaction(transactionId: number, userId: number): Promise<any> {
  const rows = await query<any[]>(
    `SELECT t.id, t.task_id AS taskId,
            task.parent_id AS parentTaskId,
            COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
    taskOwner.name AS taskOwnerName,
            t.request_id AS requestId, t.transaction_type AS transactionType,
            CAST(t.amount AS CHAR) AS amount, t.description, t.status,
            creator.name AS createdByName, confirmer.name AS confirmedByName,
            DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
            DATE_FORMAT(task.created_at, '%Y-%m-%d %H:%i:%s') AS taskCreatedAt,
            DATE_FORMAT(t.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt,
            recipient.name AS recipientName, receiver.name AS receivedByName,
            DATE_FORMAT(t.received_at, '%Y-%m-%d %H:%i:%s') AS receivedAt,
            t.recipient_user_id AS recipientUserId
     FROM task_finance_transactions t
     INNER JOIN tasks task ON task.id = t.task_id
     INNER JOIN users creator ON creator.id = t.created_by
     LEFT JOIN users taskOwner ON taskOwner.id = task.owner_user_id
     LEFT JOIN users confirmer ON confirmer.id = t.confirmed_by
     LEFT JOIN users recipient ON recipient.id = t.recipient_user_id
     LEFT JOIN users receiver ON receiver.id = t.received_by
     WHERE t.id = ?`,
    [transactionId]
  );
  const transaction = rows[0];
  if (!transaction) return transaction;
  const isPayment = transaction.transactionType === 'ADVANCE_ISSUED';
  const access = await getTransactionAccess(transactionId, userId);
  const capacity = (await loadTaskBudgetCapacityCents([Number(transaction.taskId)]))
    .get(Number(transaction.taskId));
  return {
    ...transaction,
    isSubtask: transaction.parentTaskId !== null,
    checklistExpenseAmount: centsToWholeRupees(capacity?.checklistExpenses ?? 0n),
    checklistReservedAmount: centsToWholeRupees(capacity?.checklistReserved ?? 0n),
    canConfirmReceipt: isPayment
      && transaction.receivedAt === null
      && Number(transaction.recipientUserId) === userId,
    canConfirmReturn: transaction.transactionType === 'ADVANCE_RETURN' &&
      transaction.status === 'PENDING' &&
      (access.parentTaskId === null
        ? access.isCashier && !access.isOwner
        : access.isSubtaskCreator),
    canCancel: transaction.transactionType === 'ADVANCE_RETURN' &&
      transaction.status === 'PENDING' &&
      access.isOwner
  };
}

async function loadBudgetRequests(
  userId: number,
  access: {
    isBudgetAuthority: boolean;
    isCashier: boolean;
    isMasterAdmin: boolean;
    isCommitteeTaskManager?: boolean;
  },
  taskId?: number,
  eventId?: number,
  creatorParentTaskId?: number,
  creatorEventScope = false
): Promise<any[]> {
  const isEventScope = eventId !== undefined;
  const isCreatedSubtaskScope = creatorParentTaskId !== undefined;
  const scopeFilter = isCreatedSubtaskScope
    ? `task.event_id = ? AND task.parent_id = ? AND task.created_by = ?`
    : creatorEventScope
    ? 'task.event_id = ? AND task.parent_id IS NOT NULL AND task.created_by = ?'
    : isEventScope
    ? `task.event_id = ? AND task.parent_id IS NULL
       AND (? = 1 OR task.owner_user_id = ? OR task.created_by = ? OR request.requested_by = ?)`
    : 'request.task_id = ?';
  const scopeParams = isCreatedSubtaskScope
    ? [Number(eventId), Number(creatorParentTaskId), userId]
    : creatorEventScope
    ? [Number(eventId), userId]
    : isEventScope
    ? [
      Number(eventId),
      access.isBudgetAuthority || access.isCashier || access.isMasterAdmin ||
        access.isCommitteeTaskManager ? 1 : 0,
      userId,
      userId,
      userId
    ]
    : [Number(taskId)];
  const rows = await query<any[]>(
    `SELECT request.id, request.task_id AS taskId,
            task.parent_id AS parentTaskId,
            COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
            taskOwner.name AS taskOwnerName,
            taskCreator.name AS taskCreatedByName,
            CAST(task.budget_amount AS CHAR) AS taskBudgetAmount,
            CAST(request.requested_amount AS CHAR) AS requestedAmount,
            CAST(request.budget_before_request AS CHAR) AS budgetBeforeRequest,
            request.requested_by AS requestedBy,
            requester.name AS requestedByName,
            actioner.name AS actionByName,
            request.status, request.approval_stage AS approvalStage,
            request.creator_decision AS creatorDecision,
            creatorReviewer.name AS creatorReviewedByName,
            CASE
              WHEN creatorReviewerCommittee.committee_role = 'COMMITTEE_MASTER_ADMIN' THEN 'Committee Master Admin'
              WHEN creatorReviewerCommittee.committee_role = 'COMMITTEE_ADMIN' THEN 'Committee Admin'
              ELSE COALESCE(NULLIF(TRIM(creatorReviewerRole.english_name), ''),
                            NULLIF(TRIM(creatorReviewerRole.role_name), ''),
                            NULLIF(TRIM(creatorReviewerUE.designation), ''))
            END AS creatorReviewerDesignation,
            DATE_FORMAT(request.creator_reviewed_at, '%Y-%m-%d %H:%i:%s') AS creatorReviewedAt,
            request.authority_decision AS authorityDecision,
            authorityReviewer.name AS authorityReviewedByName,
            CASE
              WHEN authorityReviewerCommittee.committee_role = 'COMMITTEE_MASTER_ADMIN' THEN 'Committee Master Admin'
              WHEN authorityReviewerCommittee.committee_role = 'COMMITTEE_ADMIN' THEN 'Committee Admin'
              ELSE COALESCE(NULLIF(TRIM(authorityReviewerRole.english_name), ''),
                            NULLIF(TRIM(authorityReviewerRole.role_name), ''),
                            NULLIF(TRIM(authorityReviewerUE.designation), ''))
            END AS authorityReviewerDesignation,
            DATE_FORMAT(request.authority_reviewed_at, '%Y-%m-%d %H:%i:%s') AS authorityReviewedAt,
            DATE_FORMAT(request.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
            DATE_FORMAT(task.created_at, '%Y-%m-%d %H:%i:%s') AS taskCreatedAt,
            task.created_by AS taskCreatedBy
     FROM task_budget_requests request
     INNER JOIN tasks task ON task.id = request.task_id
     INNER JOIN events event ON event.id = task.event_id
     INNER JOIN users requester ON requester.id = request.requested_by
     LEFT JOIN users taskOwner ON taskOwner.id = task.owner_user_id
     LEFT JOIN users taskCreator ON taskCreator.id = task.created_by
     LEFT JOIN users actioner ON actioner.id = request.reviewed_by
     LEFT JOIN users creatorReviewer ON creatorReviewer.id = request.creator_reviewed_by
     LEFT JOIN users_events creatorReviewerUE
       ON creatorReviewerUE.event_id = task.event_id AND creatorReviewerUE.user_id = request.creator_reviewed_by
     LEFT JOIN events_roles_master creatorReviewerRole
       ON creatorReviewerRole.role_id = creatorReviewerUE.role_id
     LEFT JOIN users_committees creatorReviewerCommittee
       ON creatorReviewerCommittee.committee_id = event.committee_id
      AND creatorReviewerCommittee.user_id = request.creator_reviewed_by
     LEFT JOIN users authorityReviewer ON authorityReviewer.id = request.authority_reviewed_by
     LEFT JOIN users_events authorityReviewerUE
       ON authorityReviewerUE.event_id = task.event_id AND authorityReviewerUE.user_id = request.authority_reviewed_by
     LEFT JOIN events_roles_master authorityReviewerRole
       ON authorityReviewerRole.role_id = authorityReviewerUE.role_id
     LEFT JOIN users_committees authorityReviewerCommittee
       ON authorityReviewerCommittee.committee_id = event.committee_id
      AND authorityReviewerCommittee.user_id = request.authority_reviewed_by
     WHERE ${scopeFilter}
     ORDER BY request.created_at DESC, request.id DESC`,
    scopeParams
  );
  const visibleRows = access.isCashier
    ? rows.filter((request) =>
        request.status !== 'PENDING' ||
        decimalCents(request.requestedAmount) >= decimalCents(request.budgetBeforeRequest)
      )
    : rows;
  const remainingBudgetByTask = await loadTaskBudgetCapacityCents(
    visibleRows.map((request) => Number(request.taskId))
  );
  return visibleRows.map((request) => {
    const requestedCents = decimalCents(request.requestedAmount);
    const baselineCents = decimalCents(request.budgetBeforeRequest);
    return {
      id: Number(request.id),
      taskId: Number(request.taskId),
      isSubtask: request.parentTaskId !== null,
      taskName: String(request.taskName || 'Untitled Task'),
      taskOwnerName: request.taskOwnerName || null,
      taskCreatedByName: request.taskCreatedByName || null,
      taskBudgetAmount: String(request.taskBudgetAmount),
      remainingSanctionedBudget: centsToWholeRupees(
        remainingBudgetByTask.get(Number(request.taskId))?.reducible ?? 0n
      ),
      checklistExpenseAmount: centsToWholeRupees(
        remainingBudgetByTask.get(Number(request.taskId))?.checklistExpenses ?? 0n
      ),
      requestedAmount: String(request.requestedAmount),
      budgetBeforeRequest: String(request.budgetBeforeRequest),
      requestedIncrease: centsToWholeRupees(requestedCents - baselineCents),
      requestedByName: String(request.requestedByName || ''),
      actionByName: request.actionByName || null,
      status: String(request.status),
      approvalStage: String(request.approvalStage),
      creatorDecision: request.creatorDecision || null,
      creatorReviewedByName: request.creatorReviewedByName || null,
      creatorReviewerDesignation: request.creatorReviewerDesignation || null,
      creatorReviewedAt: request.creatorReviewedAt || null,
      authorityDecision: request.authorityDecision || null,
      authorityReviewedByName: request.authorityReviewedByName || null,
      authorityReviewerDesignation: request.authorityReviewerDesignation || null,
      authorityReviewedAt: request.authorityReviewedAt || null,
      createdAt: String(request.createdAt),
      taskCreatedAt: String(request.taskCreatedAt),
      canReviewCreator: request.status === 'PENDING' &&
        request.approvalStage === 'CREATOR' &&
        Number(request.taskCreatedBy) === userId,
      canReviewAuthority: request.status === 'PENDING' &&
        request.approvalStage === 'AUTHORITY' &&
        request.parentTaskId === null &&
        access.isBudgetAuthority,
      canCancel: request.status === 'PENDING' &&
        (Number(request.requestedBy) === userId || access.isMasterAdmin)
    };
  });
}

async function loadFinance(taskId: number, userId: number): Promise<any> {
  const access = await getFinanceAccess(taskId, userId, true);
  const [
    requests,
    budgetRequests,
    transactions,
    aggregates,
    taskRows,
    todoExpenseRows,
    childBudgetRows
  ] = await Promise.all([
    query<any[]>(
      `SELECT r.id, r.task_id AS taskId,
              task.parent_id AS parentTaskId,
              r.source_budget_request_id AS sourceBudgetRequestId,
              COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
              CAST(task.budget_amount AS CHAR) AS taskBudgetAmount,
              taskOwner.name AS taskOwnerName,
              task.owner_user_id AS taskOwnerUserId,
              r.request_type AS requestType, r.approval_stage AS approvalStage,
              CAST(r.requested_amount AS CHAR) AS requestedAmount,
              CAST(r.approved_amount AS CHAR) AS approvedAmount, r.reason, r.status,
              requester.name AS requestedByName, reviewer.name AS reviewedByName, r.review_note AS reviewNote,
              r.authority_decision AS authorityDecision,
              authorityReviewer.name AS authorityReviewedByName,
              r.authority_review_note AS authorityReviewNote,
              DATE_FORMAT(r.authority_reviewed_at, '%Y-%m-%d %H:%i:%s') AS authorityReviewedAt,
              DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              DATE_FORMAT(task.created_at, '%Y-%m-%d %H:%i:%s') AS taskCreatedAt,
              DATE_FORMAT(r.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewedAt
       FROM task_finance_requests r
       INNER JOIN tasks task ON task.id = r.task_id
       INNER JOIN users requester ON requester.id = r.requested_by
       LEFT JOIN users taskOwner ON taskOwner.id = task.owner_user_id
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       LEFT JOIN users authorityReviewer ON authorityReviewer.id = r.authority_reviewed_by
       WHERE r.task_id = ? AND r.request_type IN ('ADVANCE', 'TOP_UP')
       ORDER BY r.created_at DESC, r.id DESC`,
      [taskId]
    ),
    loadBudgetRequests(userId, access, taskId),
    query<any[]>(
      `SELECT t.id, t.task_id AS taskId,
              task.parent_id AS parentTaskId,
              COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
              taskOwner.name AS taskOwnerName,
              t.request_id AS requestId, t.transaction_type AS transactionType,
              CAST(t.amount AS CHAR) AS amount, t.description, t.status,
              creator.name AS createdByName, confirmer.name AS confirmedByName,
              DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              DATE_FORMAT(task.created_at, '%Y-%m-%d %H:%i:%s') AS taskCreatedAt,
              DATE_FORMAT(t.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt,
              recipient.name AS recipientName, receiver.name AS receivedByName,
              DATE_FORMAT(t.received_at, '%Y-%m-%d %H:%i:%s') AS receivedAt,
              t.recipient_user_id AS recipientUserId
       FROM task_finance_transactions t
       INNER JOIN tasks task ON task.id = t.task_id
       INNER JOIN users creator ON creator.id = t.created_by
       LEFT JOIN users taskOwner ON taskOwner.id = task.owner_user_id
       LEFT JOIN users confirmer ON confirmer.id = t.confirmed_by
       LEFT JOIN users recipient ON recipient.id = t.recipient_user_id
       LEFT JOIN users receiver ON receiver.id = t.received_by
       WHERE t.task_id = ?
         AND t.transaction_type IN ('ADVANCE_ISSUED', 'ADVANCE_EXPENSE', 'ADVANCE_RETURN')
         AND (
           ? = 1 OR ? = 1 OR t.transaction_type <> 'ADVANCE_RETURN' OR t.status <> 'PENDING'
         )
       ORDER BY t.created_at DESC, t.id DESC`,
      [taskId, access.isCashier ? 1 : 0, access.isOwner ? 1 : 0]
    ),
    query<any[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_ISSUED' AND status = 'CONFIRMED' THEN amount ELSE 0 END), 0) AS advanceIssued,
         COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_EXPENSE' AND status = 'CONFIRMED' THEN amount ELSE 0 END), 0) AS advanceSpent,
         COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING' THEN amount ELSE 0 END), 0) AS returnPending,
         COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_RETURN' AND status = 'CONFIRMED' THEN amount ELSE 0 END), 0) AS returnConfirmed
       FROM task_finance_transactions WHERE task_id = ?`,
      [taskId]
    ),
    query<any[]>(
      `SELECT CAST(task.budget_amount AS CHAR) AS sanctionedBudget,
              task.parent_id AS parentTaskId,
              task.created_by AS createdBy,
              budgetRequest.id AS budgetRequestId,
              CAST(GREATEST(0, budgetRequest.requested_amount - task.budget_amount) AS CHAR) AS requestedBudgetAmount,
              budgetRequest.status AS budgetRequestStatus,
              budgetRequest.approval_stage AS budgetApprovalStage,
              budgetRequest.requested_by AS budgetRequestedBy,
              requester.name AS budgetRequestedByName
       FROM tasks task
       LEFT JOIN task_budget_requests budgetRequest
         ON budgetRequest.task_id = task.id AND budgetRequest.status = 'PENDING'
       LEFT JOIN users requester ON requester.id = budgetRequest.requested_by
       WHERE task.id = ? LIMIT 1`,
      [taskId]
    ),
    query<any[]>(
      `WITH RECURSIVE task_tree (id) AS (
         SELECT id FROM tasks WHERE id = ?
         UNION ALL
         SELECT child.id FROM tasks child
         INNER JOIN task_tree parent ON child.parent_id = parent.id
       )
       SELECT
         CAST(COALESCE(SUM(CASE
           WHEN todo.expense_status = 'CONFIRMED' THEN todo.expense_amount ELSE 0
         END), 0) AS CHAR) AS checklistExpenses,
         CAST(COALESCE(SUM(CASE
           WHEN todo.expense_status = 'RESERVED' AND todo.status <> 'CANCELLED'
           THEN todo.expense_amount ELSE 0
         END), 0) AS CHAR) AS checklistReserved
       FROM todos todo
       INNER JOIN task_tree ON task_tree.id = todo.task_id`,
      [taskId]
    ),
    query<any[]>(
      `SELECT CAST(COALESCE(SUM(budget_amount), 0) AS CHAR) AS allocatedChildBudgets
       FROM tasks WHERE parent_id = ?`,
      [taskId]
    ),
  ]);
  const capacityByTask = await loadTaskBudgetCapacityCents([taskId]);
  const taskBudgetCapacity = capacityByTask.get(taskId);
  const budgetAvailableForDisbursement = taskBudgetCapacity?.available ?? 0n;
  const financeRequests = requests.map((request: any) => ({
    ...request,
    isSubtask: request.parentTaskId !== null,
    budgetAvailableForDisbursement: centsToWholeRupees(budgetAvailableForDisbursement),
    remainingSanctionedBudget: centsToWholeRupees(taskBudgetCapacity?.reducible ?? 0n),
    checklistExpenseAmount: centsToWholeRupees(taskBudgetCapacity?.checklistExpenses ?? 0n),
    canReviewAuthority: request.status === 'PENDING' &&
      request.approvalStage === 'AUTHORITY' &&
      request.requestType === 'ADVANCE' &&
      access.isBudgetAuthority &&
      access.parentTaskId === null &&
      !access.isOwner
  }));
  const financeTransactions = transactions.map((transaction) => {
    const isPayment = transaction.transactionType === 'ADVANCE_ISSUED';
    const { recipientUserId, ...visibleTransaction } = transaction;
    const canConfirmReceipt = isPayment
      && transaction.receivedAt === null
      && Number(recipientUserId) === userId;
    const canConfirmReturn = transaction.transactionType === 'ADVANCE_RETURN' &&
      transaction.status === 'PENDING' &&
      (access.parentTaskId === null
        ? access.isCashier && !access.isOwner
        : access.isSubtaskCreator);
    const canCancel = transaction.transactionType === 'ADVANCE_RETURN' &&
      transaction.status === 'PENDING' &&
      access.isOwner;
    return {
      ...visibleTransaction,
      isSubtask: transaction.parentTaskId !== null,
      checklistExpenseAmount: centsToWholeRupees(taskBudgetCapacity?.checklistExpenses ?? 0n),
      checklistReservedAmount: centsToWholeRupees(taskBudgetCapacity?.checklistReserved ?? 0n),
      canConfirmReceipt,
      canConfirmReturn,
      canCancel
    };
  });
  const aggregate = aggregates[0] ?? {};
  const advanceIssued = decimalCents(aggregate.advanceIssued);
  const advanceSpent = decimalCents(aggregate.advanceSpent);
  const returnPending = decimalCents(aggregate.returnPending);
  const returnConfirmed = decimalCents(aggregate.returnConfirmed);
  const taskBudget = taskRows[0] ?? {};
  const sanctionedBudget = decimalCents(taskBudget.sanctionedBudget);
  const checklistExpenses = decimalCents(todoExpenseRows[0]?.checklistExpenses);
  const checklistReserved = decimalCents(todoExpenseRows[0]?.checklistReserved);
  const directChecklistExpenses = taskBudgetCapacity?.checklistExpenses ?? 0n;
  const directChecklistReserved = taskBudgetCapacity?.checklistReserved ?? 0n;
  const advanceBalance =
    advanceIssued - advanceSpent - returnConfirmed - directChecklistExpenses;
  const availableInHand =
    advanceBalance - returnPending - directChecklistReserved;
  const allocatedChildBudgets = decimalCents(childBudgetRows[0]?.allocatedChildBudgets);
  const maxBudgetReduction = taskBudgetCapacity?.reducible ?? 0n;
  const isMasterAdmin = access.isMasterAdmin;
  const canViewBudgetIncreaseRequests = await hasTaskBudgetRequestReviewRole(
    userId,
    access.eventId
  );
  const canEditBudget = taskBudget.parentTaskId === null &&
    (Number(taskBudget.createdBy) === userId || isMasterAdmin || access.isCommitteeTaskManager);
  const canReduceBudget = isMasterAdmin || access.isCommitteeTaskManager;
  const budgetRequestId = taskBudget.budgetRequestId === null
    ? null
    : Number(taskBudget.budgetRequestId);
  return {
    requests: financeRequests,
    budgetRequests,
    transactions: financeTransactions,
    summary: {
      sanctionedBudget: centsToWholeRupees(sanctionedBudget),
      checklistExpenses: centsToWholeRupees(checklistExpenses),
      checklistReserved: centsToWholeRupees(checklistReserved),
      subtaskSpent: centsToWholeRupees(allocatedChildBudgets),
      remainingBudget: centsToWholeRupees(sanctionedBudget - checklistExpenses),
      advanceIssued: centsToWholeRupees(advanceIssued),
      advanceSpent: centsToWholeRupees(advanceSpent),
      returnPending: centsToWholeRupees(returnPending),
      returnConfirmed: centsToWholeRupees(returnConfirmed),
      advanceBalance: centsToWholeRupees(advanceBalance > 0n ? advanceBalance : 0n),
      availableInHand: centsToWholeRupees(availableInHand > 0n ? availableInHand : 0n)
    },
    budgetAmount: String(taskBudget.sanctionedBudget),
    canReduceBudget,
    maxBudgetReduction: centsToWholeRupees(maxBudgetReduction),
    budgetRequestId,
    requestedBudgetAmount: taskBudget.requestedBudgetAmount === null
      ? null
      : String(taskBudget.requestedBudgetAmount),
    budgetRequestStatus: taskBudget.budgetRequestStatus || null,
    budgetRequestedByName: taskBudget.budgetRequestedByName || null,
    canEditBudget,
    canRequestBudgetIncrease: access.isOwner &&
      Number(taskBudget.createdBy) !== userId &&
      !isMasterAdmin &&
      (taskBudget.parentTaskId !== null || !access.isCommitteeTaskManager),
    canReviewBudgetRequest: budgetRequests.some((request) =>
      request.canReviewCreator || request.canReviewAuthority
    ),
    canCancelBudgetRequest: budgetRequestId !== null && (
      Number(taskBudget.budgetRequestedBy) === userId || isMasterAdmin
    ),
    canRequest: access.isOwner,
    canApprove: (access.isCashier && taskBudget.parentTaskId === null && !access.isOwner) ||
      access.isSubtaskCreator,
    isBudgetAuthority: access.isBudgetAuthority,
    canViewBudgetIncreaseRequests,
    canViewTaskAssignee: access.isMasterAdmin ||
      access.isCommitteeTaskManager ||
      access.isBudgetAuthority,
    canViewCreatedSubtaskFinance: access.canViewCreatedSubtaskFinance,
    isEventScope: false
  };
}

async function loadEventFinance(
  eventId: number,
  userId: number,
  creatorParentTaskId?: number,
  creatorEventScope = false
): Promise<any> {
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throwEventError('BAD_REQUEST', 'eventId must be a positive integer');
  }
  const eventRows = await query<any[]>(
    `SELECT id, committee_id AS committeeId
     FROM events WHERE id = ? LIMIT 1`,
    [eventId]
  );
  const event = eventRows[0];
  if (!event) throwEventError('NOT_FOUND', 'Event not found');
  const isCreatedSubtaskScope = creatorParentTaskId !== undefined;
  const isCreatorScope = isCreatedSubtaskScope || creatorEventScope;
  if (isCreatedSubtaskScope) {
    if (!Number.isInteger(creatorParentTaskId) || creatorParentTaskId! <= 0) {
      throwEventError('BAD_REQUEST', 'parentTaskId must be a positive integer');
    }
    const parentRows = await query<any[]>(
      `SELECT id FROM tasks WHERE id = ? AND event_id = ? LIMIT 1`,
      [creatorParentTaskId, eventId]
    );
    if (parentRows.length === 0) throwEventError('NOT_FOUND', 'Parent task not found');
    const createdSubtaskRows = await query<any[]>(
      `SELECT id
       FROM tasks
       WHERE parent_id = ? AND created_by = ?
       LIMIT 1`,
      [creatorParentTaskId, userId]
    );
    if (createdSubtaskRows.length === 0) {
      throwEventError('FORBIDDEN', 'You have no subtasks created under this task');
    }
  }
  if (creatorEventScope) {
    const createdSubtaskRows = await query<any[]>(
      `SELECT id
       FROM tasks
       WHERE event_id = ? AND parent_id IS NOT NULL AND created_by = ?
       LIMIT 1`,
      [eventId, userId]
    );
    if (createdSubtaskRows.length === 0) {
      throwEventError('FORBIDDEN', 'You have no subtasks created for this event');
    }
  }

  const isMasterAdmin = await hasPermission(
    userId,
    PERMISSIONS.EVENT_TASK_MANAGE_ANY,
    { type: 'EVENT', id: eventId }
  );
  const isCommitteeTaskManager = await hasCommitteeTaskProgramCreationRole(
    userId,
    Number(event.committeeId)
  );
  const isBudgetAuthority = await hasTaskBudgetApprovalAuthority(userId, eventId);
  const canViewBudgetIncreaseRequests = await hasTaskBudgetRequestReviewRole(userId, eventId);
  const cashierRows = await query<any[]>(
    `SELECT EXISTS (
       SELECT 1
       FROM users_events ue
       INNER JOIN events_roles_master erm ON erm.role_id = ue.role_id
       WHERE ue.event_id = ? AND ue.user_id = ?
         AND (
           UPPER(REPLACE(REPLACE(TRIM(erm.role_name), ' ', '_'), '-', '_')) IN ('TREASURER', 'CASHIER', 'KOSHADHYAKSHA') OR
           UPPER(REPLACE(REPLACE(TRIM(erm.english_name), ' ', '_'), '-', '_')) IN ('TREASURER', 'CASHIER', 'KOSHADHYAKSHA') OR
           UPPER(REPLACE(REPLACE(TRIM(erm.hindi_name), ' ', '_'), '-', '_')) IN ('TREASURER', 'CASHIER', 'KOSHADHYAKSHA')
         )
     ) AS isCashier`,
    [eventId, userId]
  );
  const isCashier = Number(cashierRows[0]?.isCashier) === 1;
  const isBroadAccess = isCommitteeTaskManager || isMasterAdmin || isBudgetAuthority || isCashier;
  if (!isBroadAccess && !isCreatorScope) {
    throwEventError('FORBIDDEN', 'You are not allowed to view event-wide task finance');
  }
  const financeRequestScope = isCreatedSubtaskScope
    ? 'task.event_id = ? AND task.parent_id = ? AND task.created_by = ?'
    : creatorEventScope
    ? 'task.event_id = ? AND task.parent_id IS NOT NULL AND task.created_by = ?'
    : `task.event_id = ? AND task.parent_id IS NULL
       AND (? = 1 OR task.owner_user_id = ? OR task.created_by = ? OR request.requested_by = ?)`;
  const financeRequestScopeParams = isCreatedSubtaskScope
    ? [eventId, creatorParentTaskId, userId]
    : creatorEventScope
    ? [eventId, userId]
    : [eventId, isBroadAccess ? 1 : 0, userId, userId, userId];
  const transactionScope = isCreatedSubtaskScope
    ? 'task.event_id = ? AND task.parent_id = ? AND task.created_by = ?'
    : creatorEventScope
    ? 'task.event_id = ? AND task.parent_id IS NOT NULL AND task.created_by = ?'
    : `task.event_id = ? AND task.parent_id IS NULL
       AND (? = 1 OR task.owner_user_id = ? OR task.created_by = ?
            OR tx.recipient_user_id = ?)`;
  const transactionScopeParams = isCreatedSubtaskScope
    ? [eventId, creatorParentTaskId, userId]
    : creatorEventScope
    ? [eventId, userId]
    : [eventId, isBroadAccess ? 1 : 0, userId, userId, userId];

  const [requests, budgetRequests, transactions] = await Promise.all([
    query<any[]>(
      `SELECT request.id, request.task_id AS taskId,
              task.parent_id AS parentTaskId,
              request.source_budget_request_id AS sourceBudgetRequestId,
              COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
              CAST(task.budget_amount AS CHAR) AS taskBudgetAmount,
              taskOwner.name AS taskOwnerName,
              task.owner_user_id AS taskOwnerUserId,
              request.request_type AS requestType,
              request.approval_stage AS approvalStage,
              CAST(request.requested_amount AS CHAR) AS requestedAmount,
              CAST(request.approved_amount AS CHAR) AS approvedAmount,
              request.reason, request.status, requester.name AS requestedByName,
              reviewer.name AS reviewedByName, request.review_note AS reviewNote,
              request.authority_decision AS authorityDecision,
              authorityReviewer.name AS authorityReviewedByName,
              request.authority_review_note AS authorityReviewNote,
              DATE_FORMAT(request.authority_reviewed_at, '%Y-%m-%d %H:%i:%s') AS authorityReviewedAt,
              DATE_FORMAT(request.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              DATE_FORMAT(task.created_at, '%Y-%m-%d %H:%i:%s') AS taskCreatedAt,
              DATE_FORMAT(request.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewedAt
       FROM task_finance_requests request
       INNER JOIN tasks task ON task.id = request.task_id
       INNER JOIN users requester ON requester.id = request.requested_by
       LEFT JOIN users taskOwner ON taskOwner.id = task.owner_user_id
       LEFT JOIN users reviewer ON reviewer.id = request.reviewed_by
       LEFT JOIN users authorityReviewer ON authorityReviewer.id = request.authority_reviewed_by
       WHERE ${financeRequestScope}
         AND request.request_type IN ('ADVANCE', 'TOP_UP')
       ORDER BY request.created_at DESC, request.id DESC`,
      financeRequestScopeParams
    ),
    loadBudgetRequests(
      userId,
      { isBudgetAuthority, isCashier, isMasterAdmin, isCommitteeTaskManager },
      undefined,
      eventId,
      creatorParentTaskId,
      creatorEventScope
    ),
    query<any[]>(
      `SELECT tx.id, tx.task_id AS taskId,
              task.parent_id AS parentTaskId,
              COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
      task.owner_user_id AS taskOwnerUserId,
              taskOwner.name AS taskOwnerName,
              tx.request_id AS requestId,
              tx.transaction_type AS transactionType,
              CAST(tx.amount AS CHAR) AS amount,
              tx.description, tx.status,
              creator.name AS createdByName, confirmer.name AS confirmedByName,
              DATE_FORMAT(tx.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              DATE_FORMAT(task.created_at, '%Y-%m-%d %H:%i:%s') AS taskCreatedAt,
              DATE_FORMAT(tx.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt,
              recipient.name AS recipientName, receiver.name AS receivedByName,
              DATE_FORMAT(tx.received_at, '%Y-%m-%d %H:%i:%s') AS receivedAt,
              tx.recipient_user_id AS recipientUserId
       FROM task_finance_transactions tx
       INNER JOIN tasks task ON task.id = tx.task_id
       INNER JOIN users creator ON creator.id = tx.created_by
       LEFT JOIN users taskOwner ON taskOwner.id = task.owner_user_id
       LEFT JOIN users confirmer ON confirmer.id = tx.confirmed_by
       LEFT JOIN users recipient ON recipient.id = tx.recipient_user_id
       LEFT JOIN users receiver ON receiver.id = tx.received_by
       WHERE ${transactionScope}
         AND tx.transaction_type IN ('ADVANCE_ISSUED', 'ADVANCE_EXPENSE', 'ADVANCE_RETURN')
         AND (
           ? = 1 OR tx.transaction_type <> 'ADVANCE_RETURN' OR tx.status <> 'PENDING'
         )
       ORDER BY tx.created_at DESC, tx.id DESC`,
      [...transactionScopeParams, isCashier ? 1 : 0]
    )
  ]);
  const capacityByTask = await loadTaskBudgetCapacityCents(
    [
      ...requests.map((request: any) => Number(request.taskId)),
      ...budgetRequests.map((request: any) => Number(request.taskId)),
      ...transactions.map((transaction: any) => Number(transaction.taskId))
    ]
  );
  return {
    requests: requests.map((request: any) => ({
      ...request,
      isSubtask: request.parentTaskId !== null,
      budgetAvailableForDisbursement: centsToWholeRupees(
        capacityByTask.get(Number(request.taskId))?.available ?? 0n
      ),
      remainingSanctionedBudget: centsToWholeRupees(
        capacityByTask.get(Number(request.taskId))?.reducible ?? 0n
      ),
      checklistExpenseAmount: centsToWholeRupees(
        capacityByTask.get(Number(request.taskId))?.checklistExpenses ?? 0n
      ),
      canReviewAuthority: request.status === 'PENDING' &&
        request.approvalStage === 'AUTHORITY' &&
        request.requestType === 'ADVANCE' &&
        isBudgetAuthority &&
        request.parentTaskId === null &&
        Number(request.taskOwnerUserId) !== userId
    })),
    budgetRequests,
    transactions: transactions.map((transaction) => {
      const { recipientUserId, taskOwnerUserId, ...visibleTransaction } = transaction;
      return {
        ...visibleTransaction,
        isSubtask: transaction.parentTaskId !== null,
        checklistExpenseAmount: centsToWholeRupees(
          capacityByTask.get(Number(transaction.taskId))?.checklistExpenses ?? 0n
        ),
        checklistReservedAmount: centsToWholeRupees(
          capacityByTask.get(Number(transaction.taskId))?.checklistReserved ?? 0n
        ),
        canConfirmReceipt: transaction.transactionType === 'ADVANCE_ISSUED' &&
          transaction.receivedAt === null &&
          Number(recipientUserId) === userId,
        canConfirmReturn: transaction.transactionType === 'ADVANCE_RETURN' &&
          transaction.status === 'PENDING' &&
          (transaction.parentTaskId === null
            ? isCashier && Number(taskOwnerUserId) !== userId
            : isCreatorScope),
        canCancel: transaction.transactionType === 'ADVANCE_RETURN' &&
          transaction.status === 'PENDING' &&
          Number(taskOwnerUserId) === userId
      };
    }),
    summary: {
      sanctionedBudget: '0',
      checklistExpenses: '0',
      checklistReserved: '0',
      subtaskSpent: '0',
      remainingBudget: '0',
      advanceIssued: '0',
      advanceSpent: '0',
      returnPending: '0',
      returnConfirmed: '0',
      advanceBalance: '0',
      availableInHand: '0'
    },
    budgetAmount: '0',
    canReduceBudget: false,
    maxBudgetReduction: '0',
    budgetRequestId: null,
    requestedBudgetAmount: null,
    budgetRequestStatus: null,
    budgetRequestedByName: null,
    canEditBudget: false,
    canRequestBudgetIncrease: false,
    canReviewBudgetRequest: budgetRequests.some((request) =>
      request.canReviewCreator || request.canReviewAuthority
    ),
    canCancelBudgetRequest: budgetRequests.some((request) => request.canCancel),
    canRequest: false,
    canApprove: isCashier || isCreatedSubtaskScope || creatorEventScope,
    isBudgetAuthority,
    canViewBudgetIncreaseRequests,
    canViewTaskAssignee: isMasterAdmin || isCommitteeTaskManager || isBudgetAuthority,
    canViewCreatedSubtaskFinance: false,
    isEventScope: true
  };
}

export const taskFinanceResolvers = {
  Query: {
    async taskFinance(_: unknown, args: { taskId: number }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      return loadFinance(Number(args.taskId), userId);
    },
    async eventTaskFinance(_: unknown, args: { eventId: number }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      return loadEventFinance(Number(args.eventId), userId);
    },
    async creatorSubtaskFinance(
      _: unknown,
      args: { eventId: number; parentTaskId: number },
      context: unknown
    ) {
      const userId = await getLoggedInUserId(context);
      return loadEventFinance(
        Number(args.eventId),
        userId,
        Number(args.parentTaskId)
      );
    },
    async creatorEventSubtaskFinance(
      _: unknown,
      args: { eventId: number },
      context: unknown
    ) {
      const userId = await getLoggedInUserId(context);
      return loadEventFinance(Number(args.eventId), userId, undefined, true);
    }
  },
  Mutation: {
    async reviewTaskFinanceRequest(_: unknown, args: { input: { requestId: number; decision: string; note?: string | null } }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      const requestId = Number(args.input?.requestId);
      const access = await getRequestAccess(requestId, userId, true);
      if (access.isOwner) throwEventError('FORBIDDEN', 'A task owner cannot review their own finance request');
      const decision = String(args.input.decision || '').toUpperCase();
      if (!['APPROVE', 'REJECT'].includes(decision)) throwEventError('BAD_REQUEST', 'Decision must be APPROVE or REJECT');
      const note = args.input.note ? cleanText(args.input.note, 'Review note') : null;
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        await connection.query('SELECT id FROM tasks WHERE id = ? FOR UPDATE', [access.taskId]);
        const [rows] = await connection.query<any[]>(
          `SELECT id, task_id AS taskId, request_type AS requestType,
                  approval_stage AS approvalStage,
                  CAST(requested_amount AS CHAR) AS requestedAmount, reason, status
           FROM task_finance_requests WHERE id = ? FOR UPDATE`,
          [requestId]
        );
        const request = rows[0];
        if (!request) throwEventError('NOT_FOUND', 'Finance request not found');
        if (request.requestType !== 'ADVANCE' && request.requestType !== 'TOP_UP') {
          throwEventError('NOT_FOUND', 'Finance request not found');
        }
        if (request.status !== 'PENDING') throwEventError('CONFLICT', 'This finance request has already been reviewed');
        const isAuthorityReview = request.requestType === 'ADVANCE' &&
          request.approvalStage === 'AUTHORITY';
        if (!isAuthorityReview || access.parentTaskId !== null || !access.isBudgetAuthority) {
          throwEventError('FORBIDDEN', 'Only the event authority can approve or reject finance requests');
        }
        const [requestUpdate] = await connection.execute<any>(
          `UPDATE task_finance_requests
           SET status = ?, approval_stage = ?, approved_amount = ?,
               reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP,
               authority_decision = ?, authority_reviewed_by = ?,
               authority_review_note = ?, authority_reviewed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'PENDING' AND approval_stage = 'AUTHORITY'`,
          [
            decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            decision === 'APPROVE' ? 'TREASURER' : 'AUTHORITY',
            decision === 'APPROVE' ? request.requestedAmount : null,
            userId,
            note,
            decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            userId,
            note,
            requestId
          ]
        );
        if (requestUpdate.affectedRows !== 1) {
          throwEventError('CONFLICT', 'This finance request has already been reviewed');
        }
        if (decision === 'APPROVE' && request.reason === 'Initial sanctioned task budget') {
          await connection.execute(
            `UPDATE tasks
             SET budget_amount = GREATEST(budget_amount, ?), updated_by = ?
             WHERE id = ?`,
            [request.requestedAmount, userId, Number(request.taskId)]
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return loadRequest(requestId, userId);
    },

    async recordTaskFinanceTransaction(_: unknown, args: { input: { taskId: number; transactionType: TransactionType; amount: string; description?: string | null; requestId?: number | null } }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      const taskId = Number(args.input?.taskId);
      const access = await getFinanceAccess(taskId, userId);
      const transactionType = String(args.input.transactionType).toUpperCase() as TransactionType;
      if (!transactionTypes.includes(transactionType)) throwEventError('BAD_REQUEST', 'Invalid finance transaction type');
      if (transactionType === 'ADVANCE_EXPENSE') {
        throwEventError('BAD_REQUEST', 'Record task spending as a checklist item expense');
      }
      const { amount, cents } = parseAmount(args.input.amount);
      const description = transactionType === 'ADVANCE_RETURN'
        ? 'Advance cash return'
        : cleanText(args.input.description, 'Description');
      const requestId = args.input.requestId === undefined || args.input.requestId === null
        ? null
        : Number(args.input.requestId);
      if (requestId !== null && (!Number.isInteger(requestId) || requestId <= 0)) {
        throwEventError('BAD_REQUEST', 'requestId must be a positive integer');
      }
      const cashierOnly = transactionType === 'ADVANCE_ISSUED';
      const canIssueAdvance = access.isSubtaskCreator ||
        (access.isCashier && access.parentTaskId === null);
      if (cashierOnly ? !canIssueAdvance : !access.isOwner) {
        throwEventError(
          'FORBIDDEN',
          cashierOnly
            ? 'Only the subtask creator or assigned treasurer for a root task can record this payment'
            : 'Only the task owner can record this transaction'
        );
      }
      if (transactionType === 'ADVANCE_RETURN' && requestId) {
        throwEventError('BAD_REQUEST', 'This transaction type cannot reference a finance request');
      }
      const connection = await getConnection();
      let transactionId: number;
      let recipientUserId: number | null = null;
      try {
        await connection.beginTransaction();
        await connection.query('SELECT id FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
        if (transactionType === 'ADVANCE_RETURN') {
          const [pendingReturnRows] = await connection.query<any[]>(
            `SELECT id FROM task_finance_transactions
             WHERE task_id = ? AND transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING'
             LIMIT 1 FOR UPDATE`,
            [taskId]
          );
          if (pendingReturnRows.length > 0) {
            throwEventError('CONFLICT', 'A cash return request is already pending confirmation');
          }
          const [pendingBudgetRows] = await connection.query<any[]>(
            `SELECT id FROM task_budget_requests
             WHERE task_id = ? AND status = 'PENDING'
             LIMIT 1 FOR UPDATE`,
            [taskId]
          );
          if (pendingBudgetRows.length > 0) {
            throwEventError('CONFLICT', 'Resolve the pending budget request before submitting a cash return');
          }
          const cashCapacity = await loadTodoReservationCapacity(connection, taskId, null);
          if (cents > cashCapacity.availableInHand) {
            throwEventError('BAD_REQUEST', 'Amount exceeds the available task advance balance');
          }
        }
        if (transactionType === 'ADVANCE_ISSUED') {
          const capacityByTask = await loadTaskBudgetCapacityCents([taskId]);
          const remainingBudgetCents = capacityByTask.get(taskId)?.available ?? 0n;
          if (cents > remainingBudgetCents) {
            throwEventError('BAD_REQUEST', "Payment exceeds the task's remaining available budget");
          }
          if (requestId !== null) {
            const [rows] = await connection.query<any[]>(
              `SELECT request.status, CAST(request.approved_amount AS CHAR) AS approvedAmount,
                      task.owner_user_id AS recipientUserId
               FROM task_finance_requests request
               INNER JOIN tasks task ON task.id = request.task_id
               WHERE request.id = ? AND request.task_id = ? FOR UPDATE`,
              [requestId, taskId]
            );
            const request = rows[0];
            if (!request || !['APPROVED', 'PARTIALLY_APPROVED'].includes(request.status)) {
              throwEventError('CONFLICT', 'Only an approved advance request can be issued');
            }
            if (request.recipientUserId === null) {
              throwEventError('CONFLICT', 'Assign a task owner before recording an advance payment');
            }
            recipientUserId = Number(request.recipientUserId);
            const [issuedRows] = await connection.query<any[]>(
              `SELECT COALESCE(SUM(amount), 0) AS issued FROM task_finance_transactions
               WHERE request_id = ? AND transaction_type = 'ADVANCE_ISSUED' AND status = 'CONFIRMED'`,
              [requestId]
            );
            if (cents > decimalCents(request.approvedAmount) - decimalCents(issuedRows[0].issued)) {
              throwEventError('BAD_REQUEST', 'Payment exceeds the remaining approved amount');
            }
          } else {
            const [taskRows] = await connection.query<any[]>(
              'SELECT owner_user_id AS recipientUserId FROM tasks WHERE id = ?',
              [taskId]
            );
            const task = taskRows[0];
            if (!task || task.recipientUserId === null) {
              throwEventError('CONFLICT', 'Assign a task owner before recording an advance payment');
            }
            recipientUserId = Number(task.recipientUserId);
            const [approvedRows] = await connection.query<any[]>(
              `SELECT COALESCE(SUM(COALESCE(approved_amount, requested_amount)), 0) AS approved
               FROM task_finance_requests
               WHERE task_id = ? AND request_type IN ('ADVANCE', 'TOP_UP')
                 AND status IN ('APPROVED', 'PARTIALLY_APPROVED')`,
              [taskId]
            );
            const [issuedRows] = await connection.query<any[]>(
              `SELECT
                 COALESCE(SUM(CASE
                   WHEN transaction_type = 'ADVANCE_ISSUED' AND status = 'CONFIRMED' THEN amount
                   ELSE 0
                 END), 0) AS issued,
                 COALESCE(SUM(CASE
                   WHEN transaction_type = 'ADVANCE_RETURN' AND status = 'CONFIRMED' THEN amount
                   ELSE 0
                 END), 0) AS returned
               FROM task_finance_transactions
               WHERE task_id = ?`,
              [taskId]
            );
            const netIssued = decimalCents(issuedRows[0].issued) - decimalCents(issuedRows[0].returned);
            const remaining = decimalCents(approvedRows[0].approved) - (netIssued > 0n ? netIssued : 0n);
            if (cents > remaining) {
              throwEventError('BAD_REQUEST', 'Payment exceeds the remaining approved task finance amount');
            }
          }
        }
        const status = transactionType === 'ADVANCE_RETURN' ? 'PENDING'
          : 'CONFIRMED';
        const receivedBy = transactionType === 'ADVANCE_ISSUED' && recipientUserId === userId
          ? userId
          : null;
        const [result] = await connection.execute<any>(
          `INSERT INTO task_finance_transactions
             (task_id, request_id, recipient_user_id, transaction_type, amount, description, status,
              created_by, confirmed_by, confirmed_at, received_by, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'PENDING' ? 'NULL' : 'CURRENT_TIMESTAMP'},
                   ?, ${receivedBy === null ? 'NULL' : 'CURRENT_TIMESTAMP'})`,
          [
            taskId,
            requestId,
            recipientUserId,
            transactionType,
            amount,
            description,
            status,
            userId,
            status === 'PENDING' ? null : userId,
            receivedBy
          ]
        );
        transactionId = Number(result.insertId);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return loadTransaction(transactionId!, userId);
    },

    async confirmTaskFinanceReceipt(_: unknown, args: { transactionId: number }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      const transactionId = Number(args.transactionId);
      if (!Number.isInteger(transactionId) || transactionId <= 0) {
        throwEventError('BAD_REQUEST', 'transactionId must be a positive integer');
      }

      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query<any[]>(
          `SELECT transaction_type AS transactionType, status, recipient_user_id AS recipientUserId, received_at AS receivedAt
           FROM task_finance_transactions WHERE id = ? FOR UPDATE`,
          [transactionId]
        );
        const transaction = rows[0];
        if (!transaction) throwEventError('NOT_FOUND', 'Finance transaction not found');
        if (Number(transaction.recipientUserId) !== userId) {
          throwEventError('FORBIDDEN', 'Only the payment recipient can confirm receipt');
        }
        if (transaction.transactionType !== 'ADVANCE_ISSUED' || transaction.status !== 'CONFIRMED') {
          throwEventError('CONFLICT', 'This transaction is not an available payment');
        }
        if (transaction.receivedAt !== null) {
          throwEventError('CONFLICT', 'Receipt has already been confirmed');
        }
        const [update] = await connection.execute<any>(
          `UPDATE task_finance_transactions
           SET received_by = ?, received_at = CURRENT_TIMESTAMP
           WHERE id = ? AND recipient_user_id = ? AND received_at IS NULL`,
          [userId, transactionId, userId]
        );
        if (update.affectedRows !== 1) throwEventError('CONFLICT', 'Receipt has already been confirmed');
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return loadTransaction(transactionId, userId);
    },

    async reviewTaskFinanceReturn(_: unknown, args: { input: { transactionId: number; decision: string } }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      const transactionId = Number(args.input?.transactionId);
      const access = await getTransactionAccess(transactionId, userId);
      const canReviewReturn = access.parentTaskId === null
        ? access.isCashier && !access.isOwner
        : access.isSubtaskCreator;
      if (!canReviewReturn) {
        throwEventError('FORBIDDEN', 'Only the subtask creator or assigned treasurer for a root task can confirm a cash return');
      }
      const decision = String(args.input.decision || '').toUpperCase();
      if (!['CONFIRM', 'REJECT'].includes(decision)) throwEventError('BAD_REQUEST', 'Decision must be CONFIRM or REJECT');
      const result = await query<any[]>(
        `SELECT id FROM task_finance_transactions WHERE id = ? AND transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING'`,
        [transactionId]
      );
      if (!result.length) throwEventError('CONFLICT', 'This cash return is no longer pending');
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [update] = await connection.execute<any>(
          `UPDATE task_finance_transactions
           SET status = ?, confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING'`,
          [decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED', userId, transactionId]
        );
        if (update.affectedRows !== 1) throwEventError('CONFLICT', 'This cash return is no longer pending');
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return loadTransaction(transactionId, userId);
    },

    async cancelTaskFinanceReturn(_: unknown, args: { transactionId: number }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      const transactionId = Number(args.transactionId);
      const access = await getTransactionAccess(transactionId, userId);
      if (!access.isOwner) {
        throwEventError('FORBIDDEN', 'Only the task assignee can cancel their cash return');
      }
      const result = await query<any[]>(
        `SELECT id FROM task_finance_transactions
         WHERE id = ? AND transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING'`,
        [transactionId]
      );
      if (!result.length) {
        throwEventError('CONFLICT', 'This cash return is no longer pending');
      }
      await query(
        `UPDATE task_finance_transactions
         SET status = 'REJECTED', confirmed_by = NULL, confirmed_at = NULL
         WHERE id = ? AND transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING'`,
        [transactionId]
      );
      return loadTransaction(transactionId, userId);
    }
  }
};
