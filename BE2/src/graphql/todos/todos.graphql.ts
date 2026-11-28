import { getConnection, execute, query } from '../../config/db';
import type { PoolConnection } from 'mysql2/promise';
import { getLoggedInUserId, throwEventError } from '../events/details/voting/event-voting-core.graphql';
import { hasPermission, PERMISSIONS } from '../../authorization/authorization';

export const todoTypes = `
  enum TodoStatus {
    NEW
    IN_PROGRESS
    COMPLETED
    CANCELLED
    PENDING
  }

  enum TodoParentType {
    TASK
    PROGRAM
  }

  enum TodoExpenseStatus {
    RESERVED
    CONFIRMED
  }

  type TodoItem {
    id: Int!
    title: String!
    expenseAmount: String!
    expenseStatus: TodoExpenseStatus!
    expenseConfirmedByName: String
    expenseConfirmedAt: String
    status: TodoStatus!
    isCompleted: Boolean!
    createdBy: Int!
    canManage: Boolean!
    canUpdateStatus: Boolean!
    canConfirmExpense: Boolean!
    assignedUserId: Int
    assignedUserName: String
    createdByName: String
    createdAt: String!
    assignedByName: String
    assignedAt: String
    updatedByName: String
    updatedAt: String
  }

  type TodoAssignee {
    userId: Int!
    name: String!
  }

  input CreateTodoInput {
    parentType: TodoParentType!
    parentId: Int!
    title: String!
    expenseAmount: String = "0"
  }
`;

export const todoMutationFields = `
  createTodo(input: CreateTodoInput!): TodoItem!
  updateTodo(todoId: Int!, title: String!, isCompleted: Boolean!, expenseAmount: String): TodoItem!
  updateTodoDetails(todoId: Int!, title: String!, status: TodoStatus!, expenseAmount: String): TodoItem!
  setTodoStatus(todoId: Int!, status: TodoStatus!): TodoItem!
  confirmTodoExpense(todoId: Int!): TodoItem!
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
    committeeRole: role,
    hasCommitteeAccess,
    canManage: await hasPermission(
      userId,
      PERMISSIONS.TODO_MANAGE,
      { type: 'EVENT', id: eventId }
    ) ||
      Number(row.ownerUserId) === userId
  };
}

async function getTodoParent(todoId: number): Promise<{
  parentType: ParentType;
  parentId: number;
  createdBy: number;
  assignedUserId: number | null;
  status: string;
  isCompleted: boolean;
}> {
  const rows = await query<any[]>(
    `SELECT todo.task_id AS taskId, todo.program_id AS programId, todo.created_by AS createdBy,
            todo.assigned_user_id AS assignedUserId, todo.status, todo.is_completed AS isCompleted
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
    parentId: Number(parentType === 'TASK' ? rows[0].taskId : rows[0].programId),
    createdBy: Number(rows[0].createdBy),
    assignedUserId: rows[0].assignedUserId === null ? null : Number(rows[0].assignedUserId),
    status: String(rows[0].status),
    isCompleted: Boolean(Number(rows[0].isCompleted))
  };
}

async function requireTodoManagePermission(todoId: number, userId: number) {
  const todoParent = await getTodoParent(todoId);
  const permission = await getParentPermission(todoParent.parentType, todoParent.parentId, userId);
  if (
    todoParent.createdBy !== userId &&
    permission.committeeRole !== 'COMMITTEE_MASTER_ADMIN'
  ) {
    throwEventError('FORBIDDEN', 'Only the checklist creator or a committee master admin can manage this checklist item');
  }
  return { ...permission, ...todoParent };
}

async function requireTodoAssigneeStatusPermission(todoId: number, userId: number) {
  const todo = await getTodoParent(todoId);
  if (todo.assignedUserId !== userId) {
    throwEventError('FORBIDDEN', 'Only the checklist assignee can change its status');
  }
  return todo;
}

