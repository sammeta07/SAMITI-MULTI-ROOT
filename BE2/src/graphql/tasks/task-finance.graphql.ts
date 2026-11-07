import { RowDataPacket } from 'mysql2/promise';
import { getConnection, query } from '../../config/db';
import { getLoggedInUserId, throwEventError } from '../events/details/voting/event-voting-core.graphql';

const requestTypes = ['ADVANCE', 'TOP_UP', 'REIMBURSEMENT'] as const;
const transactionTypes = [
  'ADVANCE_ISSUED',
  'ADVANCE_EXPENSE',
  'PERSONAL_EXPENSE',
  'ADVANCE_RETURN',
  'REIMBURSEMENT_PAID'
] as const;

type RequestType = typeof requestTypes[number];
type TransactionType = typeof transactionTypes[number];

export const taskFinanceTypes = `
  enum TaskFinanceRequestType { ADVANCE TOP_UP REIMBURSEMENT }
  enum TaskFinanceRequestStatus { PENDING APPROVED PARTIALLY_APPROVED REJECTED PAID }
  enum TaskFinanceTransactionType { ADVANCE_ISSUED ADVANCE_EXPENSE PERSONAL_EXPENSE ADVANCE_RETURN REIMBURSEMENT_PAID }
  enum TaskFinanceTransactionStatus { RECORDED PENDING CONFIRMED REJECTED PAID }

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
  }

  type TaskFinanceSummary {
    advanceIssued: String!
    advanceSpent: String!
    personalSpent: String!
    returnPending: String!
    returnConfirmed: String!
    reimbursementPaid: String!
    advanceBalance: String!
    reimbursementDue: String!
  }

  type TaskFinancePayload {
    requests: [TaskFinanceRequest!]!
    transactions: [TaskFinanceTransaction!]!
    summary: TaskFinanceSummary!
    canRequest: Boolean!
    canApprove: Boolean!
  }

  input TaskFinanceRequestInput {
    taskId: Int!
    requestType: TaskFinanceRequestType!
    amount: String!
    reason: String!
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
  createTaskFinanceRequest(input: TaskFinanceRequestInput!): TaskFinanceRequest!
  createTaskPersonalExpense(input: TaskFinanceTransactionInput!): TaskFinancePayload!
  reviewTaskFinanceRequest(input: TaskFinanceReviewInput!): TaskFinanceRequest!
  recordTaskFinanceTransaction(input: TaskFinanceTransactionInput!): TaskFinanceTransaction!
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

async function getFinanceAccess(taskId: number, userId: number): Promise<{
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
  if (!isOwner && !isCashier) throwEventError('FORBIDDEN', 'Only the task owner or assigned event treasurer can access task finances');
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

async function loadTransaction(transactionId: number): Promise<any> {
  const rows = await query<any[]>(
    `SELECT t.id, t.request_id AS requestId, t.transaction_type AS transactionType,
            CAST(t.amount AS CHAR) AS amount, t.description, t.status,
            creator.name AS createdByName, confirmer.name AS confirmedByName,
            DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
            DATE_FORMAT(t.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt
     FROM task_finance_transactions t
     INNER JOIN users creator ON creator.id = t.created_by
     LEFT JOIN users confirmer ON confirmer.id = t.confirmed_by
     WHERE t.id = ?`,
    [transactionId]
  );
  return rows[0];
}

async function loadFinance(taskId: number, userId: number): Promise<any> {
  const access = await getFinanceAccess(taskId, userId);
  const [requests, transactions, aggregates] = await Promise.all([
    query<any[]>(
      `SELECT r.id, r.request_type AS requestType, CAST(r.requested_amount AS CHAR) AS requestedAmount,
              CAST(r.approved_amount AS CHAR) AS approvedAmount, r.reason, r.status,
              requester.name AS requestedByName, reviewer.name AS reviewedByName, r.review_note AS reviewNote,
              DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              DATE_FORMAT(r.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewedAt
       FROM task_finance_requests r
       INNER JOIN users requester ON requester.id = r.requested_by
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       WHERE r.task_id = ? ORDER BY r.created_at DESC, r.id DESC`,
      [taskId]
    ),
    query<any[]>(
      `SELECT t.id, t.request_id AS requestId, t.transaction_type AS transactionType,
              CAST(t.amount AS CHAR) AS amount, t.description, t.status,
              creator.name AS createdByName, confirmer.name AS confirmedByName,
              DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
              DATE_FORMAT(t.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmedAt
       FROM task_finance_transactions t
       INNER JOIN users creator ON creator.id = t.created_by
       LEFT JOIN users confirmer ON confirmer.id = t.confirmed_by
       WHERE t.task_id = ? ORDER BY t.created_at DESC, t.id DESC`,
      [taskId]
    ),
    query<any[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_ISSUED' AND status = 'CONFIRMED' THEN amount ELSE 0 END), 0) AS advanceIssued,
         COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_EXPENSE' AND status = 'CONFIRMED' THEN amount ELSE 0 END), 0) AS advanceSpent,
         COALESCE(SUM(CASE WHEN transaction_type = 'PERSONAL_EXPENSE' THEN amount ELSE 0 END), 0) AS personalSpent,
         COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING' THEN amount ELSE 0 END), 0) AS returnPending,
         COALESCE(SUM(CASE WHEN transaction_type = 'ADVANCE_RETURN' AND status = 'CONFIRMED' THEN amount ELSE 0 END), 0) AS returnConfirmed,
         COALESCE(SUM(CASE WHEN transaction_type = 'REIMBURSEMENT_PAID' AND status = 'PAID' THEN amount ELSE 0 END), 0) AS reimbursementPaid
       FROM task_finance_transactions WHERE task_id = ?`,
      [taskId]
    )
  ]);
  const aggregate = aggregates[0] ?? {};
  const advanceIssued = decimalCents(aggregate.advanceIssued);
  const advanceSpent = decimalCents(aggregate.advanceSpent);
  const returnPending = decimalCents(aggregate.returnPending);
  const returnConfirmed = decimalCents(aggregate.returnConfirmed);
  const personalSpent = decimalCents(aggregate.personalSpent);
  const reimbursementPaid = decimalCents(aggregate.reimbursementPaid);
  const approvedReimbursementRows = await query<any[]>(
    `SELECT COALESCE(SUM(approved_amount), 0) AS total
     FROM task_finance_requests WHERE task_id = ? AND request_type = 'REIMBURSEMENT'
       AND status IN ('APPROVED', 'PARTIALLY_APPROVED', 'PAID')`,
    [taskId]
  );
  const approvedReimbursement = decimalCents(approvedReimbursementRows[0]?.total);
  return {
    requests,
    transactions,
    summary: {
      advanceIssued: centsDecimal(advanceIssued),
      advanceSpent: centsDecimal(advanceSpent),
      personalSpent: centsDecimal(personalSpent),
      returnPending: centsDecimal(returnPending),
      returnConfirmed: centsDecimal(returnConfirmed),
      reimbursementPaid: centsDecimal(reimbursementPaid),
      advanceBalance: centsDecimal(advanceIssued - advanceSpent - returnPending - returnConfirmed),
      reimbursementDue: centsDecimal(approvedReimbursement - reimbursementPaid)
    },
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
    async createTaskFinanceRequest(_: unknown, args: { input: { taskId: number; requestType: RequestType; amount: string; reason: string } }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      const taskId = Number(args.input?.taskId);
      const access = await getFinanceAccess(taskId, userId);
      if (!access.isOwner) throwEventError('FORBIDDEN', 'Only the task owner can request funds');
      const requestType = String(args.input.requestType).toUpperCase() as RequestType;
      if (!['ADVANCE', 'TOP_UP'].includes(requestType)) throwEventError('BAD_REQUEST', 'Use a personal expense claim for reimbursements');
      const { amount } = parseAmount(args.input.amount);
      const reason = cleanText(args.input.reason, 'Reason');
      const connection = await getConnection();
      let requestId: number;
      try {
        await connection.beginTransaction();
        await connection.query('SELECT id FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
        const [pending] = await connection.query<any[]>(
          `SELECT id FROM task_finance_requests
           WHERE task_id = ? AND request_type IN ('ADVANCE', 'TOP_UP') AND status = 'PENDING'
           LIMIT 1 FOR UPDATE`,
          [taskId]
        );
        if (pending.length) throwEventError('CONFLICT', 'Resolve the current pending advance request first');
        if (requestType === 'ADVANCE') {
          const [existing] = await connection.query<any[]>(
            `SELECT id FROM task_finance_requests
             WHERE task_id = ? AND request_type = 'ADVANCE' AND status <> 'REJECTED'
             LIMIT 1`,
            [taskId]
          );
          if (existing.length) throwEventError('CONFLICT', 'Use an additional advance request for more funds');
        } else {
          const [existingAdvance] = await connection.query<any[]>(
            `SELECT id FROM task_finance_requests
             WHERE task_id = ? AND request_type = 'ADVANCE'
               AND status IN ('APPROVED', 'PARTIALLY_APPROVED', 'PAID')
             LIMIT 1`,
            [taskId]
          );
          if (!existingAdvance.length) throwEventError('CONFLICT', 'Request an initial advance before requesting additional funds');
        }
        const [result] = await connection.execute<any>(
          `INSERT INTO task_finance_requests (task_id, request_type, requested_amount, reason, requested_by)
           VALUES (?, ?, ?, ?, ?)`,
          [taskId, requestType, amount, reason, userId]
        );
        requestId = Number(result.insertId);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return loadRequest(requestId!);
    },

    async createTaskPersonalExpense(_: unknown, args: { input: { taskId: number; amount: string; description: string } }, context: unknown) {
      const userId = await getLoggedInUserId(context);
      const taskId = Number(args.input?.taskId);
      const access = await getFinanceAccess(taskId, userId);
      if (!access.isOwner) throwEventError('FORBIDDEN', 'Only the task owner can record a personal expense');
      const { amount } = parseAmount(args.input.amount);
      const description = cleanText(args.input.description, 'Expense description');
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const [expense] = await connection.execute<any>(
          `INSERT INTO task_finance_transactions
             (task_id, transaction_type, amount, description, status, created_by)
           VALUES (?, 'PERSONAL_EXPENSE', ?, ?, 'PENDING', ?)`,
          [taskId, amount, description, userId]
        );
        await connection.execute(
          `INSERT INTO task_finance_requests
             (task_id, request_type, requested_amount, reason, status, requested_by, source_transaction_id)
           VALUES (?, 'REIMBURSEMENT', ?, ?, 'PENDING', ?, ?)`,
          [taskId, amount, description, userId, Number(expense.insertId)]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return loadFinance(taskId, userId);
    },

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
                  CAST(requested_amount AS CHAR) AS requestedAmount, source_transaction_id AS sourceTransactionId, status
           FROM task_finance_requests WHERE id = ? FOR UPDATE`,
          [requestId]
        );
        const request = rows[0];
        if (!request) throwEventError('NOT_FOUND', 'Finance request not found');
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
        if (request.requestType === 'REIMBURSEMENT' && request.sourceTransactionId) {
          const [expenseUpdate] = await connection.execute<any>(
            `UPDATE task_finance_transactions
             SET status = ?, confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'PENDING'`,
            [decision === 'APPROVE' ? 'CONFIRMED' : 'REJECTED', userId, request.sourceTransactionId]
          );
          if (expenseUpdate.affectedRows !== 1) {
            throwEventError('CONFLICT', 'This personal expense has already been reviewed');
          }
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
      if (transactionType === 'PERSONAL_EXPENSE') throwEventError('BAD_REQUEST', 'Use the personal expense claim action');
      const { amount, cents } = parseAmount(args.input.amount);
      const description = cleanText(args.input.description, 'Description');
      const requestId = args.input.requestId ? Number(args.input.requestId) : null;
      const cashierOnly = transactionType === 'ADVANCE_ISSUED' || transactionType === 'REIMBURSEMENT_PAID';
      if (cashierOnly ? !access.isCashier : !access.isOwner) {
        throwEventError('FORBIDDEN', cashierOnly ? 'Only the assigned event treasurer can record this payment' : 'Only the task owner can record this transaction');
      }
      if (transactionType === 'ADVANCE_RETURN' && !requestId) {
        // Return receipts do not belong to an advance request.
      } else if (transactionType !== 'ADVANCE_ISSUED' && transactionType !== 'REIMBURSEMENT_PAID' && requestId) {
        throwEventError('BAD_REQUEST', 'This transaction type cannot reference a finance request');
      }
      if ((transactionType === 'ADVANCE_ISSUED' || transactionType === 'REIMBURSEMENT_PAID') && !requestId) {
        throwEventError('BAD_REQUEST', 'A reviewed request is required for this payment');
      }
      const connection = await getConnection();
      let transactionId: number;
      try {
        await connection.beginTransaction();
        await connection.query('SELECT id FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
        if (transactionType === 'ADVANCE_EXPENSE' || transactionType === 'ADVANCE_RETURN') {
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
            `SELECT status, CAST(approved_amount AS CHAR) AS approvedAmount
             FROM task_finance_requests WHERE id = ? AND task_id = ? FOR UPDATE`,
            [requestId, taskId]
          );
          const request = rows[0];
          if (!request || !['APPROVED', 'PARTIALLY_APPROVED'].includes(request.status)) {
            throwEventError('CONFLICT', 'Only an approved advance request can be issued');
          }
          const [issuedRows] = await connection.query<any[]>(
            `SELECT COALESCE(SUM(amount), 0) AS issued FROM task_finance_transactions
             WHERE request_id = ? AND transaction_type = 'ADVANCE_ISSUED' AND status = 'CONFIRMED'`,
            [requestId]
          );
          if (cents > decimalCents(request.approvedAmount) - decimalCents(issuedRows[0].issued)) {
            throwEventError('BAD_REQUEST', 'Payment exceeds the remaining approved amount');
          }
        }
        if (transactionType === 'REIMBURSEMENT_PAID') {
          const [rows] = await connection.query<any[]>(
            `SELECT status, task_id AS taskId, CAST(approved_amount AS CHAR) AS approvedAmount
             FROM task_finance_requests WHERE id = ? AND task_id = ? AND request_type = 'REIMBURSEMENT' FOR UPDATE`,
            [requestId, taskId]
          );
          const request = rows[0];
          if (!request || !['APPROVED', 'PARTIALLY_APPROVED', 'PAID'].includes(request.status)) {
            throwEventError('CONFLICT', 'Only an approved reimbursement can be paid');
          }
          const [paidRows] = await connection.query<any[]>(
            `SELECT COALESCE(SUM(amount), 0) AS paid FROM task_finance_transactions
             WHERE request_id = ? AND transaction_type = 'REIMBURSEMENT_PAID' AND status = 'PAID'`,
            [requestId]
          );
          if (cents > decimalCents(request.approvedAmount) - decimalCents(paidRows[0].paid)) {
            throwEventError('BAD_REQUEST', 'Payment exceeds the remaining approved reimbursement');
          }
        }
        const status = transactionType === 'ADVANCE_RETURN' ? 'PENDING'
          : transactionType === 'ADVANCE_EXPENSE' ? 'CONFIRMED'
            : transactionType === 'ADVANCE_ISSUED' ? 'CONFIRMED' : 'PAID';
        const [result] = await connection.execute<any>(
          `INSERT INTO task_finance_transactions
             (task_id, request_id, transaction_type, amount, description, status, created_by, confirmed_by, confirmed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${status === 'PENDING' ? 'NULL' : 'CURRENT_TIMESTAMP'})`,
          [taskId, requestId, transactionType, amount, description, status, userId, status === 'PENDING' ? null : userId]
        );
        transactionId = Number(result.insertId);
        if (transactionType === 'REIMBURSEMENT_PAID') {
          const [paidRows] = await connection.query<any[]>(
            `SELECT COALESCE(SUM(amount), 0) AS paid FROM task_finance_transactions
             WHERE request_id = ? AND transaction_type = 'REIMBURSEMENT_PAID' AND status = 'PAID'`,
            [requestId]
          );
          const [requestRows] = await connection.query<any[]>(
            `SELECT CAST(approved_amount AS CHAR) AS approvedAmount FROM task_finance_requests WHERE id = ?`,
            [requestId]
          );
          if (decimalCents(paidRows[0].paid) >= decimalCents(requestRows[0].approvedAmount)) {
            await connection.execute(`UPDATE task_finance_requests SET status = 'PAID' WHERE id = ?`, [requestId]);
          }
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return loadTransaction(transactionId!);
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
      return loadTransaction(transactionId);
    }
  }
};
