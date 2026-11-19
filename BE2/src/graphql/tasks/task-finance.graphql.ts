import { RowDataPacket } from 'mysql2/promise';
import { getConnection, query } from '../../config/db';
import {
  hasCommitteeTaskProgramCreationRole,
  hasTaskBudgetApprovalAuthority,
  hasPermission,
  PERMISSIONS
} from '../../authorization/authorization';
import { getLoggedInUserId, throwEventError } from '../events/details/voting/event-voting-core.graphql';

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

export async function getPendingSubtaskTransferTaskIds(taskIds: number[], userId: number): Promise<Set<number>> {
  const ids = [...new Set(taskIds.filter((taskId) => Number.isInteger(taskId) && taskId > 0))];
  if (ids.length === 0) return new Set<number>();

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await query<Array<RowDataPacket & { taskId: number }>>(
    `SELECT DISTINCT subtask_id AS taskId
     FROM task_subtask_transfers
     WHERE subtask_id IN (${placeholders})
       AND recipient_user_id = ?
       AND status = 'PENDING'`,
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
       UNION
       SELECT subtask_id AS taskId
       FROM task_subtask_transfers
       WHERE subtask_id IN (${placeholders}) AND recipient_user_id = ?
     ) financeParticipants`,
    [
      ...ids, userId,
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
  enum TaskSubtaskTransferStatus { PENDING CONFIRMED }

  type TaskFinanceRequest {
    id: Int!
    taskId: Int!
    sourceBudgetRequestId: Int
    taskName: String!
    taskBudgetAmount: String!
    budgetAvailableForDisbursement: String!
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
    reviewedAt: String
  }

  type TaskFinanceTransaction {
    id: Int!
    taskId: Int!
    taskName: String!
    requestId: Int
    transactionType: TaskFinanceTransactionType!
    amount: String!
    description: String!
    status: TaskFinanceTransactionStatus!
    createdByName: String!
    confirmedByName: String
    createdAt: String!
    confirmedAt: String
    recipientName: String
    receivedByName: String
    receivedAt: String
    canConfirmReceipt: Boolean!
    canConfirmReturn: Boolean!
  }

  type TaskBudgetRequest {
    id: Int!
    taskId: Int!
    taskName: String!
    taskOwnerName: String
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
    canReviewCreator: Boolean!
    canReviewAuthority: Boolean!
    canCancel: Boolean!
  }

  type TaskSubtaskTransferOption {
    subtaskId: Int!
    subtaskName: String!
    ownerName: String!
    budgetAmount: String!
    availableAmount: String!
  }

  type TaskSubtaskTransfer {
    id: Int!
    parentTaskId: Int!
    parentTaskName: String!
    subtaskId: Int!
    subtaskName: String!
    senderName: String!
    recipientName: String!
    amount: String!
    description: String!
    status: TaskSubtaskTransferStatus!
    createdAt: String!
    confirmedByName: String
    confirmedAt: String
    canConfirmReceipt: Boolean!
  }

  type TaskFinanceSummary {
    sanctionedBudget: String!
    checklistExpenses: String!
    subtaskSpent: String!
    remainingBudget: String!
    advanceIssued: String!
    advanceSpent: String!
    returnPending: String!
    returnConfirmed: String!
    advanceBalance: String!
  }

  type TaskFinancePayload {
    requests: [TaskFinanceRequest!]!
    budgetRequests: [TaskBudgetRequest!]!
    transactions: [TaskFinanceTransaction!]!
    subtaskTransferOptions: [TaskSubtaskTransferOption!]!
    incomingSubtaskTransfers: [TaskSubtaskTransfer!]!
    outgoingSubtaskTransfers: [TaskSubtaskTransfer!]!
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
    canViewTaskAssignee: Boolean!
    canCreateSubtaskTransfers: Boolean!
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

  input CreateSubtaskTransferInput {
    parentTaskId: Int!
    subtaskId: Int!
    amount: String!
    description: String!
  }
`;

export const taskFinanceQueryFields = `
  taskFinance(taskId: Int!): TaskFinancePayload!
  eventTaskFinance(eventId: Int!): TaskFinancePayload!
`;

export const taskFinanceMutationFields = `
  reviewTaskFinanceRequest(input: TaskFinanceReviewInput!): TaskFinanceRequest!
  recordTaskFinanceTransaction(input: TaskFinanceTransactionInput!): TaskFinanceTransaction!
  confirmTaskFinanceReceipt(transactionId: Int!): TaskFinanceTransaction!
  reviewTaskFinanceReturn(input: TaskFinanceReturnReviewInput!): TaskFinanceTransaction!
  createSubtaskTransfer(input: CreateSubtaskTransferInput!): TaskSubtaskTransfer!
  confirmSubtaskTransferReceipt(transferId: Int!): TaskSubtaskTransfer!
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
): Promise<Map<number, { available: bigint; reducible: bigint }>> {
  const ids = [...new Set(taskIds.filter((taskId) => Number.isInteger(taskId) && taskId > 0))];
  if (ids.length === 0) return new Map<number, { available: bigint; reducible: bigint }>();
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await query<any[]>(
    `SELECT task.id AS taskId,
            CAST(GREATEST(0, task.budget_amount - GREATEST(
              COALESCE(expenses.directExpenses, 0) + COALESCE(children.allocated, 0),
              GREATEST(0, COALESCE(cash.issued, 0) - COALESCE(cash.returned, 0))
            )) AS CHAR) AS budgetAvailable,
            CAST(GREATEST(
              0,
              task.budget_amount - COALESCE(expenses.directExpenses, 0) - COALESCE(children.allocated, 0)
            ) AS CHAR) AS budgetReducible
     FROM tasks task
     LEFT JOIN (
       SELECT task_id, SUM(expense_amount) AS directExpenses
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
              SUM(CASE WHEN transaction_type = 'ADVANCE_RETURN' AND status = 'CONFIRMED' THEN amount ELSE 0 END) AS returned
       FROM task_finance_transactions
       WHERE task_id IN (${placeholders})
       GROUP BY task_id
     ) cash ON cash.task_id = task.id
     WHERE task.id IN (${placeholders})`,
    [...ids, ...ids, ...ids, ...ids]
  );
  return new Map(rows.map((row) => [Number(row.taskId), {
    available: decimalCents(row.budgetAvailable),
    reducible: decimalCents(row.budgetReducible)
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
  ownerUserId: number | null;
  createdBy: number;
  isOwner: boolean;
  isCashier: boolean;
  isBudgetAuthority: boolean;
  isMasterAdmin: boolean;
  isCommitteeTaskManager: boolean;
  isParticipant: boolean;
}> {
  if (!Number.isInteger(taskId) || taskId <= 0) throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
  const tasks = await query<Array<RowDataPacket & {
    taskId: number;
    eventId: number;
    ownerUserId: number | null;
    createdBy: number;
    committeeId: number;
  }>>(
    `SELECT task.id AS taskId, task.event_id AS eventId,
            task.owner_user_id AS ownerUserId, task.created_by AS createdBy,
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
  if (allowReadOnly && !isOwner && !isCashier && !isCreator &&
      !isBudgetAuthority && !isMasterAdmin && !isCommitteeTaskManager && !isParticipant) {
    throwEventError('FORBIDDEN', 'You are not allowed to view this task finance information');
  }
  if (!allowReadOnly && !isOwner && !isCashier) {
    throwEventError('FORBIDDEN', 'Only the task owner or assigned event treasurer can perform task finance actions');
  }
  return {
    taskId: Number(task.taskId),
    eventId: Number(task.eventId),
    ownerUserId: task.ownerUserId === null ? null : Number(task.ownerUserId),
    createdBy: Number(task.createdBy),
    isOwner,
    isCashier,
    isBudgetAuthority,
    isMasterAdmin,
    isCommitteeTaskManager,
    isParticipant
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
    budgetAvailableForDisbursement: centsToWholeRupees(
      capacityByTask.get(Number(request.taskId))?.available ?? 0n
    ),
    canReviewAuthority: request.status === 'PENDING' &&
      request.approvalStage === 'AUTHORITY' &&
      request.requestType === 'ADVANCE' &&
      access.isBudgetAuthority &&
      !access.isOwner,
  };
}

