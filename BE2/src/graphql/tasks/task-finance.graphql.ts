import { RowDataPacket } from 'mysql2/promise';
import { getConnection, query } from '../../config/db';
import { hasPermission, PERMISSIONS } from '../../authorization/authorization';
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
       FROM task_finance_requests
       WHERE task_id IN (${placeholders})
         AND request_type IN ('ADVANCE', 'TOP_UP') AND status = 'PENDING'
       UNION
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
    [...ids, ...ids, ...ids]
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

export const taskFinanceTypes = `
  enum TaskFinanceRequestType { ADVANCE TOP_UP }
  enum TaskFinanceRequestStatus { PENDING APPROVED PARTIALLY_APPROVED REJECTED }
  enum TaskFinanceTransactionType { ADVANCE_ISSUED ADVANCE_EXPENSE ADVANCE_RETURN }
  enum TaskFinanceTransactionStatus { RECORDED PENDING CONFIRMED REJECTED }

  type TaskFinanceRequest {
    id: Int!
    requestType: TaskFinanceRequestType!
    requestedAmount: String!
    approvedAmount: String
    reason: String!
    status: TaskFinanceRequestStatus!
    requestedByName: String!
    reviewedByName: String
    reviewNote: String
    createdAt: String!
    reviewedAt: String
  }

  type TaskFinanceTransaction {
    id: Int!
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
    transactions: [TaskFinanceTransaction!]!
    summary: TaskFinanceSummary!
    budgetAmount: String!
    budgetRequestId: Int
    requestedBudgetAmount: String
    budgetRequestStatus: String
    budgetRequestedByName: String
    canEditBudget: Boolean!
    canRequestBudgetIncrease: Boolean!
    canReviewBudgetRequest: Boolean!
    canCancelBudgetRequest: Boolean!
    canRequest: Boolean!
    canApprove: Boolean!
  }

  input TaskFinanceReviewInput {
    requestId: Int!
    decision: String!
    approvedAmount: String
    note: String
  }

  input TaskFinanceTransactionInput {
    taskId: Int!
    transactionType: TaskFinanceTransactionType!
    amount: String!
    description: String!
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
`;

export const taskFinanceMutationFields = `
  reviewTaskFinanceRequest(input: TaskFinanceReviewInput!): TaskFinanceRequest!
  recordTaskFinanceTransaction(input: TaskFinanceTransactionInput!): TaskFinanceTransaction!
  confirmTaskFinanceReceipt(transactionId: Int!): TaskFinanceTransaction!
  reviewTaskFinanceReturn(input: TaskFinanceReturnReviewInput!): TaskFinanceTransaction!
`;

function parseAmount(value: unknown): { amount: string; cents: bigint } {
  const raw = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(raw)) {
    throwEventError('BAD_REQUEST', 'Amount must be a positive number with up to 2 decimal places');
  }
  const [whole, fraction = ''] = raw.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents <= 0n) throwEventError('BAD_REQUEST', 'Amount must be greater than zero');
  return { amount: `${whole}.${fraction.padEnd(2, '0')}`, cents };
}