async function lockTodoForMutation(
  connection: PoolConnection,
  todoId: number,
  parentType: ParentType,
  parentId: number
): Promise<any> {
  if (parentType === 'TASK') {
    const [taskRows] = await connection.query<any[]>(
      'SELECT id FROM tasks WHERE id = ? FOR UPDATE',
      [parentId]
    );
    if (taskRows.length === 0) throwEventError('NOT_FOUND', 'Task not found');
  }
  const [todoRows] = await connection.query<any[]>(
    `SELECT id, task_id AS taskId, expense_amount AS expenseAmount,
            expense_status AS expenseStatus, status, assigned_user_id AS assignedUserId,
            is_completed AS isCompleted, created_by AS createdBy
     FROM todos
     WHERE id = ?
     FOR UPDATE`,
    [todoId]
  );
  if (todoRows.length === 0) throwEventError('NOT_FOUND', 'Todo not found');
  if (parentType === 'TASK' && Number(todoRows[0].taskId) !== parentId) {
    throwEventError('CONFLICT', 'Checklist task changed while it was being updated');
  }
  return todoRows[0];
}

async function getTodoItem(todoId: number, userId: number, canManage = true) {
  const rows = await query<any[]>(
    `SELECT
       todo.id,
       todo.title,
       CAST(todo.expense_amount AS CHAR) AS expenseAmount,
       todo.expense_status AS expenseStatus,
       expenseConfirmer.name AS expenseConfirmedByName,
       DATE_FORMAT(todo.expense_confirmed_at, '%Y-%m-%d %H:%i:%s') AS expenseConfirmedAt,
       todo.status,
       todo.is_completed AS isCompleted,
       todo.created_by AS createdBy,
       todo.assigned_user_id AS assignedUserId,
       assignee.name AS assignedUserName,
       creator.name AS createdByName,
       DATE_FORMAT(todo.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
       assigner.name AS assignedByName,
       DATE_FORMAT(todo.assigned_at, '%Y-%m-%d %H:%i:%s') AS assignedAt,
       updater.name AS updatedByName,
       DATE_FORMAT(todo.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt,
       CASE WHEN todo.task_id IS NOT NULL AND (
         task.owner_user_id = ? OR EXISTS (
           SELECT 1
           FROM users_events ue
           INNER JOIN events_roles_master erm ON erm.role_id = ue.role_id
           WHERE ue.event_id = task.event_id
             AND ue.user_id = ?
             AND (
               UPPER(REPLACE(REPLACE(TRIM(erm.role_name), ' ', '_'), '-', '_')) IN ('TREASURER', 'CASHIER', 'KOSHADHYAKSHA') OR
               UPPER(REPLACE(REPLACE(TRIM(erm.english_name), ' ', '_'), '-', '_')) IN ('TREASURER', 'CASHIER', 'KOSHADHYAKSHA') OR
               UPPER(REPLACE(REPLACE(TRIM(erm.hindi_name), ' ', '_'), '-', '_')) IN ('TREASURER', 'CASHIER', 'KOSHADHYAKSHA')
             )
         )
       ) THEN 1 ELSE 0 END AS canConfirmExpense
     FROM todos todo
     LEFT JOIN tasks task ON task.id = todo.task_id
     LEFT JOIN users assignee ON assignee.id = todo.assigned_user_id
     LEFT JOIN users creator ON creator.id = todo.created_by
     LEFT JOIN users assigner ON assigner.id = todo.assigned_by
     LEFT JOIN users updater ON updater.id = todo.updated_by
     LEFT JOIN users expenseConfirmer ON expenseConfirmer.id = todo.expense_confirmed_by
     WHERE todo.id = ?
     LIMIT 1`,
    [userId, userId, todoId]
  );
  const row = rows[0];

  return {
    id: Number(row.id),
    title: String(row.title),
    expenseAmount: String(row.expenseAmount),
    expenseStatus: String(row.expenseStatus),
    expenseConfirmedByName: row.expenseConfirmedByName || null,
    expenseConfirmedAt: row.expenseConfirmedAt || null,
    status: String(row.status),
    isCompleted: Boolean(Number(row.isCompleted)),
    createdBy: Number(row.createdBy),
    canManage,
    canUpdateStatus: row.assignedUserId !== null && Number(row.assignedUserId) === userId,
    canConfirmExpense: Boolean(Number(row.canConfirmExpense)),
    assignedUserId: row.assignedUserId === null ? null : Number(row.assignedUserId),
    assignedUserName: row.assignedUserName || null,
    createdByName: row.createdByName || null,
    createdAt: String(row.createdAt),
    assignedByName: row.assignedByName || null,
    assignedAt: row.assignedAt || null,
    updatedByName: row.updatedByName || null,
    updatedAt: String(row.updatedAt)
  };
}

