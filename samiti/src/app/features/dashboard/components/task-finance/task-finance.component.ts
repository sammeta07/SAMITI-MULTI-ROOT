import { CommonModule } from '@angular/common';
import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { finalize, Observable } from 'rxjs';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { WholeRupeeDirective } from '../../../../shared/directives/whole-rupee.directive';
import { isValidTaskBudgetAmount } from '../event-details/event-tasks/event-tasks.models';
import { TaskDetailsService } from '../task-details/task-details.service';
import {
  TaskFinancePayload,
  TaskFinanceRequest,
  TaskFinanceTransaction,
  TaskBudgetRequest,
  TaskSubtaskTransfer,
  TaskSubtaskTransferOption
} from './task-finance.models';
import { TaskFinanceService } from './task-finance.service';
import { TaskBudgetRequestsDialogComponent } from './task-budget-requests-dialog.component';
import { TaskFinanceRequestsDialogComponent } from './task-finance-requests-dialog.component';

export interface TaskFinanceRequestGroup {
  taskId: number;
  taskName: string;
  taskOwnerUserId: number | null;
  requests: TaskFinanceRequest[];
  budgetRequests: TaskBudgetRequest[];
  transactionCount: number;
  approvedTotal: number;
  issuedAdvance: number;
  remainingAdvance: number;
}

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
  @Input() loadOnInit = false;

  private readonly service = inject(TaskFinanceService);
  private readonly dialog = inject(MatDialog);
  private readonly taskDetailsService = inject(TaskDetailsService);
  private readonly notifier = inject(NotifierService);

  public readonly payload = signal<TaskFinancePayload | null>(null);
  public readonly isLoading = signal(false);
  public readonly isSaving = signal(false);

  public readonly taskDispatchAmounts: Record<number, string | number | null> = {};
  public returnAmount: string | number | null = '';
  public taskBudgetAmount: string | number | null = '';
  public budgetIncreaseAmount: string | number | null = '';
  public selectedSubtaskId: number | null = null;
  public subtaskTransferAmount: string | number | null = '';
  public subtaskTransferDescription = '';

  public ngOnInit(): void {
    if (this.loadOnInit) this.load();
  }

  public load(): void {
    if (this.isLoading() || this.isSaving()) return;
    this.isLoading.set(true);
    const request = this.eventId !== null
      ? this.service.getEventTaskFinance(this.eventId)
      : this.taskId !== null
        ? this.service.getTaskFinance(this.taskId)
        : null;
    if (!request) {
      this.isLoading.set(false);
      this.notifier.error('Task finance scope is missing.');
      return;
    }
    request
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (payload) => {
          this.payload.set(payload);
          this.taskBudgetAmount = payload.budgetAmount;
          const selectedOption = payload.subtaskTransferOptions.find(
            (option) => option.subtaskId === this.selectedSubtaskId && Number(option.availableAmount) > 0
          );
          this.selectedSubtaskId = selectedOption?.subtaskId
            ?? payload.subtaskTransferOptions.find((option) => Number(option.availableAmount) > 0)?.subtaskId
            ?? payload.subtaskTransferOptions[0]?.subtaskId
            ?? null;
        },
        error: (error: Error) => this.notifier.error(error.message || 'Could not load task finance.')
      });
  }

  public shouldShowSubtaskTransfers(finance: TaskFinancePayload): boolean {
    return finance.canCreateSubtaskTransfers
      || finance.incomingSubtaskTransfers.length > 0
      || finance.outgoingSubtaskTransfers.length > 0;
  }

  public hasPendingSubtaskTransferAction(finance: TaskFinancePayload): boolean {
    return finance.incomingSubtaskTransfers.some((transfer) => transfer.canConfirmReceipt);
  }

  public selectedSubtaskTransferOption(): TaskSubtaskTransferOption | undefined {
    return this.payload()?.subtaskTransferOptions.find(
      (option) => option.subtaskId === Number(this.selectedSubtaskId)
    );
  }

  public canRecordSubtaskTransfer(): boolean {
    const finance = this.payload();
    const option = this.selectedSubtaskTransferOption();
    const amount = String(this.subtaskTransferAmount ?? '').trim();
    const description = this.subtaskTransferDescription.trim();
    return !!finance?.canCreateSubtaskTransfers
      && !!option
      && isValidTaskBudgetAmount(amount)
      && Number(amount) > 0
      && Number(amount) <= Number(option.availableAmount)
      && description.length > 0
      && description.length <= 1000;
  }

  public recordSubtaskTransfer(): void {
    const option = this.selectedSubtaskTransferOption();
    if (this.taskId === null || !option || !this.canRecordSubtaskTransfer()) return;
    this.runAction(
      this.service.createSubtaskTransfer(
        this.taskId,
        option.subtaskId,
        String(this.subtaskTransferAmount).trim(),
        this.subtaskTransferDescription.trim()
      ),
      'Subtask transfer recorded.',
      () => {
        this.subtaskTransferAmount = '';
        this.subtaskTransferDescription = '';
      }
    );
  }

  public confirmSubtaskTransfer(transfer: TaskSubtaskTransfer): void {
    if (!transfer.canConfirmReceipt) return;
    this.runAction(
      this.service.confirmSubtaskTransferReceipt(transfer.id),
      'Subtask transfer receipt confirmed.'
    );
  }

  public canSubmitAdvanceReturn(): boolean {
    const amount = String(this.returnAmount ?? '').trim();
    return !!this.payload()?.canRequest
      && isValidTaskBudgetAmount(amount)
      && Number(amount) > 0;
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

  public issueGroupAdvance(group: TaskFinanceRequestGroup): void {
    const amount = String(this.taskDispatchAmounts[group.taskId] ?? '').trim();
    if (!this.canDispatchGroupAdvance(group)) return;
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

  public canDispatchGroupAdvance(group: TaskFinanceRequestGroup): boolean {
    const amount = String(this.taskDispatchAmounts[group.taskId] ?? '').trim();
    return group.taskOwnerUserId !== null
      && !!this.payload()?.canApprove
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
    const groups = new Map<number, { requests: TaskFinanceRequest[]; budgetRequests: TaskBudgetRequest[] }>();
    requests.forEach((request) => {
      const taskGroup = groups.get(request.taskId) ?? { requests: [], budgetRequests: [] };
      taskGroup.requests.push(request);
      groups.set(request.taskId, taskGroup);
    });
    budgetRequests.forEach((request) => {
      const taskGroup = groups.get(request.taskId) ?? { requests: [], budgetRequests: [] };
      taskGroup.budgetRequests.push(request);
      groups.set(request.taskId, taskGroup);
    });

    return Array.from(groups.entries()).map(([taskId, taskGroup]) => {
      const approvedRequests = taskGroup.requests.filter((request) => this.isRequestPayable(request));
      const approvedTotal = approvedRequests.reduce(
        (sum, request) => sum + Number(request.approvedAmount ?? request.requestedAmount ?? 0),
        0
      );
      const taskTransactions = transactions.filter((transaction) => transaction.taskId === taskId);
      const issuedAdvance = taskTransactions
        .filter((transaction) => transaction.transactionType === 'ADVANCE_ISSUED')
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
      const remainingAdvance = Math.max(0, approvedTotal - issuedAdvance);
      const firstRequest = taskGroup.requests[0];
      const firstBudgetRequest = taskGroup.budgetRequests[0];

      return {
        taskId,
        taskName: firstRequest?.taskName ?? firstBudgetRequest!.taskName,
        taskOwnerUserId: firstRequest?.taskOwnerUserId ?? null,
        requests: taskGroup.requests,
        budgetRequests: taskGroup.budgetRequests,
        transactionCount: taskTransactions.length,
        approvedTotal,
        issuedAdvance,
        remainingAdvance
      };
    });
  }

  public openBudgetRequestsDialog(group: TaskFinanceRequestGroup): void {
    this.dialog.open(TaskBudgetRequestsDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '80%',
      maxWidth: '1000px',
      autoFocus: true,
      disableClose: true,
      data: {
        taskName: group.taskName,
        requests: computed(() =>
          (this.payload()?.budgetRequests.filter((request) => request.taskId === group.taskId) ?? [])
            .sort((left, right) =>
              left.createdAt.localeCompare(right.createdAt) || left.id - right.id
            )
        ),
        financeRequests: computed(() =>
          (this.payload()?.requests.filter((request) => request.taskId === group.taskId) ?? [])
            .sort((left, right) =>
              left.createdAt.localeCompare(right.createdAt) || left.id - right.id
            )
        ),
        isTreasurer: this.payload()?.canApprove ?? false,
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

  public openFinanceRequestsDialog(group: TaskFinanceRequestGroup): void {
    const transactions = this.payload()?.transactions.filter(
      (transaction) => transaction.taskId === group.taskId
    ) ?? [];
    this.dialog.open(TaskFinanceRequestsDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '80%',
      maxWidth: '1000px',
      autoFocus: true,
      data: {
        taskName: group.taskName,
        assigneeName: group.requests.find((request) => request.taskOwnerName)?.taskOwnerName ?? null,
        requests: group.requests,
        budgetRequests: group.budgetRequests,
        transactions,
        isSaving: this.isSaving,
        reviewRequest: (request: TaskFinanceRequest, decision: 'APPROVE' | 'REJECT') =>
          this.reviewRequest(request, decision),
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
      .filter((transaction) =>
        transaction.requestId === null
          ? !groupedTasks.some((group) => group.taskId === transaction.taskId)
          : !requests.some((request) => request.id === transaction.requestId)
      )
      .sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id - right.id
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

  public canSaveTaskBudget(): boolean {
    const current = this.payload();
    const amount = String(this.taskBudgetAmount ?? '').trim();
    return !!current?.canEditBudget
      && isValidTaskBudgetAmount(amount)
      && Number(amount) > Number(current.budgetAmount);
  }

  public taskBudgetSaveTooltip(): string {
    return this.isSaving()
      ? 'Budget is being saved.'
      : 'Enter an amount greater than the current sanctioned budget to enable Save.';
  }

  public resetTaskBudgetOnBlur(event: FocusEvent): void {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof HTMLElement && nextTarget.id === 'finance-task-budget-save') return;
    this.resetTaskBudgetToSanctionedAmount();
  }

  public resetTaskBudgetAfterSubmitButtonBlur(): void {
    this.resetTaskBudgetToSanctionedAmount();
  }

  public saveTaskBudget(): void {
    if (this.taskId === null || !this.canSaveTaskBudget()) return;
    const amount = String(this.taskBudgetAmount ?? '').trim();
    this.runAction(
      this.taskDetailsService.updateTaskBudget(this.taskId, amount),
      'Task budget updated.'
    );
  }

  private resetTaskBudgetToSanctionedAmount(): void {
    if (this.isSaving()) return;
    this.taskBudgetAmount = this.payload()?.budgetAmount ?? '';
  }

  public canRequestBudgetIncrease(): boolean {
    const current = this.payload();
    const amount = String(this.budgetIncreaseAmount ?? '').trim();
    return !!current?.canRequestBudgetIncrease
      && current.budgetRequestStatus !== 'PENDING'
      && isValidTaskBudgetAmount(amount)
      && Number(amount) > 0;
  }

  public requestBudgetIncrease(): void {
    if (this.taskId === null || !this.canRequestBudgetIncrease()) return;
    const amount = String(this.budgetIncreaseAmount ?? '').trim();
    this.runAction(
      this.taskDetailsService.requestTaskBudgetIncrease(this.taskId, amount),
      'Budget increase request sent for approval.'
    );
    this.budgetIncreaseAmount = '';
  }

  public reviewBudgetRequest(request: TaskBudgetRequest, decision: 'APPROVE' | 'REJECT'): void {
    if ((!request.canReviewCreator && !request.canReviewAuthority) || this.isSaving()) return;
    this.runAction(
      this.service.reviewBudgetRequest(request.id, decision),
      decision === 'APPROVE'
        ? request.approvalStage === 'CREATOR'
          ? 'Budget request approved and sent to the event authority.'
          : 'Budget request approved and sent to the Treasurer.'
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