function decimalCents(value: unknown): bigint {
  const raw = String(value ?? '0.00');
  const [whole, fraction = ''] = raw.split('.');
  return BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

function centsDecimal(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
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
  isOwner: boolean;
  isCashier: boolean;
}> {
  if (!Number.isInteger(taskId) || taskId <= 0) throwEventError('BAD_REQUEST', 'taskId must be a positive integer');
  const tasks = await query<Array<RowDataPacket & { taskId: number; eventId: number; ownerUserId: number | null }>>(
    `SELECT id AS taskId, event_id AS eventId, owner_user_id AS ownerUserId
     FROM tasks WHERE id = ? LIMIT 1`,
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
  if (!allowReadOnly && !isOwner && !isCashier) {
    throwEventError('FORBIDDEN', 'Only the task owner or assigned event treasurer can perform task finance actions');
  }
  return {
    taskId: Number(task.taskId),
    eventId: Number(task.eventId),
    ownerUserId: task.ownerUserId === null ? null : Number(task.ownerUserId),
    isOwner,
    isCashier
  };
}

async function getRequestAccess(requestId: number, userId: number) {
  const rows = await query<Array<RowDataPacket & { taskId: number }>>(
    `SELECT task_id AS taskId FROM task_finance_requests WHERE id = ? LIMIT 1`,
    [requestId]
  );
  if (!rows[0]) throwEventError('NOT_FOUND', 'Finance request not found');
  return getFinanceAccess(Number(rows[0].taskId), userId);
}

async function getTransactionAccess(transactionId: number, userId: number) {
  const rows = await query<Array<RowDataPacket & { taskId: number }>>(
    `SELECT task_id AS taskId FROM task_finance_transactions WHERE id = ? LIMIT 1`,
    [transactionId]
  );
  if (!rows[0]) throwEventError('NOT_FOUND', 'Finance transaction not found');
  return getFinanceAccess(Number(rows[0].taskId), userId);
}

async function loadRequest(requestId: number): Promise<any> {
  const rows = await query<any[]>(
    `SELECT r.id, r.request_type AS requestType, CAST(r.requested_amount AS CHAR) AS requestedAmount,
            CAST(r.approved_amount AS CHAR) AS approvedAmount, r.reason, r.status,
            requester.name AS requestedByName, reviewer.name AS reviewedByName, r.review_note AS reviewNote,
            DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
            DATE_FORMAT(r.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewedAt
     FROM task_finance_requests r
     INNER JOIN users requester ON requester.id = r.requested_by
     LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
     WHERE r.id = ?`,
    [requestId]
  );
  return rows[0];
}

async function loadTransaction(transactionId: number, userId: number): Promise<any> {
  const rows = await query<any[]>(
    `SELECT t.id, t.request_id AS requestId, t.transaction_type AS transactionType,
            CAST(t.amount AS CHAR) AS amount, t.description, t.status,
            creator.name AS createdByName, confirmer.name AS confirmedByName,
            DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
            DATE_FORMAT(t.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt,
            recipient.name AS recipientName, receiver.name AS receivedByName,
            DATE_FORMAT(t.received_at, '%Y-%m-%d %H:%i:%s') AS receivedAt,
            t.recipient_user_id AS recipientUserId
     FROM task_finance_transactions t
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
  return {
    ...transaction,
    canConfirmReceipt: isPayment
      && transaction.receivedAt === null
      && Number(transaction.recipientUserId) === userId
  };
}

async function loadFinance(taskId: number, userId: number): Promise<any> {
  const access = await getFinanceAccess(taskId, userId, true);
  const [requests, transactions, aggregates, taskRows, todoExpenseRows, childBudgetRows] = await Promise.all([
    query<any[]>(
      `SELECT r.id, r.request_type AS requestType, CAST(r.requested_amount AS CHAR) AS requestedAmount,
              CAST(r.approved_amount AS CHAR) AS approvedAmount, r.reason, r.status,
              requester.name AS requestedByName, reviewer.name AS reviewedByName, r.review_note AS reviewNote,
              DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              DATE_FORMAT(r.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewedAt
       FROM task_finance_requests r
       INNER JOIN users requester ON requester.id = r.requested_by
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       WHERE r.task_id = ? AND r.request_type IN ('ADVANCE', 'TOP_UP')
       ORDER BY r.created_at DESC, r.id DESC`,
      [taskId]
    ),
    query<any[]>(
      `SELECT t.id, t.request_id AS requestId, t.transaction_type AS transactionType,
              CAST(t.amount AS CHAR) AS amount, t.description, t.status,
              creator.name AS createdByName, confirmer.name AS confirmedByName,
              DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              DATE_FORMAT(t.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt,
              recipient.name AS recipientName, receiver.name AS receivedByName,
              DATE_FORMAT(t.received_at, '%Y-%m-%d %H:%i:%s') AS receivedAt,
              t.recipient_user_id AS recipientUserId
       FROM task_finance_transactions t
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
              task.created_by AS createdBy,
              budgetRequest.id AS budgetRequestId,
              CAST(GREATEST(0, budgetRequest.requested_amount - task.budget_amount) AS CHAR) AS requestedBudgetAmount,
              budgetRequest.status AS budgetRequestStatus,
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
    )
  ]);
  const financeTransactions = transactions.map((transaction) => {
    const isPayment = transaction.transactionType === 'ADVANCE_ISSUED';
    const { recipientUserId, ...visibleTransaction } = transaction;
    const canConfirmReceipt = isPayment
      && transaction.receivedAt === null
      && Number(recipientUserId) === userId;
    return { ...visibleTransaction, canConfirmReceipt };
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
  const isMasterAdmin = await hasPermission(
    userId,
    PERMISSIONS.EVENT_TASK_MANAGE_ANY,
    { type: 'EVENT', id: access.eventId }
  );
  const canEditBudget = Number(taskBudget.createdBy) === userId || isMasterAdmin;
  const budgetRequestId = taskBudget.budgetRequestId === null
    ? null
    : Number(taskBudget.budgetRequestId);
  return {
    requests,
    transactions: financeTransactions,
    summary: {
      sanctionedBudget: centsDecimal(sanctionedBudget),
      checklistExpenses: centsDecimal(checklistExpenses),
      subtaskSpent: centsDecimal(allocatedChildBudgets),
      remainingBudget: centsDecimal(sanctionedBudget - allocatedChildBudgets),
      advanceIssued: centsDecimal(advanceIssued),
      advanceSpent: centsDecimal(advanceSpent),
      returnPending: centsDecimal(returnPending),
      returnConfirmed: centsDecimal(returnConfirmed),
      advanceBalance: centsDecimal(advanceIssued - advanceSpent - returnPending - returnConfirmed)
    },
    budgetAmount: String(taskBudget.sanctionedBudget),
    budgetRequestId,
    requestedBudgetAmount: taskBudget.requestedBudgetAmount === null
      ? null
      : String(taskBudget.requestedBudgetAmount),
    budgetRequestStatus: taskBudget.budgetRequestStatus || null,
    budgetRequestedByName: taskBudget.budgetRequestedByName || null,
    canEditBudget,
    canRequestBudgetIncrease: access.isOwner && !canEditBudget,
    canReviewBudgetRequest: budgetRequestId !== null && canEditBudget,
    canCancelBudgetRequest: budgetRequestId !== null && (
      Number(taskBudget.budgetRequestedBy) === userId || isMasterAdmin
    ),
    canRequest: access.isOwner,
    canApprove: access.isCashier && !access.isOwner
  };
}

export const taskFinanceResolvers = {
  Query: {
    async taskFinance(_: unknown, args: { taskId: number }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      return loadFinance(Number(args.taskId), userId);
    }
  },
  Mutation: {
    async reviewTaskFinanceRequest(_: unknown, args: { input: { requestId: number; decision: string; approvedAmount?: string | null; note?: string | null } }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      const requestId = Number(args.input?.requestId);
      const access = await getRequestAccess(requestId, userId);
      if (!access.isCashier) throwEventError('FORBIDDEN', 'Only the assigned event treasurer can review finance requests');
      if (access.isOwner) throwEventError('FORBIDDEN', 'A task owner cannot review their own finance request');
      const decision = String(args.input.decision || '').toUpperCase();
      if (!['APPROVE', 'REJECT'].includes(decision)) throwEventError('BAD_REQUEST', 'Decision must be APPROVE or REJECT');
      const note = args.input.note ? cleanText(args.input.note, 'Review note') : null;
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query<any[]>(
          `SELECT id, task_id AS taskId, request_type AS requestType,
                  CAST(requested_amount AS CHAR) AS requestedAmount, status
           FROM task_finance_requests WHERE id = ? FOR UPDATE`,
          [requestId]
        );
        const request = rows[0];
        if (!request) throwEventError('NOT_FOUND', 'Finance request not found');
        if (request.requestType !== 'ADVANCE' && request.requestType !== 'TOP_UP') {
          throwEventError('NOT_FOUND', 'Finance request not found');
        }
        if (request.status !== 'PENDING') throwEventError('CONFLICT', 'This finance request has already been reviewed');
        let approvedAmount: string | null = null;
        let nextStatus = 'REJECTED';
        if (decision === 'APPROVE') {
          const amount = parseAmount(args.input.approvedAmount ?? request.requestedAmount);
          if (amount.cents > decimalCents(request.requestedAmount)) {
            throwEventError('BAD_REQUEST', 'Approved amount cannot exceed the requested amount');
          }
          approvedAmount = amount.amount;
          nextStatus = amount.cents === decimalCents(request.requestedAmount) ? 'APPROVED' : 'PARTIALLY_APPROVED';
        }
        const [requestUpdate] = await connection.execute<any>(
          `UPDATE task_finance_requests
           SET status = ?, approved_amount = ?, reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'PENDING'`,
          [nextStatus, approvedAmount, userId, note, requestId]
        );
        if (requestUpdate.affectedRows !== 1) {
          throwEventError('CONFLICT', 'This finance request has already been reviewed');
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return loadRequest(requestId);
    },

    async recordTaskFinanceTransaction(_: unknown, args: { input: { taskId: number; transactionType: TransactionType; amount: string; description: string; requestId?: number | null } }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      const taskId = Number(args.input?.taskId);
      const access = await getFinanceAccess(taskId, userId);
      const transactionType = String(args.input.transactionType).toUpperCase() as TransactionType;
      if (!transactionTypes.includes(transactionType)) throwEventError('BAD_REQUEST', 'Invalid finance transaction type');
      if (transactionType === 'ADVANCE_EXPENSE') {
        throwEventError('BAD_REQUEST', 'Record task spending as a checklist item expense');
      }
      const { amount, cents } = parseAmount(args.input.amount);
      const description = cleanText(args.input.description, 'Description');
      const requestId = args.input.requestId ? Number(args.input.requestId) : null;
      const cashierOnly = transactionType === 'ADVANCE_ISSUED';
      if (cashierOnly ? !access.isCashier : !access.isOwner) {
        throwEventError('FORBIDDEN', cashierOnly ? 'Only the assigned event treasurer can record this payment' : 'Only the task owner can record this transaction');
      }
      if (transactionType === 'ADVANCE_RETURN' && requestId) {
        throwEventError('BAD_REQUEST', 'This transaction type cannot reference a finance request');
      }
      if (transactionType === 'ADVANCE_ISSUED' && !requestId) {
        throwEventError('BAD_REQUEST', 'A reviewed request is required for this payment');
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
