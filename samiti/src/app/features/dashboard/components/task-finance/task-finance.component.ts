import { CommonModule } from '@angular/common';
import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { finalize, map, Observable, of, switchMap } from 'rxjs';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { WholeRupeeDirective } from '../../../../shared/directives/whole-rupee.directive';
import { isValidTaskBudgetAmount } from '../event-details/event-tasks/event-tasks.models';
import { TaskDetailsService } from '../task-details/task-details.service';
import {
  TaskFinancePayload,
  TaskFinanceRequest,
  TaskFinanceTransaction,
  isCashReturnWithinAvailableCash,
  getEffectiveApprovedFinanceTotal,
  getSanctionedBudgetDisplayTotal,
  isVisibleInBudgetRequestLedger,
  isVisibleInPaymentHistory,
  isInitialTaskBudgetFinanceRequest,
  TaskBudgetRequest,
  getTaskCashSummary
} from './task-finance.models';
import { TaskFinanceService } from './task-finance.service';
import { TaskBudgetRequestsDialogComponent } from './task-budget-requests-dialog.component';
import { TaskFinanceRequestsDialogComponent } from './task-finance-requests-dialog.component';

export interface TaskFinanceRequestGroup {
  taskId: number;
  isSubtask: boolean;
  taskCreatedAt: string;
  taskName: string;
  taskOwnerName: string | null;
  taskOwnerUserId: number | null;
  requests: TaskFinanceRequest[];
  budgetRequests: TaskBudgetRequest[];
  pendingReturns: TaskFinanceTransaction[];
  transactionCount: number;
  approvedTotal: number;
  sanctionedTotal: number;
  issuedAdvance: number;
  remainingAdvance: number;
  confirmedReturns: number;
  availableInHand: number;
  remainingSanctionedBudget: number | null;
  checklistExpenseAmount: number | null;
  budgetAvailableForDisbursement: number;
}

type TaskBudgetReviewItem =
  | { kind: 'budget'; request: TaskBudgetRequest }
  | { kind: 'finance'; request: TaskFinanceRequest };

@Component({
  selector: 'app-task-finance',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTabsModule, MatTooltipModule, WholeRupeeDirective],
  templateUrl: './task-finance.component.html',
  styleUrl: './task-finance.component.scss'
})
export class TaskFinanceComponent implements OnInit {
  @Input() taskId: number | null = null;
  @Input() eventId: number | null = null;
  @Input() creatorEventScope = false;
  @Input() loadOnInit = false;

  private readonly service = inject(TaskFinanceService);
  private readonly dialog = inject(MatDialog);
  private readonly taskDetailsService = inject(TaskDetailsService);
  private readonly notifier = inject(NotifierService);

  public readonly payload = signal<TaskFinancePayload | null>(null);
  public readonly creatorSubtaskFinance = signal<TaskFinancePayload | null>(null);
  public readonly isLoading = signal(false);
  public readonly isSaving = signal(false);

  public readonly taskDispatchAmounts: Record<number, string | number | null> = {};
  public returnAmount: string | number | null = '';
  public budgetAdjustmentAmount: string | number | null = '';
  public budgetAdjustmentMode: 'INCREASE' | 'REDUCE' = 'INCREASE';

  public ngOnInit(): void {
    if (this.loadOnInit) this.load();
  }

