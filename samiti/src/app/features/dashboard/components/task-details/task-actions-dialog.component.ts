import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { isValidTaskBudgetAmount, TaskAssignee, TaskStatus, TASK_STATUSES } from '../event-details/event-tasks/event-tasks.models';
import { TaskDetailsPayload } from './task-details.models';

export interface TaskActionsDialogData {
  task: TaskDetailsPayload;
  remainingBudget: number;
  onAction: (result: TaskActionsDialogResult) => Promise<TaskActionsDialogUpdate | null>;
}

export interface TaskActionsDialogUpdate {
  task: TaskDetailsPayload;
  remainingBudget: number;
}

export type TaskActionsDialogResult =
  | { action: 'rename'; taskName: string }
  | { action: 'assign-owner'; ownerUserId: number | null }
  | { action: 'update-budget'; budgetAmount: string }
  | { action: 'update-status'; status: TaskStatus }
  | { action: 'request-budget'; amount: string }
  | { action: 'review-budget'; decision: 'APPROVE' | 'REJECT' }
  | { action: 'cancel-budget-request' };

@Component({
  selector: 'app-task-actions-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    MatTooltipModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './task-actions-dialog.component.html',
  styleUrl: './task-actions-dialog.component.scss'
})
export class TaskActionsDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<TaskActionsDialogComponent, TaskActionsDialogResult>);
  public readonly data = inject<TaskActionsDialogData>(MAT_DIALOG_DATA);
  public readonly task = this.data.task;
  public readonly taskStatuses = TASK_STATUSES;
  public readonly isSavingAction = signal(false);
  public taskName = this.task.taskName;
  public ownerUserId = this.task.ownerUserId === null ? '' : String(this.task.ownerUserId);
  public ownerSearchText = this.task.ownerName || 'Unassigned';
  public budgetAmount: string | number = this.normalizeBudgetInput(this.task.budgetAmount);
  public budgetIncreaseAmount: string | number = '';
  public status = this.currentStatusValue();

  public formatBudget(amount: string | number | null): string {
    const value = Number(amount ?? 0);
    return `₹${(Number.isFinite(value) ? value : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  }

  public normalizeBudgetInput(amount: string | number): string | number {
    const value = Number(amount);
    return Number.isFinite(value) && Number.isInteger(value) ? String(value) : amount;
  }

  public statusClass(status: string | null): string {
    const normalized = String(status || 'NEW').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (normalized === 'COMPLETED') return 'completed';
    if (normalized === 'IN_PROGRESS' || normalized === 'ACTIVE' || normalized === 'ONGOING') return 'started';
    if (normalized === 'HOLD') return 'hold';
    if (normalized === 'WONT_FIX') return 'wont-fix';
    if (normalized === 'ASSIGNED') return 'legacy-assigned';
    if (normalized === 'NEW') return 'new';
    return 'upcoming';
  }

  public onClose(): void {
    this.dialogRef.close();
  }

  public canOpenTaskActions(): boolean {
    return this.task.canEditTask || this.task.canAssignOwner || this.task.canManage || this.task.canRequestBudgetIncrease ||
      this.task.canReviewBudgetRequest || this.task.canCancelBudgetRequest;
  }

  public submitRename(): void {
    const taskName = this.taskName.trim();
    if (!this.task.canEditTask || !taskName || taskName.length > 255 || taskName === this.task.taskName) return;
    void this.runAction({ action: 'rename', taskName });
  }

  public submitOwner(): void {
    if (!this.task.canAssignOwner || !this.hasOwnerChanged()) return;
    void this.runAction({
      action: 'assign-owner',
      ownerUserId: this.ownerUserId ? Number(this.ownerUserId) : null
    });
  }

  public hasOwnerChanged(): boolean {
    const selectedOwnerId = this.ownerUserId ? Number(this.ownerUserId) : null;
    return selectedOwnerId !== this.task.ownerUserId;
  }

  public getFilteredOwnerAssignees(): TaskAssignee[] {
    const search = this.ownerSearchText.trim().toLowerCase();
    return this.task.taskAssignees
      .filter((assignee) =>
        !search ||
        (assignee.name || '').toLowerCase().includes(search) ||
        (assignee.email || '').toLowerCase().includes(search)
      )
      .sort((a, b) =>
        Number(this.task.ownerUserId !== null && Number(b.userId) === Number(this.task.ownerUserId)) -
          Number(this.task.ownerUserId !== null && Number(a.userId) === Number(this.task.ownerUserId)) ||
        Number(b.isWinner) - Number(a.isWinner) ||
        (a.name || '').localeCompare(b.name || '')
      );
  }

  public readonly displayOwnerName = (value: string | number | null): string => {
    if (value === null || value === undefined) return '';
    if (value === '') return 'Unassigned';
    if (typeof value === 'string' && !/^\d+$/.test(value)) return value;
    const assignee = this.task.taskAssignees.find((member) => Number(member.userId) === Number(value));
    return assignee?.name || String(value);
  };

  public onOwnerSearch(value: string): void {
    this.ownerSearchText = value;
  }

  public onOwnerFocus(trigger: MatAutocompleteTrigger): void {
    this.ownerSearchText = '';
    trigger.openPanel();
  }

  public onOwnerAutocompleteClosed(): void {
    const selectedOwnerId = this.ownerUserId ? Number(this.ownerUserId) : null;
    if (selectedOwnerId === null) {
      this.ownerSearchText = 'Unassigned';
      return;
    }
    const selectedOwner = this.task.taskAssignees.find((member) => Number(member.userId) === selectedOwnerId);
    this.ownerSearchText = selectedOwner?.name || '';
  }

  public onOwnerSelected(event: MatAutocompleteSelectedEvent): void {
    const selectedValue = event.option.value;
    this.ownerUserId = selectedValue === '' ? '' : String(selectedValue);
    this.ownerSearchText = selectedValue === ''
      ? 'Unassigned'
      : this.task.taskAssignees.find((member) => Number(member.userId) === Number(selectedValue))?.name || '';
  }

  public isCurrentOwnerAssignee(userId: number): boolean {
    return this.task.ownerUserId !== null && Number(this.task.ownerUserId) === Number(userId);
  }

  public getSelectedOwnerAssignee(): TaskAssignee | undefined {
    if (!this.ownerUserId) return undefined;
    return this.task.taskAssignees.find((member) => Number(member.userId) === Number(this.ownerUserId));
  }

  public clearOwnerSearch(
    trigger: MatAutocompleteTrigger,
    event: MouseEvent
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.ownerSearchText = '';
    trigger.openPanel();
  }

  public getRoleColorClass(role?: string | null): string {
    switch ((role || '').toUpperCase()) {
      case 'COMMITTEE_MASTER_ADMIN': return 'role-master';
      case 'COMMITTEE_ADMIN': return 'role-admin';
      case 'COMMITTEE_MEMBER': return 'role-member';
      default: return 'role-default';
    }
  }

  public getInitials(name: string | null | undefined): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (parts[0] || '').slice(0, 2).toUpperCase();
  }

  public submitBudget(): void {
    const amount = String(this.budgetAmount).trim();
    if (!this.canSaveBudget()) return;
    void this.runAction({ action: 'update-budget', budgetAmount: amount });
  }

  public canSaveBudget(): boolean {
    const amount = String(this.budgetAmount).trim();
    return this.task.canEditTask &&
      isValidTaskBudgetAmount(amount) &&
      Number(amount).toFixed(2) !== Number(this.task.budgetAmount).toFixed(2);
  }

  public submitStatus(): void {
    if (!this.task.canManage || !this.isSupportedStatus(this.status) || this.status === this.currentStatusValue()) return;
    void this.runAction({ action: 'update-status', status: this.status as TaskStatus });
  }

  public submitBudgetRequest(): void {
    const amount = String(this.budgetIncreaseAmount).trim();
    if (!this.canSubmitBudgetRequest()) return;
    void this.runAction({ action: 'request-budget', amount });
  }

  public canSubmitBudgetRequest(): boolean {
    const amount = String(this.budgetIncreaseAmount).trim();
    return this.task.canRequestBudgetIncrease &&
      this.task.budgetRequestStatus !== 'PENDING' &&
    isValidTaskBudgetAmount(amount) &&
      Number(amount) > 0;
  }

  public reviewBudget(decision: 'APPROVE' | 'REJECT'): void {
    if (!this.task.canReviewBudgetRequest || !this.task.budgetRequestId) return;
    void this.runAction({ action: 'review-budget', decision });
  }

  public cancelBudgetRequest(): void {
    if (!this.task.canCancelBudgetRequest || !this.task.budgetRequestId) return;
    void this.runAction({ action: 'cancel-budget-request' });
  }

  public displayStatus(status: string | null): string {
    return String(status || 'NEW').replace(/[_-]+/g, ' ').toUpperCase();
  }

  public currentStatusValue(): string {
    return String(this.task.status || 'NEW').toUpperCase().replace(/[\s-]+/g, '_');
  }

  public isSupportedStatus(status: string | null): boolean {
    const value = String(status || '').toUpperCase().replace(/[\s-]+/g, '_');
    return this.taskStatuses.includes(value as TaskStatus);
  }

  private async runAction(result: TaskActionsDialogResult): Promise<void> {
    if (this.isSavingAction()) return;

    this.isSavingAction.set(true);
    try {
      const update = await this.data.onAction(result);
      if (!update) {
        if (result.action === 'update-budget') {
          this.budgetAmount = this.normalizeBudgetInput(this.task.budgetAmount);
        }
        return;
      }

      Object.assign(this.task, update.task);
      this.data.remainingBudget = update.remainingBudget;
      this.taskName = this.task.taskName;
      this.ownerUserId = this.task.ownerUserId === null ? '' : String(this.task.ownerUserId);
      this.ownerSearchText = this.task.ownerName || 'Unassigned';
      this.budgetAmount = this.normalizeBudgetInput(this.task.budgetAmount);
      this.budgetIncreaseAmount = '';
      this.status = this.currentStatusValue();
    } finally {
      this.isSavingAction.set(false);
    }
  }
}
