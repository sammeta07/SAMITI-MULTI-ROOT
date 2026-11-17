import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, Observable } from 'rxjs';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { isValidTaskBudgetAmount } from '../event-details/event-tasks/event-tasks.models';
import { TaskDetailsService } from '../task-details/task-details.service';
import {
  TaskFinancePayload,
  TaskFinanceRequest,
  TaskFinanceTransaction
} from './task-finance.models';
import { TaskFinanceService } from './task-finance.service';

@Component({
  selector: 'app-task-finance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-finance.component.html',
  styleUrl: './task-finance.component.scss'
})
export class TaskFinanceComponent implements OnInit {
  @Input({ required: true }) taskId!: number;
  @Input() loadOnInit = false;

  private readonly service = inject(TaskFinanceService);
  private readonly taskDetailsService = inject(TaskDetailsService);
  private readonly notifier = inject(NotifierService);

  public readonly payload = signal<TaskFinancePayload | null>(null);
  public readonly isLoading = signal(false);
  public readonly isSaving = signal(false);
  public readonly activeHistoryTab = signal<'REQUESTS' | 'TRANSACTIONS'>('REQUESTS');

  public readonly approvalAmounts: Record<number, string> = {};
  public returnAmount = '';
  public returnDescription = '';
  public taskBudgetAmount = '';
  public budgetIncreaseAmount = '';

  public ngOnInit(): void {
    if (this.loadOnInit) this.load();
  }

  public load(): void {
    if (this.isLoading() || this.isSaving()) return;
    this.isLoading.set(true);
    this.service.getTaskFinance(this.taskId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (payload) => {
          this.payload.set(payload);
          this.taskBudgetAmount = payload.budgetAmount;
          for (const request of payload.requests) {
            if (request.status === 'PENDING' && this.approvalAmounts[request.id] === undefined) {
              this.approvalAmounts[request.id] = request.requestedAmount;
            }
          }
        },
        error: (error: Error) => this.notifier.error(error.message || 'Could not load task finance.')
      });
  }

  public submitAdvanceReturn(): void {
    if (!this.payload()?.canRequest || !this.returnAmount || !this.returnDescription.trim()) return;
    this.runAction(
      this.service.recordTransaction(this.taskId, 'ADVANCE_RETURN', this.returnAmount, this.returnDescription),
      'Cash return submitted for confirmation.'
    );
    this.returnAmount = '';
    this.returnDescription = '';
  }

  public reviewRequest(request: TaskFinanceRequest, decision: 'APPROVE' | 'REJECT'): void {
    const approvedAmount = decision === 'APPROVE'
      ? this.approvalAmounts[request.id] || request.requestedAmount
      : undefined;
    this.runAction(
      this.service.reviewRequest(request.id, decision, approvedAmount),
      decision === 'APPROVE' ? 'Finance request approved.' : 'Finance request rejected.'
    );
  }

  public issueAdvance(request: TaskFinanceRequest): void {
    const amount = this.remainingRequestAmount(request, 'ADVANCE_ISSUED', 'approvedAmount');
    if (amount <= 0) return;
    this.runAction(
      this.service.recordTransaction(
        this.taskId,
        'ADVANCE_ISSUED',
        amount.toFixed(2),
        `Advance payment for request #${request.id}`,
        request.id
      ),
      'Advance payment recorded.'
    );
  }

  public getRequestPayments(
    request: TaskFinanceRequest,
    transactions: TaskFinanceTransaction[]
  ): TaskFinanceTransaction[] {
    return transactions.filter((transaction) =>
      transaction.requestId === request.id && transaction.transactionType === 'ADVANCE_ISSUED'
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
    const amount = this.taskBudgetAmount.trim();
    return !!current?.canEditBudget
      && isValidTaskBudgetAmount(amount)
      && Number(amount).toFixed(2) !== Number(current.budgetAmount).toFixed(2);
  }

  public saveTaskBudget(): void {
    if (!this.canSaveTaskBudget()) return;
    this.runAction(
      this.taskDetailsService.updateTaskBudget(this.taskId, this.taskBudgetAmount.trim()),
      'Task budget updated.'
    );
  }

  public canRequestBudgetIncrease(): boolean {
    const current = this.payload();
    const amount = this.budgetIncreaseAmount.trim();
    return !!current?.canRequestBudgetIncrease
      && current.budgetRequestStatus !== 'PENDING'
      && isValidTaskBudgetAmount(amount)
      && Number(amount) > 0;
  }

  public requestBudgetIncrease(): void {
    if (!this.canRequestBudgetIncrease()) return;
    this.runAction(
      this.taskDetailsService.requestTaskBudgetIncrease(this.taskId, this.budgetIncreaseAmount.trim()),
      'Budget increase request sent for approval.'
    );
    this.budgetIncreaseAmount = '';
  }

  public reviewBudgetRequest(decision: 'APPROVE' | 'REJECT'): void {
    const current = this.payload();
    if (!current?.canReviewBudgetRequest || !current.budgetRequestId) return;
    this.runAction(
      this.taskDetailsService.reviewTaskBudgetRequest(current.budgetRequestId, decision),
      decision === 'APPROVE' ? 'Budget request approved.' : 'Budget request rejected.'
    );
  }

  public cancelBudgetRequest(): void {
    const current = this.payload();
    if (!current?.canCancelBudgetRequest || !current.budgetRequestId) return;
    this.runAction(
      this.taskDetailsService.cancelTaskBudgetRequest(current.budgetRequestId),
      'Budget request cancelled.'
    );
  }

  public remainingRequestAmount(
    request: TaskFinanceRequest,
    transactionType: 'ADVANCE_ISSUED',
    capField: 'approvedAmount'
  ): number {
    const current = this.payload();
    const cap = Number(request[capField] || 0);
    const settled = current?.transactions
      .filter((transaction) => transaction.requestId === request.id && transaction.transactionType === transactionType)
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0) ?? 0;
    return Math.max(0, cap - settled);
  }

  public money(value: string | null | undefined): string {
    return Number(value || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
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

  private runAction<T>(request: Observable<T>, successMessage: string): void {
    if (this.isSaving()) return;
    let succeeded = false;
    this.isSaving.set(true);
    request.pipe(finalize(() => {
      this.isSaving.set(false);
      if (succeeded) this.load();
    })).subscribe({
      next: () => {
        succeeded = true;
        this.notifier.success(successMessage);
      },
      error: (error: Error) => this.notifier.error(error.message || 'Could not save task finance changes.')
    });
  }
}