  public load(): void {
    if (this.isLoading() || this.isSaving()) return;
    this.isLoading.set(true);
    const taskId = this.taskId;
    const eventId = this.eventId;
    let request: Observable<{
      finance: TaskFinancePayload;
      creatorFinance: TaskFinancePayload | null;
    }> | null = null;
    if (this.creatorEventScope && eventId !== null) {
      request = this.service.getCreatorEventSubtaskFinance(eventId)
        .pipe(map((finance) => ({ finance, creatorFinance: null })));
    } else if (taskId !== null) {
      request = this.service.getTaskFinance(taskId).pipe(
        switchMap((finance) => {
          if (eventId === null || !finance.canViewCreatedSubtaskFinance) {
            return of({ finance, creatorFinance: null });
          }
          return this.service.getCreatorSubtaskFinance(eventId, taskId)
            .pipe(map((creatorFinance) => ({ finance, creatorFinance })));
        })
      );
    } else if (eventId !== null) {
      request = this.service.getEventTaskFinance(eventId)
        .pipe(map((finance) => ({ finance, creatorFinance: null })));
    }
    if (!request) {
      this.isLoading.set(false);
      this.notifier.error('Task finance scope is missing.');
      return;
    }
    request
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ finance, creatorFinance }) => this.setFinancePayload(finance, creatorFinance),
        error: (error: Error) => this.notifier.error(error.message || 'Could not load task finance.')
      });
  }

  private setFinancePayload(
    payload: TaskFinancePayload,
    creatorFinance: TaskFinancePayload | null
  ): void {
    this.payload.set(payload);
    this.creatorSubtaskFinance.set(creatorFinance);
    this.budgetAdjustmentAmount = '';
  }

  public toNum(value: string | number | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  public maxZero(value: number): number {
    return Math.max(0, value);
  }

  public getPrimaryGroup(groups: TaskFinanceRequestGroup[]): TaskFinanceRequestGroup | undefined {
    return groups.length > 0 ? groups[0] : undefined;
  }

  public getPendingReceipts(transactions: TaskFinanceTransaction[]): TaskFinanceTransaction[] {
    return transactions.filter((transaction) => transaction.canConfirmReceipt);
  }

  public availableCashForReturn(): number {
    const finance = this.payload();
    if (!finance) return 0;
    const groups = this.groupRequestsByTask(
      finance.requests,
      this.budgetRequestsForLedger(finance),
      finance.transactions
    );
    return this.getPrimaryGroup(groups)?.availableInHand
      ?? this.toNum(finance.summary.availableInHand);
  }

  public isReturnAmountOverAvailable(availableCash: number): boolean {
    const amount = String(this.returnAmount ?? '').trim();
    return isValidTaskBudgetAmount(amount)
      && Number(amount) > 0
      && !isCashReturnWithinAvailableCash(amount, availableCash);
  }

  public canSubmitAdvanceReturn(availableCash = this.availableCashForReturn()): boolean {
    const amount = String(this.returnAmount ?? '').trim();
    const current = this.payload();
    return !!current?.canRequest
      && current.budgetRequestStatus !== 'PENDING'
      && !current.transactions.some((transaction) =>
        transaction.transactionType === 'ADVANCE_RETURN'
        && transaction.status === 'PENDING'
      )
      && isValidTaskBudgetAmount(amount)
      && isCashReturnWithinAvailableCash(amount, availableCash);
  }

  public submitAdvanceReturn(): void {
    if (this.taskId === null || !this.canSubmitAdvanceReturn()) return;
    const amount = String(this.returnAmount ?? '').trim();
    this.runAction(
      this.service.recordTransaction(this.taskId, 'ADVANCE_RETURN', amount),
      'Cash return submitted for confirmation.'
    );
    this.returnAmount = '';
  }

  public reviewRequest(request: TaskFinanceRequest, decision: 'APPROVE' | 'REJECT'): void {
    if (!request.canReviewAuthority || this.isSaving()) return;
    this.runAction(
      this.service.reviewRequest(request.id, decision),
      decision === 'REJECT'
        ? 'Finance request rejected.'
        : 'Finance request approved and sent to the Treasurer.'
    );
  }

  public issueGroupAdvance(
    group: TaskFinanceRequestGroup,
    finance: TaskFinancePayload | null = this.payload(),
    creatorScope = false
  ): void {
    const amount = String(this.taskDispatchAmounts[group.taskId] ?? '').trim();
    if (!this.canDispatchGroupAdvance(group, finance, creatorScope)) return;
    this.runAction(
      this.service.recordTransaction(
        group.taskId,
        'ADVANCE_ISSUED',
        amount,
        'Combined advance payment for approved task finance requests'
      ),
      'Combined advance payment recorded.',
      () => delete this.taskDispatchAmounts[group.taskId]
    );
  }

  public canDispatchGroupAdvance(
    group: TaskFinanceRequestGroup,
    finance: TaskFinancePayload | null = this.payload(),
    creatorScope = false
  ): boolean {
    const amount = String(this.taskDispatchAmounts[group.taskId] ?? '').trim();
    return (!group.isSubtask || creatorScope)
      && group.taskOwnerUserId !== null
      && !!finance?.canApprove
      && group.remainingAdvance > 0
      && isValidTaskBudgetAmount(amount)
      && Number(amount) > 0
      && Number(amount) <= group.remainingAdvance;
  }

  public groupRequestsByTask(
    requests: TaskFinanceRequest[],
    budgetRequests: TaskBudgetRequest[],
    transactions: TaskFinanceTransaction[]
  ): TaskFinanceRequestGroup[] {
    const groups = new Map<number, {
      requests: TaskFinanceRequest[];
      budgetRequests: TaskBudgetRequest[];
      isSubtask: boolean;
      taskCreatedAt: string;
      pendingReturnTaskName?: string;
    }>();
    requests.forEach((request) => {
      const taskGroup = groups.get(request.taskId) ?? {
        requests: [],
        budgetRequests: [],
        isSubtask: request.isSubtask,
        taskCreatedAt: request.taskCreatedAt
      };
      taskGroup.requests.push(request);
      groups.set(request.taskId, taskGroup);
    });
    budgetRequests.forEach((request) => {
      const taskGroup = groups.get(request.taskId) ?? {
        requests: [],
        budgetRequests: [],
        isSubtask: request.isSubtask,
        taskCreatedAt: request.taskCreatedAt
      };
      taskGroup.budgetRequests.push(request);
      groups.set(request.taskId, taskGroup);
    });
    transactions
      .filter((transaction) =>
        transaction.transactionType === 'ADVANCE_RETURN' && transaction.status === 'PENDING'
      )
      .forEach((transaction) => {
        const taskGroup = groups.get(transaction.taskId) ?? {
          requests: [],
          budgetRequests: [],
          isSubtask: transaction.isSubtask,
          taskCreatedAt: transaction.taskCreatedAt
        };
        taskGroup.pendingReturnTaskName = transaction.taskName;
        groups.set(transaction.taskId, taskGroup);
      });

    return Array.from(groups.entries()).map(([taskId, taskGroup]) => {
      const approvedTotal = getEffectiveApprovedFinanceTotal(taskGroup.requests);
      const taskTransactions = transactions.filter((transaction) => transaction.taskId === taskId);
      const issuedAdvance = taskTransactions
        .filter((transaction) => transaction.transactionType === 'ADVANCE_ISSUED')
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
      const { confirmedReturns, availableInHand } = getTaskCashSummary(taskTransactions);
      const firstRequest = taskGroup.requests[0];
      const firstBudgetRequest = taskGroup.budgetRequests[0];
      const taskBudgetAmount = firstRequest?.taskBudgetAmount ?? firstBudgetRequest?.taskBudgetAmount;
      const remainingSanctionedBudget = Number(
        firstRequest?.remainingSanctionedBudget ?? firstBudgetRequest?.remainingSanctionedBudget
      );
      const checklistExpenseAmount = Number(
        firstRequest?.checklistExpenseAmount
        ?? firstBudgetRequest?.checklistExpenseAmount
        ?? taskTransactions.find((transaction) => transaction.checklistExpenseAmount)?.checklistExpenseAmount
      );
      const budgetAvailableForDisbursement = Number(firstRequest?.budgetAvailableForDisbursement ?? 0);
      const remainingAdvance = Math.min(
        Math.max(0, approvedTotal - issuedAdvance),
        budgetAvailableForDisbursement
      );
      const visiblePaymentTransactions = taskTransactions.filter(isVisibleInPaymentHistory);
      const pendingReturns = taskTransactions.filter((transaction) =>
        transaction.transactionType === 'ADVANCE_RETURN' && transaction.status === 'PENDING'
      );

      return {
        taskId,
        isSubtask: taskGroup.isSubtask,
        taskCreatedAt: taskGroup.taskCreatedAt,
        taskName: firstRequest?.taskName
          ?? firstBudgetRequest?.taskName
          ?? taskGroup.pendingReturnTaskName
          ?? 'Untitled Task',
        taskOwnerName: taskGroup.requests.find((request) => request.taskOwnerName)?.taskOwnerName
          ?? taskGroup.budgetRequests.find((request) => request.taskOwnerName)?.taskOwnerName
          ?? taskTransactions.find((transaction) => transaction.taskOwnerName)?.taskOwnerName
          ?? null,
        taskOwnerUserId: firstRequest?.taskOwnerUserId ?? null,
        requests: taskGroup.requests,
        budgetRequests: taskGroup.budgetRequests,
        pendingReturns,
        transactionCount: visiblePaymentTransactions.length,
        approvedTotal,
        sanctionedTotal: getSanctionedBudgetDisplayTotal(
          taskGroup.isSubtask,
          approvedTotal,
          taskBudgetAmount
        ),
        issuedAdvance,
        remainingAdvance,
        confirmedReturns,
        availableInHand,
        remainingSanctionedBudget: Number.isFinite(remainingSanctionedBudget)
          ? remainingSanctionedBudget
          : null,
        checklistExpenseAmount: Number.isFinite(checklistExpenseAmount)
          ? checklistExpenseAmount
          : null,
        budgetAvailableForDisbursement
      };
    }).sort((left, right) =>
      left.taskCreatedAt.localeCompare(right.taskCreatedAt) || left.taskId - right.taskId
    );
  }

  public currentBudgetRequest(finance: TaskFinancePayload): TaskBudgetRequest | null {
    return finance.budgetRequestId === null
      ? null
      : finance.budgetRequests.find((request) => request.id === finance.budgetRequestId) ?? null;
  }

  public reviewablePendingBudgetRequest(finance: TaskFinancePayload): TaskBudgetRequest | null {
    return finance.budgetRequests.find((request) =>
      request.status === 'PENDING' && (request.canReviewCreator || request.canReviewAuthority)
    ) ?? null;
  }

  public budgetRequestsForLedger(finance: TaskFinancePayload): TaskBudgetRequest[] {
    return finance.budgetRequests.filter(isVisibleInBudgetRequestLedger);
  }

  public shouldShowBudgetReviewColumn(finance: TaskFinancePayload): boolean {
    return finance.isEventScope &&
      (finance.canViewBudgetIncreaseRequests || finance.canReviewBudgetRequest);
  }

  public pendingBudgetIncreaseRequest(group: TaskFinanceRequestGroup): TaskBudgetRequest | null {
    return [...group.budgetRequests]
      .filter((request) => request.status === 'PENDING')
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt) || right.id - left.id
      )[0] ?? null;
  }

  public lastBudgetRequest(group: TaskFinanceRequestGroup): TaskBudgetRequest | null {
    return [...group.budgetRequests].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.id - left.id
    )[0] ?? null;
  }

  public taskBudgetReviewItem(group: TaskFinanceRequestGroup): TaskBudgetReviewItem | null {
    const initialRequest = [...group.requests]
      .filter(isInitialTaskBudgetFinanceRequest)
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt) || right.id - left.id
      )[0] ?? null;
    if (initialRequest?.canReviewAuthority) {
      return { kind: 'finance', request: initialRequest };
    }

    const budgetRequest = this.lastBudgetRequest(group);
    if (budgetRequest) return { kind: 'budget', request: budgetRequest };
    return initialRequest ? { kind: 'finance', request: initialRequest } : null;
  }

  public taskBudgetReviewAmount(item: TaskBudgetReviewItem): string {
    if (item.kind === 'finance') {
      return `Initial · ₹${this.money(item.request.requestedAmount)}`;
    }
    return `₹${this.money(Math.abs(Number(item.request.requestedIncrease)))}`;
  }

  public budgetRequestChangeLabel(request: TaskBudgetRequest): string {
    const change = Number(request.requestedIncrease);
    const sign = change > 0 ? '+' : change < 0 ? '-' : '';
    return `${sign}${this.money(Math.abs(change))}`;
  }

  public budgetRequestChangeClass(request: TaskBudgetRequest): string {
    const change = Number(request.requestedIncrease);
    return change > 0 ? 'text-ok' : change < 0 ? 'text-danger' : '';
  }

  public canReviewTaskBudgetItem(item: TaskBudgetReviewItem): boolean {
    return item.kind === 'budget'
      ? item.request.canReviewCreator || item.request.canReviewAuthority
      : item.request.canReviewAuthority;
  }

  public taskBudgetReviewStatus(item: TaskBudgetReviewItem): string {
    return item.request.status;
  }

  public reviewTaskBudgetItem(item: TaskBudgetReviewItem, decision: 'APPROVE' | 'REJECT'): void {
    if (item.kind === 'budget') {
      this.reviewBudgetRequest(item.request, decision);
      return;
    }
    this.reviewRequest(item.request, decision);
  }

  public openBudgetRequestsDialog(
    group: TaskFinanceRequestGroup,
    creatorScope = false
  ): void {
    const financeSource = creatorScope ? this.creatorSubtaskFinance : this.payload;
    this.dialog.open(TaskBudgetRequestsDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '80%',
      maxWidth: '1000px',
      autoFocus: true,
      disableClose: true,
      data: {
        taskName: group.taskName,
        assigneeName: group.taskOwnerName,
        requests: computed(() =>
          (financeSource()?.budgetRequests.filter((request) => request.taskId === group.taskId) ?? [])
            .sort((left, right) =>
              left.createdAt.localeCompare(right.createdAt) || left.id - right.id
            )
        ),
        financeRequests: computed(() =>
          (financeSource()?.requests.filter((request) => request.taskId === group.taskId) ?? [])
            .sort((left, right) =>
              left.createdAt.localeCompare(right.createdAt) || left.id - right.id
            )
        ),
        isTreasurer: financeSource()?.canApprove ?? false,
        isSaving: this.isSaving,
        reviewRequest: (request: TaskBudgetRequest, decision: 'APPROVE' | 'REJECT') =>
          this.reviewBudgetRequest(request, decision),
        cancelRequest: (request: TaskBudgetRequest) => this.cancelBudgetRequest(request),
        reviewFinanceRequest: (request: TaskFinanceRequest, decision: 'APPROVE' | 'REJECT') =>
          this.reviewRequest(request, decision)
      },
      panelClass: ['slide-in-dialog', 'task-finance-requests-drawer']
    });
  }

  public openFinanceRequestsDialog(
    group: TaskFinanceRequestGroup,
    creatorScope = false
  ): void {
    const financeSource = creatorScope ? this.creatorSubtaskFinance : this.payload;
    this.dialog.open(TaskFinanceRequestsDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '600px',
      maxWidth: '90vw',
      autoFocus: true,
      data: {
        taskName: group.taskName,
        assigneeName: group.taskOwnerName,
        transactions: computed(() =>
          financeSource()?.transactions.filter(
            (transaction) =>
              transaction.taskId === group.taskId && isVisibleInPaymentHistory(transaction)
          ) ?? []
        ),
        isSaving: this.isSaving,
        confirmReceipt: (transaction: TaskFinanceTransaction) => this.confirmReceipt(transaction)
      },
      panelClass: ['slide-in-dialog', 'finance-requests-history-drawer']
    });
  }

  public getOtherTransactions(
    requests: TaskFinanceRequest[],
    transactions: TaskFinanceTransaction[],
    groupedTasks: TaskFinanceRequestGroup[]
  ): TaskFinanceTransaction[] {
    return transactions
      .filter((transaction) => {
        if (!isVisibleInPaymentHistory(transaction)) return false;
        return transaction.requestId === null
          ? !groupedTasks.some((group) => group.taskId === transaction.taskId)
          : !requests.some((request) => request.id === transaction.requestId);
      })
      .sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id - left.id
      );
  }

  public getRequestForTransaction(
    transaction: TaskFinanceTransaction,
    requests: TaskFinanceRequest[]
  ): TaskFinanceRequest | undefined {
    return transaction.requestId === null
      ? undefined
      : requests.find((request) => request.id === transaction.requestId);
  }

  public confirmReceipt(transaction: TaskFinanceTransaction): void {
    if (!transaction.canConfirmReceipt) return;
    this.runAction(
      this.service.confirmReceipt(transaction.id),
      'Receipt confirmed.'
    );
  }

  public acceptCashReturn(transaction: TaskFinanceTransaction): void {
    if (!transaction.canConfirmReturn || this.isSaving()) return;
    this.runAction(
      this.service.acceptCashReturn(transaction.id),
      'Cash return accepted. Issued amount and balance updated.'
    );
  }

  public cancelCashReturn(transaction: TaskFinanceTransaction): void {
    if (!transaction.canCancel || this.isSaving()) return;
    this.runAction(
      this.service.cancelCashReturn(transaction.id),
      'Cash return request cancelled.'
    );
  }

  public setBudgetAdjustmentMode(mode: 'INCREASE' | 'REDUCE'): void {
    if (mode === 'REDUCE' && !this.payload()?.canReduceBudget) return;
    this.budgetAdjustmentMode = mode;
    this.budgetAdjustmentAmount = '';
  }

  public canSubmitBudgetAdjustment(): boolean {
    const current = this.payload();
    const amount = String(this.budgetAdjustmentAmount ?? '').trim();
    if (!current || !isValidTaskBudgetAmount(amount) || Number(amount) <= 0) return false;
    if (current.transactions.some((transaction) =>
      transaction.transactionType === 'ADVANCE_RETURN' && transaction.status === 'PENDING'
    )) return false;
    if (
      current.budgetRequestStatus === 'PENDING' &&
      !current.canEditBudget &&
      !current.canReduceBudget &&
      !this.currentBudgetRequest(current)?.canCancel
    ) return false;
    if (this.budgetAdjustmentMode === 'REDUCE') {
      return current.canReduceBudget && Number(amount) <= Number(current.maxBudgetReduction);
    }
    return current.canEditBudget || current.canRequestBudgetIncrease;
  }

  public resetBudgetAdjustmentOnBlur(event: FocusEvent): void {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof HTMLElement && nextTarget.id === 'finance-budget-adjustment-submit') return;
    if (!this.isSaving()) this.budgetAdjustmentAmount = '';
  }

  public submitBudgetAdjustment(): void {
    const current = this.payload();
    if (this.taskId === null || !current || !this.canSubmitBudgetAdjustment()) return;
    const amount = String(this.budgetAdjustmentAmount ?? '').trim();
    if (this.budgetAdjustmentMode === 'REDUCE') {
      this.runAction(
        this.service.requestBudgetReduction(this.taskId, amount),
        'Budget reduction request sent for authority approval.'
      );
    } else if (current.canEditBudget) {
      const targetBudget = String(Number(current.budgetAmount) + Number(amount));
      this.runAction(
        this.taskDetailsService.updateTaskBudget(this.taskId, targetBudget),
        'Budget increase request sent for authority approval.'
      );
    } else {
      this.runAction(
        this.taskDetailsService.requestTaskBudgetIncrease(this.taskId, amount),
        'Budget increase request sent for authority approval.'
      );
    }
    this.budgetAdjustmentAmount = '';
  }

  public reviewBudgetRequest(request: TaskBudgetRequest, decision: 'APPROVE' | 'REJECT'): void {
    if ((!request.canReviewCreator && !request.canReviewAuthority) || this.isSaving()) return;
    this.runAction(
      this.service.reviewBudgetRequest(request.id, decision),
      decision === 'APPROVE'
        ? 'Budget request approved.'
        : 'Budget request rejected.'
    );
  }

  public cancelBudgetRequest(request: TaskBudgetRequest): void {
    if (!request.canCancel || this.isSaving()) return;
    this.runAction(
      this.service.cancelBudgetRequest(request.id),
      'Budget request cancelled.'
    );
  }

  public money(value: string | number | null | undefined): string {
    return Math.round(Number(value || 0)).toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
  }

  public isRequestPayable(request: TaskFinanceRequest): boolean {
    return request.status === 'APPROVED' || request.status === 'PARTIALLY_APPROVED';
  }

  public hasApprovedFinanceRequest(group: TaskFinanceRequestGroup): boolean {
    return group.requests.some((request) => this.isRequestPayable(request));
  }

  public formatLabel(raw: string): string {
    return raw.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  public getStatusClass(status: string): string {
    switch (status) {
      case 'APPROVED':
      case 'CONFIRMED':
        return 'badge-success';
      case 'PENDING':
      case 'PARTIALLY_APPROVED':
        return 'badge-warning';
      case 'REJECTED':
        return 'badge-danger';
      default:
        return 'badge-neutral';
    }
  }

  private runAction<T>(request: Observable<T>, successMessage: string, onSuccess?: () => void): void {
    if (this.isSaving()) return;
    let succeeded = false;
    this.isSaving.set(true);
    request.pipe(finalize(() => {
      this.isSaving.set(false);
      if (succeeded) this.load();
    })).subscribe({
      next: () => {
        succeeded = true;
        onSuccess?.();
        this.notifier.success(successMessage);
      },
      error: (error: Error) => this.notifier.error(error.message || 'Could not save task finance changes.')
    });
  }
}