async function loadTransaction(transactionId: number, userId: number): Promise<any> {
  const rows = await query<any[]>(
    `SELECT t.id, t.task_id AS taskId,
            COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
            t.request_id AS requestId, t.transaction_type AS transactionType,
            CAST(t.amount AS CHAR) AS amount, t.description, t.status,
            creator.name AS createdByName, confirmer.name AS confirmedByName,
            DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
            DATE_FORMAT(t.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt,
            recipient.name AS recipientName, receiver.name AS receivedByName,
            DATE_FORMAT(t.received_at, '%Y-%m-%d %H:%i:%s') AS receivedAt,
            t.recipient_user_id AS recipientUserId
     FROM task_finance_transactions t
     INNER JOIN tasks task ON task.id = t.task_id
     INNER JOIN users creator ON creator.id = t.created_by
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
  return {
    ...transaction,
    canConfirmReceipt: isPayment
      && transaction.receivedAt === null
      && Number(transaction.recipientUserId) === userId,
    canConfirmReturn: transaction.transactionType === 'ADVANCE_RETURN' &&
      transaction.status === 'PENDING' &&
      access.isCashier &&
      !access.isOwner
  };
}

function mapSubtaskTransfer(transfer: any, userId: number): any {
  return {
    id: Number(transfer.id),
    parentTaskId: Number(transfer.parentTaskId),
    parentTaskName: String(transfer.parentTaskName || 'Untitled Task'),
    subtaskId: Number(transfer.subtaskId),
    subtaskName: String(transfer.subtaskName || 'Untitled Task'),
    senderName: String(transfer.senderName || ''),
    recipientName: String(transfer.recipientName || ''),
    amount: String(transfer.amount),
    description: String(transfer.description || ''),
    status: String(transfer.status),
    createdAt: String(transfer.createdAt),
    confirmedByName: transfer.confirmedByName || null,
    confirmedAt: transfer.confirmedAt || null,
    canConfirmReceipt: String(transfer.status) === 'PENDING'
      && Number(transfer.recipientUserId) === userId
  };
}

async function loadSubtaskTransfer(transferId: number, userId: number): Promise<any> {
  const rows = await query<any[]>(
    `SELECT transfer.id,
            transfer.parent_task_id AS parentTaskId,
            parent.name AS parentTaskName,
            transfer.subtask_id AS subtaskId,
            child.name AS subtaskName,
            transfer.sender_user_id AS senderUserId,
            sender.name AS senderName,
            transfer.recipient_user_id AS recipientUserId,
            recipient.name AS recipientName,
            CAST(transfer.amount AS CHAR) AS amount,
            transfer.description,
            transfer.status,
            DATE_FORMAT(transfer.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
            confirmer.name AS confirmedByName,
            DATE_FORMAT(transfer.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt
     FROM task_subtask_transfers transfer
     INNER JOIN tasks parent ON parent.id = transfer.parent_task_id
     INNER JOIN tasks child ON child.id = transfer.subtask_id
     INNER JOIN users sender ON sender.id = transfer.sender_user_id
     INNER JOIN users recipient ON recipient.id = transfer.recipient_user_id
     LEFT JOIN users confirmer ON confirmer.id = transfer.confirmed_by
     WHERE transfer.id = ?`,
    [transferId]
  );
  if (!rows[0]) throwEventError('NOT_FOUND', 'Subtask transfer not found');
  return mapSubtaskTransfer(rows[0], userId);
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
  eventId?: number
): Promise<any[]> {
  const isEventScope = eventId !== undefined;
  const scopeFilter = isEventScope
    ? `task.event_id = ?
       AND (? = 1 OR task.owner_user_id = ? OR task.created_by = ? OR request.requested_by = ?)`
    : 'request.task_id = ?';
  const scopeParams = isEventScope
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
            COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
            taskOwner.name AS taskOwnerName,
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
            task.created_by AS taskCreatedBy
     FROM task_budget_requests request
     INNER JOIN tasks task ON task.id = request.task_id
     INNER JOIN events event ON event.id = task.event_id
     INNER JOIN users requester ON requester.id = request.requested_by
     LEFT JOIN users taskOwner ON taskOwner.id = task.owner_user_id
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
  return visibleRows.map((request) => {
    const requestedCents = decimalCents(request.requestedAmount);
    const baselineCents = decimalCents(request.budgetBeforeRequest);
    return {
      id: Number(request.id),
      taskId: Number(request.taskId),
      taskName: String(request.taskName || 'Untitled Task'),
      taskOwnerName: request.taskOwnerName || null,
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
      canReviewCreator: request.status === 'PENDING' &&
        request.approvalStage === 'CREATOR' &&
        Number(request.taskCreatedBy) === userId,
      canReviewAuthority: request.status === 'PENDING' &&
        request.approvalStage === 'AUTHORITY' &&
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
    childBudgetRows,
    subtaskTransferOptions,
    incomingSubtaskTransferRows,
    outgoingSubtaskTransferRows
  ] = await Promise.all([
    query<any[]>(
      `SELECT r.id, r.task_id AS taskId,
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
              COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
              t.request_id AS requestId, t.transaction_type AS transactionType,
              CAST(t.amount AS CHAR) AS amount, t.description, t.status,
              creator.name AS createdByName, confirmer.name AS confirmedByName,
              DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              DATE_FORMAT(t.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt,
              recipient.name AS recipientName, receiver.name AS receivedByName,
              DATE_FORMAT(t.received_at, '%Y-%m-%d %H:%i:%s') AS receivedAt,
              t.recipient_user_id AS recipientUserId
       FROM task_finance_transactions t
       INNER JOIN tasks task ON task.id = t.task_id
       INNER JOIN users creator ON creator.id = t.created_by
       LEFT JOIN users confirmer ON confirmer.id = t.confirmed_by
       LEFT JOIN users recipient ON recipient.id = t.recipient_user_id
       LEFT JOIN users receiver ON receiver.id = t.received_by
       WHERE t.task_id = ?
         AND t.transaction_type IN ('ADVANCE_ISSUED', 'ADVANCE_EXPENSE', 'ADVANCE_RETURN')
       ORDER BY t.created_at DESC, t.id DESC`,
      [taskId]
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
       SELECT CAST(COALESCE(SUM(todo.expense_amount), 0) AS CHAR) AS checklistExpenses
       FROM todos todo
       INNER JOIN task_tree ON task_tree.id = todo.task_id`,
      [taskId]
    ),
    query<any[]>(
      `SELECT CAST(COALESCE(SUM(budget_amount), 0) AS CHAR) AS allocatedChildBudgets
       FROM tasks WHERE parent_id = ?`,
      [taskId]
    ),
    access.isOwner
      ? query<any[]>(
          `SELECT child.id AS subtaskId,
                  child.name AS subtaskName,
                  owner.name AS ownerName,
                  CAST(child.budget_amount AS CHAR) AS budgetAmount,
                  CAST(GREATEST(
                    0,
                    child.budget_amount - COALESCE(transfers.transferredAmount, 0)
                  ) AS CHAR) AS availableAmount
           FROM tasks child
           INNER JOIN users owner ON owner.id = child.owner_user_id
           LEFT JOIN (
             SELECT subtask_id, SUM(amount) AS transferredAmount
             FROM task_subtask_transfers
             WHERE status IN ('PENDING', 'CONFIRMED')
             GROUP BY subtask_id
           ) transfers ON transfers.subtask_id = child.id
           WHERE child.parent_id = ?
           ORDER BY child.created_at ASC, child.id ASC`,
          [taskId]
        )
      : Promise.resolve([]),
    query<any[]>(
      `SELECT transfer.id,
              transfer.parent_task_id AS parentTaskId,
              parent.name AS parentTaskName,
              transfer.subtask_id AS subtaskId,
              child.name AS subtaskName,
              transfer.sender_user_id AS senderUserId,
              sender.name AS senderName,
              transfer.recipient_user_id AS recipientUserId,
              recipient.name AS recipientName,
              CAST(transfer.amount AS CHAR) AS amount,
              transfer.description,
              transfer.status,
              DATE_FORMAT(transfer.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              confirmer.name AS confirmedByName,
              DATE_FORMAT(transfer.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt
       FROM task_subtask_transfers transfer
       INNER JOIN tasks parent ON parent.id = transfer.parent_task_id
       INNER JOIN tasks child ON child.id = transfer.subtask_id
       INNER JOIN users sender ON sender.id = transfer.sender_user_id
       INNER JOIN users recipient ON recipient.id = transfer.recipient_user_id
       LEFT JOIN users confirmer ON confirmer.id = transfer.confirmed_by
       WHERE transfer.subtask_id = ?
         AND (
           transfer.recipient_user_id = ?
           OR child.owner_user_id = ?
           OR parent.owner_user_id = ?
         )
       ORDER BY transfer.created_at DESC, transfer.id DESC`,
      [taskId, userId, userId, userId]
    ),
    query<any[]>(
      `SELECT transfer.id,
              transfer.parent_task_id AS parentTaskId,
              parent.name AS parentTaskName,
              transfer.subtask_id AS subtaskId,
              child.name AS subtaskName,
              transfer.sender_user_id AS senderUserId,
              sender.name AS senderName,
              transfer.recipient_user_id AS recipientUserId,
              recipient.name AS recipientName,
              CAST(transfer.amount AS CHAR) AS amount,
              transfer.description,
              transfer.status,
              DATE_FORMAT(transfer.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              confirmer.name AS confirmedByName,
              DATE_FORMAT(transfer.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt
       FROM task_subtask_transfers transfer
       INNER JOIN tasks parent ON parent.id = transfer.parent_task_id
       INNER JOIN tasks child ON child.id = transfer.subtask_id
       INNER JOIN users sender ON sender.id = transfer.sender_user_id
       INNER JOIN users recipient ON recipient.id = transfer.recipient_user_id
       LEFT JOIN users confirmer ON confirmer.id = transfer.confirmed_by
       WHERE transfer.parent_task_id = ?
         AND (
           ? = 1
           OR transfer.sender_user_id = ?
           OR transfer.recipient_user_id = ?
         )
       ORDER BY transfer.created_at DESC, transfer.id DESC`,
      [taskId, access.isOwner ? 1 : 0, userId, userId]
    )
  ]);
  const capacityByTask = await loadTaskBudgetCapacityCents([taskId]);
  const taskBudgetCapacity = capacityByTask.get(taskId);
  const budgetAvailableForDisbursement = taskBudgetCapacity?.available ?? 0n;
  const financeRequests = requests.map((request: any) => ({
    ...request,
    budgetAvailableForDisbursement: centsToWholeRupees(budgetAvailableForDisbursement),
    canReviewAuthority: request.status === 'PENDING' &&
      request.approvalStage === 'AUTHORITY' &&
      request.requestType === 'ADVANCE' &&
      access.isBudgetAuthority &&
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
      access.isCashier &&
      !access.isOwner;
    return { ...visibleTransaction, canConfirmReceipt, canConfirmReturn };
  });
  const aggregate = aggregates[0] ?? {};
  const advanceIssued = decimalCents(aggregate.advanceIssued);
  const advanceSpent = decimalCents(aggregate.advanceSpent);
  const returnPending = decimalCents(aggregate.returnPending);
  const returnConfirmed = decimalCents(aggregate.returnConfirmed);
  const taskBudget = taskRows[0] ?? {};
  const sanctionedBudget = decimalCents(taskBudget.sanctionedBudget);
  const checklistExpenses = decimalCents(todoExpenseRows[0]?.checklistExpenses);
  const allocatedChildBudgets = decimalCents(childBudgetRows[0]?.allocatedChildBudgets);
  const maxBudgetReduction = taskBudgetCapacity?.reducible ?? 0n;
  const isMasterAdmin = access.isMasterAdmin;
  const canEditBudget = taskBudget.parentTaskId === null &&
    (Number(taskBudget.createdBy) === userId || isMasterAdmin || access.isCommitteeTaskManager);
  const canReduceBudget = isMasterAdmin || access.isCommitteeTaskManager;
  const budgetRequestId = taskBudget.budgetRequestId === null
    ? null
    : Number(taskBudget.budgetRequestId);
  const incomingSubtaskTransfers = incomingSubtaskTransferRows
    .map((transfer) => mapSubtaskTransfer(transfer, userId));
  const outgoingSubtaskTransfers = outgoingSubtaskTransferRows
    .map((transfer) => mapSubtaskTransfer(transfer, userId));
  return {
    requests: financeRequests,
    budgetRequests,
    transactions: financeTransactions,
    subtaskTransferOptions: subtaskTransferOptions.map((option: any) => ({
      subtaskId: Number(option.subtaskId),
      subtaskName: String(option.subtaskName || 'Untitled Task'),
      ownerName: String(option.ownerName || ''),
      budgetAmount: String(option.budgetAmount),
      availableAmount: String(option.availableAmount)
    })),
    incomingSubtaskTransfers,
    outgoingSubtaskTransfers,
    summary: {
      sanctionedBudget: centsToWholeRupees(sanctionedBudget),
      checklistExpenses: centsToWholeRupees(checklistExpenses),
      subtaskSpent: centsToWholeRupees(allocatedChildBudgets),
      remainingBudget: centsToWholeRupees(sanctionedBudget - allocatedChildBudgets),
      advanceIssued: centsToWholeRupees(advanceIssued),
      advanceSpent: centsToWholeRupees(advanceSpent),
      returnPending: centsToWholeRupees(returnPending),
      returnConfirmed: centsToWholeRupees(returnConfirmed),
      advanceBalance: centsToWholeRupees(advanceIssued - advanceSpent - returnPending - returnConfirmed)
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
    canApprove: access.isCashier && !access.isOwner,
    isBudgetAuthority: access.isBudgetAuthority,
    canViewTaskAssignee: access.isMasterAdmin ||
      access.isCommitteeTaskManager ||
      access.isBudgetAuthority,
    canCreateSubtaskTransfers: access.isOwner && subtaskTransferOptions.length > 0,
    isEventScope: false
  };
}

async function loadEventFinance(eventId: number, userId: number): Promise<any> {
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
  if (!isBroadAccess) {
    throwEventError('FORBIDDEN', 'You are not allowed to view event-wide task finance');
  }

  const [requests, budgetRequests, transactions] = await Promise.all([
    query<any[]>(
      `SELECT request.id, request.task_id AS taskId,
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
              DATE_FORMAT(request.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewedAt
       FROM task_finance_requests request
       INNER JOIN tasks task ON task.id = request.task_id
       INNER JOIN users requester ON requester.id = request.requested_by
       LEFT JOIN users taskOwner ON taskOwner.id = task.owner_user_id
       LEFT JOIN users reviewer ON reviewer.id = request.reviewed_by
       LEFT JOIN users authorityReviewer ON authorityReviewer.id = request.authority_reviewed_by
       WHERE task.event_id = ?
         AND request.request_type IN ('ADVANCE', 'TOP_UP')
         AND (
           ? = 1 OR task.owner_user_id = ? OR task.created_by = ? OR request.requested_by = ?
         )
       ORDER BY request.created_at DESC, request.id DESC`,
      [eventId, isBroadAccess ? 1 : 0, userId, userId, userId]
    ),
    loadBudgetRequests(
      userId,
      { isBudgetAuthority, isCashier, isMasterAdmin, isCommitteeTaskManager },
      undefined,
      eventId
    ),
    query<any[]>(
      `SELECT tx.id, tx.task_id AS taskId,
              COALESCE(NULLIF(TRIM(task.name), ''), 'Untitled Task') AS taskName,
      task.owner_user_id AS taskOwnerUserId,
              tx.request_id AS requestId,
              tx.transaction_type AS transactionType,
              CAST(tx.amount AS CHAR) AS amount,
              tx.description, tx.status,
              creator.name AS createdByName, confirmer.name AS confirmedByName,
              DATE_FORMAT(tx.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              DATE_FORMAT(tx.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt,
              recipient.name AS recipientName, receiver.name AS receivedByName,
              DATE_FORMAT(tx.received_at, '%Y-%m-%d %H:%i:%s') AS receivedAt,
              tx.recipient_user_id AS recipientUserId
       FROM task_finance_transactions tx
       INNER JOIN tasks task ON task.id = tx.task_id
       INNER JOIN users creator ON creator.id = tx.created_by
       LEFT JOIN users confirmer ON confirmer.id = tx.confirmed_by
       LEFT JOIN users recipient ON recipient.id = tx.recipient_user_id
       LEFT JOIN users receiver ON receiver.id = tx.received_by
       WHERE task.event_id = ?
         AND tx.transaction_type IN ('ADVANCE_ISSUED', 'ADVANCE_EXPENSE', 'ADVANCE_RETURN')
         AND (
           ? = 1 OR task.owner_user_id = ? OR task.created_by = ?
           OR tx.recipient_user_id = ?
         )
       ORDER BY tx.created_at DESC, tx.id DESC`,
      [eventId, isBroadAccess ? 1 : 0, userId, userId, userId]
    )
  ]);
  const capacityByTask = await loadTaskBudgetCapacityCents(
    requests.map((request: any) => Number(request.taskId))
  );
  return {
    requests: requests.map((request: any) => ({
      ...request,
      budgetAvailableForDisbursement: centsToWholeRupees(
        capacityByTask.get(Number(request.taskId))?.available ?? 0n
      ),
      canReviewAuthority: request.status === 'PENDING' &&
        request.approvalStage === 'AUTHORITY' &&
        request.requestType === 'ADVANCE' &&
        isBudgetAuthority &&
        Number(request.taskOwnerUserId) !== userId
    })),
    budgetRequests,
    transactions: transactions.map((transaction) => {
      const { recipientUserId, taskOwnerUserId, ...visibleTransaction } = transaction;
      return {
        ...visibleTransaction,
        canConfirmReceipt: transaction.transactionType === 'ADVANCE_ISSUED' &&
          transaction.receivedAt === null &&
          Number(recipientUserId) === userId,
        canConfirmReturn: transaction.transactionType === 'ADVANCE_RETURN' &&
          transaction.status === 'PENDING' &&
          isCashier &&
          Number(taskOwnerUserId) !== userId
      };
    }),
    subtaskTransferOptions: [],
    incomingSubtaskTransfers: [],
    outgoingSubtaskTransfers: [],
    summary: {
      sanctionedBudget: '0',
      checklistExpenses: '0',
      subtaskSpent: '0',
      remainingBudget: '0',
      advanceIssued: '0',
      advanceSpent: '0',
      returnPending: '0',
      returnConfirmed: '0',
      advanceBalance: '0'
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
    canApprove: isCashier,
    isBudgetAuthority,
    canViewTaskAssignee: isMasterAdmin || isCommitteeTaskManager || isBudgetAuthority,
    canCreateSubtaskTransfers: false,
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
        if (!isAuthorityReview || !access.isBudgetAuthority) {
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
      if (cashierOnly ? !access.isCashier : !access.isOwner) {
        throwEventError('FORBIDDEN', cashierOnly ? 'Only the assigned event treasurer can record this payment' : 'Only the task owner can record this transaction');
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
          const [rows] = await connection.query<any[]>(
            `SELECT
               COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_ISSUED' AND status = 'CONFIRMED' THEN amount ELSE 0 END), 0) AS issued,
               COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_EXPENSE' AND status = 'CONFIRMED' THEN amount ELSE 0 END), 0) AS spent,
               COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_RETURN' AND status IN ('PENDING', 'CONFIRMED') THEN amount ELSE 0 END), 0) AS returned
             FROM task_finance_transactions WHERE task_id = ?`,
            [taskId]
          );
          const available = decimalCents(rows[0].issued) - decimalCents(rows[0].spent) - decimalCents(rows[0].returned);
          if (cents > available) throwEventError('BAD_REQUEST', 'Amount exceeds the available task advance balance');
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
        const [result] = await connection.execute<any>(
          `INSERT INTO task_finance_transactions
             (task_id, request_id, recipient_user_id, transaction_type, amount, description, status, created_by, confirmed_by, confirmed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'PENDING' ? 'NULL' : 'CURRENT_TIMESTAMP'})`,
          [taskId, requestId, recipientUserId, transactionType, amount, description, status, userId, status === 'PENDING' ? null : userId]
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

    async createSubtaskTransfer(
      _: unknown,
      args: { input: { parentTaskId: number; subtaskId: number; amount: string; description: string } },
      context: unknown
    ) {
      const userId = await getLoggedInUserId(context);
      const parentTaskId = Number(args.input?.parentTaskId);
      const subtaskId = Number(args.input?.subtaskId);
      const { amount, cents } = parseAmount(args.input?.amount);
      const description = cleanText(args.input?.description, 'Description');
      const access = await getFinanceAccess(parentTaskId, userId);
      if (!access.isOwner) {
        throwEventError('FORBIDDEN', 'Only the parent task owner can record subtask transfers');
      }

      const connection = await getConnection();
      let transferId: number;
      try {
        await connection.beginTransaction();
        const [parentRows] = await connection.query<any[]>(
          `SELECT owner_user_id AS ownerUserId
           FROM tasks
           WHERE id = ?
           FOR UPDATE`,
          [parentTaskId]
        );
        if (!parentRows[0]) throwEventError('NOT_FOUND', 'Parent task not found');
        if (Number(parentRows[0].ownerUserId) !== userId) {
          throwEventError('FORBIDDEN', 'Only the parent task owner can record subtask transfers');
        }

        const [subtaskRows] = await connection.query<any[]>(
          `SELECT id, owner_user_id AS ownerUserId, CAST(budget_amount AS CHAR) AS budgetAmount
           FROM tasks
           WHERE id = ? AND parent_id = ?
           FOR UPDATE`,
          [subtaskId, parentTaskId]
        );
        const subtask = subtaskRows[0];
        if (!subtask) throwEventError('BAD_REQUEST', 'The selected task is not a direct subtask');
        if (subtask.ownerUserId === null) {
          throwEventError('CONFLICT', 'Assign a subtask owner before recording a transfer');
        }

        const [transferRows] = await connection.query<any[]>(
          `SELECT COALESCE(SUM(amount), 0) AS transferredAmount
           FROM task_subtask_transfers
           WHERE subtask_id = ? AND status IN ('PENDING', 'CONFIRMED')`,
          [subtaskId]
        );
        const availableAmount = decimalCents(subtask.budgetAmount)
          - decimalCents(transferRows[0]?.transferredAmount);
        if (cents > availableAmount) {
          throwEventError('BAD_REQUEST', "Transfer amount exceeds the subtask's untransferred budget");
        }

        const [result] = await connection.execute<any>(
          `INSERT INTO task_subtask_transfers
             (parent_task_id, subtask_id, sender_user_id, recipient_user_id, amount, description)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [parentTaskId, subtaskId, userId, Number(subtask.ownerUserId), amount, description]
        );
        transferId = Number(result.insertId);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return loadSubtaskTransfer(transferId!, userId);
    },

    async confirmSubtaskTransferReceipt(_: unknown, args: { transferId: number }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      const transferId = Number(args.transferId);
      if (!Number.isInteger(transferId) || transferId <= 0) {
        throwEventError('BAD_REQUEST', 'transferId must be a positive integer');
      }

      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query<any[]>(
          `SELECT recipient_user_id AS recipientUserId, status
           FROM task_subtask_transfers
           WHERE id = ?
           FOR UPDATE`,
          [transferId]
        );
        const transfer = rows[0];
        if (!transfer) throwEventError('NOT_FOUND', 'Subtask transfer not found');
        if (Number(transfer.recipientUserId) !== userId) {
          throwEventError('FORBIDDEN', 'Only the subtask owner can confirm this transfer');
        }
        if (transfer.status !== 'PENDING') {
          throwEventError('CONFLICT', 'This subtask transfer has already been confirmed');
        }

        const [update] = await connection.execute<any>(
          `UPDATE task_subtask_transfers
           SET status = 'CONFIRMED', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND recipient_user_id = ? AND status = 'PENDING'`,
          [userId, transferId, userId]
        );
        if (update.affectedRows !== 1) {
          throwEventError('CONFLICT', 'This subtask transfer has already been confirmed');
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return loadSubtaskTransfer(transferId, userId);
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
      if (!access.isCashier) throwEventError('FORBIDDEN', 'Only the assigned event treasurer can confirm a cash return');
      if (access.isOwner) throwEventError('FORBIDDEN', 'A task owner cannot confirm their own cash return');
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
    }
  }
};