function validateTodoExpenseAmount(value: unknown): string {
  const amount = String(value ?? '0').trim();
  if (!/^(?:0|[1-9]\d{0,9})$/.test(amount)) {
    throwEventError('BAD_REQUEST', 'expenseAmount must be a non-negative whole number of rupees');
  }
  return amount;
}

function todoAmountCents(value: unknown): bigint {
  const [whole, fraction = ''] = String(value ?? '0').split('.');
  return BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

export async function loadTodoReservationCapacity(
  connection: PoolConnection,
  taskId: number,
  excludedTodoId: number | null
): Promise<{ remainingTaskBudget: bigint; availableInHand: bigint }> {
  const [taskRows] = await connection.query<any[]>(
    'SELECT budget_amount AS budgetAmount FROM tasks WHERE id = ?',
    [taskId]
  );
  if (taskRows.length === 0) throwEventError('NOT_FOUND', 'Task not found');

  const [allocationRows] = await connection.query<any[]>(
    'SELECT COALESCE(SUM(budget_amount), 0) AS allocated FROM tasks WHERE parent_id = ?',
    [taskId]
  );
  const [todoRows] = await connection.query<any[]>(
    `SELECT
       COALESCE(SUM(CASE
         WHEN expense_status = 'CONFIRMED' OR
              (expense_status = 'RESERVED' AND status <> 'CANCELLED')
         THEN expense_amount ELSE 0
       END), 0) AS budgetUsage,
       COALESCE(SUM(CASE WHEN expense_status = 'CONFIRMED' THEN expense_amount ELSE 0 END), 0) AS confirmedExpenses,
       COALESCE(SUM(CASE
         WHEN expense_status = 'RESERVED' AND status <> 'CANCELLED'
         THEN expense_amount ELSE 0
       END), 0) AS reservedExpenses
     FROM todos
     WHERE task_id = ? AND (? IS NULL OR id <> ?)`,
    [taskId, excludedTodoId, excludedTodoId]
  );
  const [cashRows] = await connection.query<any[]>(
    `SELECT
       COALESCE(SUM(CASE
         WHEN transaction_type = 'ADVANCE_ISSUED' AND status = 'CONFIRMED'
         THEN amount ELSE 0
       END), 0) AS issued,
       COALESCE(SUM(CASE
         WHEN transaction_type = 'ADVANCE_EXPENSE' AND status = 'CONFIRMED'
         THEN amount ELSE 0
       END), 0) AS transactionExpenses,
       COALESCE(SUM(CASE
         WHEN transaction_type = 'ADVANCE_RETURN' AND status = 'CONFIRMED'
         THEN amount ELSE 0
       END), 0) AS returned,
       COALESCE(SUM(CASE
         WHEN transaction_type = 'ADVANCE_RETURN' AND status = 'PENDING'
         THEN amount ELSE 0
       END), 0) AS pendingReturns
     FROM task_finance_transactions
     WHERE task_id = ?`,
    [taskId]
  );
  const [transferRows] = await connection.query<any[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN subtask_id = ? THEN amount ELSE 0 END), 0) AS incoming,
       COALESCE(SUM(CASE WHEN parent_task_id = ? THEN amount ELSE 0 END), 0) AS outgoing
     FROM task_subtask_transfers
     WHERE status = 'CONFIRMED' AND (parent_task_id = ? OR subtask_id = ?)`,
    [taskId, taskId, taskId, taskId]
  );
  const budgetLeft = todoAmountCents(taskRows[0].budgetAmount) -
    todoAmountCents(allocationRows[0]?.allocated) -
    todoAmountCents(todoRows[0]?.budgetUsage);
  const spendableCash = todoAmountCents(cashRows[0]?.issued) -
    todoAmountCents(cashRows[0]?.transactionExpenses) -
    todoAmountCents(todoRows[0]?.confirmedExpenses) -
    todoAmountCents(cashRows[0]?.returned) -
    todoAmountCents(cashRows[0]?.pendingReturns) -
    todoAmountCents(todoRows[0]?.reservedExpenses) +
    todoAmountCents(transferRows[0]?.incoming) -
    todoAmountCents(transferRows[0]?.outgoing);

  return {
    remainingTaskBudget: budgetLeft > 0n ? budgetLeft : 0n,
    availableInHand: spendableCash > 0n ? spendableCash : 0n
  };
}

async function requireTodoReservationCapacity(
  connection: PoolConnection,
  taskId: number,
  expenseAmount: string,
  status: string,
  excludedTodoId: number | null
): Promise<void> {
  const amountCents = todoAmountCents(expenseAmount);
  if (amountCents === 0n || status === 'CANCELLED') return;
  const capacity = await loadTodoReservationCapacity(connection, taskId, excludedTodoId);
  if (amountCents > capacity.remainingTaskBudget) {
    throwEventError('BAD_REQUEST', 'Checklist amount exceeds the task budget available after allocations and other checklist amounts');
  }
  if (amountCents > capacity.availableInHand) {
    throwEventError('BAD_REQUEST', 'Checklist amount exceeds available in-hand cash after other reservations');
  }
}

async function requireTaskFinanceActionPermission(taskId: number, userId: number): Promise<void> {
  const tasks = await query<any[]>(
    'SELECT event_id AS eventId, owner_user_id AS ownerUserId FROM tasks WHERE id = ? LIMIT 1',
    [taskId]
  );
  if (!tasks[0]) throwEventError('NOT_FOUND', 'Task not found');
  if (Number(tasks[0].ownerUserId) === userId) return;

  const cashierRows = await query<any[]>(
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
    [Number(tasks[0].eventId), userId]
  );
  if (Number(cashierRows[0]?.isCashier) !== 1) {
    throwEventError('FORBIDDEN', 'Only the task owner or event treasurer can confirm checklist expenses');
  }
}

async function saveTodoDetails(
  todoId: number,
  userId: number,
  title: string,
  expenseAmount: string | null,
  requestedStatus: string | ((todo: any) => string)
): Promise<any> {
  const parent = await getTodoParent(todoId);
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const todo = await lockTodoForMutation(connection, todoId, parent.parentType, parent.parentId);
    const status = typeof requestedStatus === 'function'
      ? requestedStatus(todo)
      : requestedStatus;
    if (status !== todo.status && Number(todo.assignedUserId) !== userId) {
      throwEventError('FORBIDDEN', 'Only the checklist assignee can change its status');
    }

    const nextExpenseAmount = expenseAmount ?? String(todo.expenseAmount);
    if (
      todo.expenseStatus === 'CONFIRMED' &&
      todoAmountCents(nextExpenseAmount) !== todoAmountCents(todo.expenseAmount)
    ) {
      throwEventError('CONFLICT', 'A confirmed checklist expense amount cannot be edited');
    }
    if (parent.parentType === 'TASK' && todo.expenseStatus === 'RESERVED') {
      await requireTodoReservationCapacity(
        connection,
        parent.parentId,
        nextExpenseAmount,
        status,
        todoId
      );
    }

    await connection.execute(
      `UPDATE todos
       SET title = ?,
           expense_amount = COALESCE(?, expense_amount),
           status = ?,
           is_completed = ?,
           updated_by = ?
       WHERE id = ?`,
      [
        title,
        expenseAmount,
        status,
        status === 'COMPLETED' ? 1 : 0,
        userId,
        todoId
      ]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const currentTodo = await getTodoParent(todoId);
  const parentPermission = await getParentPermission(currentTodo.parentType, currentTodo.parentId, userId);
  const canManage = currentTodo.createdBy === userId ||
    parentPermission.committeeRole === 'COMMITTEE_MASTER_ADMIN';
  return getTodoItem(todoId, userId, canManage);
}

export const todoResolvers = {
  Mutation: {
    async createTodo(_: any, args: { input?: { parentType?: ParentType; parentId?: number; title?: string; expenseAmount?: string | null } }, context: any) {
      const parentType = args?.input?.parentType;
      const parentId = Number(args?.input?.parentId);
      const title = String(args?.input?.title || '').trim();
      const expenseAmount = validateTodoExpenseAmount(args?.input?.expenseAmount);

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
      const connection = await getConnection();
      let todoId: number;
      try {
        await connection.beginTransaction();
        if (parentType === 'TASK') {
          const [taskRows] = await connection.query<any[]>(
            'SELECT id FROM tasks WHERE id = ? FOR UPDATE',
            [parentId]
          );
          if (taskRows.length === 0) throwEventError('NOT_FOUND', 'Task not found');
          await requireTodoReservationCapacity(connection, parentId, expenseAmount, 'NEW', null);
        }
        const [result] = await connection.execute<any>(
          `INSERT INTO todos (
             ${parentColumn}, title, expense_amount, expense_status, status,
             assigned_user_id, assigned_by, assigned_at, created_by, updated_by
           )
           VALUES (?, ?, ?, ?, 'NEW', NULL, NULL, NULL, ?, ?)`,
          [
            parentId,
            title,
            expenseAmount,
            parentType === 'TASK' ? 'RESERVED' : 'CONFIRMED',
            userId,
            userId
          ]
        );
        todoId = Number(result.insertId);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      const currentTodo = await getTodoParent(todoId);
      const parentPermission = await getParentPermission(
        currentTodo.parentType,
        currentTodo.parentId,
        userId
      );
      const canManage = currentTodo.createdBy === userId ||
        parentPermission.committeeRole === 'COMMITTEE_MASTER_ADMIN';
      return getTodoItem(todoId, userId, canManage);
    },

    async updateTodo(_: any, args: { todoId?: number; title?: string; isCompleted?: boolean; expenseAmount?: string | null }, context: any) {
      const todoId = Number(args?.todoId);
      const title = String(args?.title || '').trim();
      if (!Number.isInteger(todoId) || todoId <= 0 || !title || title.length > 255 || typeof args?.isCompleted !== 'boolean') {
        throwEventError('BAD_REQUEST', 'todoId, a title containing 1 to 255 characters, and isCompleted are required');
      }
      const expenseAmount = args.expenseAmount == null ? null : validateTodoExpenseAmount(args.expenseAmount);

      const userId = await getLoggedInUserId(context);
      await requireTodoManagePermission(todoId, userId);
      return saveTodoDetails(todoId, userId, title, expenseAmount, (todo) =>
        Boolean(args.isCompleted) === Boolean(Number(todo.isCompleted))
          ? String(todo.status)
          : args.isCompleted ? 'COMPLETED' : 'NEW'
      );
    },

    async updateTodoDetails(_: any, args: { todoId?: number; title?: string; status?: string; expenseAmount?: string | null }, context: any) {
      const todoId = Number(args?.todoId);
      const title = String(args?.title || '').trim();
      const status = String(args?.status || '').toUpperCase();
      if (!Number.isInteger(todoId) || todoId <= 0 || !title || title.length > 255 ||
        !['NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
        throwEventError('BAD_REQUEST', 'todoId, a valid title, and a valid status are required');
      }
      const expenseAmount = args.expenseAmount == null ? null : validateTodoExpenseAmount(args.expenseAmount);

      const userId = await getLoggedInUserId(context);
      const permission = await requireTodoManagePermission(todoId, userId);
      if (status !== permission.status && permission.assignedUserId !== userId) {
        throwEventError('FORBIDDEN', 'Only the checklist assignee can change its status');
      }
      return saveTodoDetails(todoId, userId, title, expenseAmount, status);
    },

    async setTodoStatus(_: any, args: { todoId?: number; status?: string }, context: any) {
      const todoId = Number(args?.todoId);
      const status = String(args?.status || '').toUpperCase();
      if (!Number.isInteger(todoId) || todoId <= 0 ||
        !['NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
        throwEventError('BAD_REQUEST', 'todoId and a valid status are required');
      }

      const userId = await getLoggedInUserId(context);
      const todo = await requireTodoAssigneeStatusPermission(todoId, userId);
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const lockedTodo = await lockTodoForMutation(
          connection,
          todoId,
          todo.parentType,
          todo.parentId
        );
        if (Number(lockedTodo.assignedUserId) !== userId) {
          throwEventError('FORBIDDEN', 'Only the checklist assignee can change its status');
        }
        if (todo.parentType === 'TASK' && lockedTodo.expenseStatus === 'RESERVED') {
          await requireTodoReservationCapacity(
            connection,
            todo.parentId,
            String(lockedTodo.expenseAmount),
            status,
            todoId
          );
        }
        await connection.execute(
          `UPDATE todos
           SET status = ?, is_completed = ?, updated_by = ?
           WHERE id = ? AND assigned_user_id = ?`,
          [status, status === 'COMPLETED' ? 1 : 0, userId, todoId, userId]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      const parentPermission = await getParentPermission(todo.parentType, todo.parentId, userId);
      const canManage = todo.createdBy === userId || parentPermission.committeeRole === 'COMMITTEE_MASTER_ADMIN';
      return getTodoItem(todoId, userId, canManage);
    },

    async confirmTodoExpense(_: any, args: { todoId?: number }, context: any) {
      const todoId = Number(args?.todoId);
      if (!Number.isInteger(todoId) || todoId <= 0) {
        throwEventError('BAD_REQUEST', 'todoId must be a positive integer');
      }

      const userId = await getLoggedInUserId(context);
      const parent = await getTodoParent(todoId);
      if (parent.parentType !== 'TASK') {
        throwEventError('BAD_REQUEST', 'Only task checklist expenses can be confirmed');
      }
      await requireTaskFinanceActionPermission(parent.parentId, userId);

      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const todo = await lockTodoForMutation(
          connection,
          todoId,
          parent.parentType,
          parent.parentId
        );
        await requireTaskFinanceActionPermission(parent.parentId, userId);
        if (todo.expenseStatus !== 'RESERVED') {
          throwEventError('CONFLICT', 'This checklist expense is already confirmed');
        }
        if (todo.status === 'CANCELLED') {
          throwEventError('BAD_REQUEST', 'A cancelled checklist expense cannot be confirmed');
        }
        const amount = todoAmountCents(todo.expenseAmount);
        if (amount <= 0n) {
          throwEventError('BAD_REQUEST', 'Checklist expense must be greater than zero');
        }
        await connection.execute(
          `UPDATE todos
           SET expense_status = 'CONFIRMED',
               expense_confirmed_by = ?,
               expense_confirmed_at = CURRENT_TIMESTAMP,
               updated_by = ?
           WHERE id = ? AND expense_status = 'RESERVED'`,
          [userId, userId, todoId]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      const currentTodo = await getTodoParent(todoId);
      const parentPermission = await getParentPermission(
        currentTodo.parentType,
        currentTodo.parentId,
        userId
      );
      const canManage = currentTodo.createdBy === userId ||
        parentPermission.committeeRole === 'COMMITTEE_MASTER_ADMIN';
      return getTodoItem(todoId, userId, canManage);
    },

    async assignTodo(_: any, args: { todoId?: number; ownerUserId?: number | null }, context: any) {
      const todoId = Number(args?.todoId);
      const ownerUserId = args.ownerUserId == null ? null : Number(args.ownerUserId);
      if (!Number.isInteger(todoId) || todoId <= 0 ||
        (ownerUserId !== null && (!Number.isInteger(ownerUserId) || ownerUserId <= 0))) {
        throwEventError('BAD_REQUEST', 'todoId and a valid ownerUserId are required');
      }

      const userId = await getLoggedInUserId(context);
      const permission = await requireTodoManagePermission(todoId, userId);

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
      return getTodoItem(todoId, userId);
    },

    async deleteTodo(_: any, args: { todoId?: number }, context: any) {
      const todoId = Number(args?.todoId);
      if (!Number.isInteger(todoId) || todoId <= 0) {
        throwEventError('BAD_REQUEST', 'todoId must be a positive integer');
      }

      const userId = await getLoggedInUserId(context);
      const permission = await requireTodoManagePermission(todoId, userId);
      const connection = await getConnection();
      try {
        await connection.beginTransaction();
        const todo = await lockTodoForMutation(
          connection,
          todoId,
          permission.parentType,
          permission.parentId
        );
        if (
          todo.expenseStatus === 'CONFIRMED' &&
          todoAmountCents(todo.expenseAmount) > 0n
        ) {
          throwEventError('CONFLICT', 'A checklist with a confirmed expense cannot be deleted');
        }
        await connection.execute('DELETE FROM todos WHERE id = ?', [todoId]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return true;
    }
  }
};
