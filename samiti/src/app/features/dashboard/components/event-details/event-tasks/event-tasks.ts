import { Component, inject, signal, OnInit, OnDestroy, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom, Subscription } from 'rxjs';

import { EventTasksService } from './event-tasks.service';
import { calculateTaskBudgetRemaining, EventTaskEntry, EventTasksPayload, formatTaskBudgetAmount, formatTaskBudgetAmountCompact, isValidTaskBudgetAmount, TaskAssignee, TASK_STATUSES, TaskStatus, taskHierarchyLevelBackground } from './event-tasks.models';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { ConfirmDialogService } from '../../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../../components/dialog/confirm/confirm-dialog.models';
import { DashboardHierarchyTreeService } from '../../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { EventDetailsStateService } from '../event-details-state.service';
import { TaskDetailsService } from '../../task-details/task-details.service';
import { TaskFinanceComponent } from '../../task-finance/task-finance.component';

@Component({
  selector: 'app-event-tasks',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    TaskFinanceComponent
  ],
  templateUrl: './event-tasks.html',
  styleUrl: './event-tasks.scss'
})
export class EventTasksComponent implements OnInit, OnDestroy {
  @ViewChildren(MatExpansionPanel) private taskPanels!: QueryList<MatExpansionPanel>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tasksService = inject(EventTasksService);
  private readonly notifier = inject(NotifierService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly eventDetailsState = inject(EventDetailsStateService);
  private readonly taskDetailsService = inject(TaskDetailsService);

  private parentParamsSub?: Subscription;
  private currentEventId: number | null = null;
  private taskLoadRequestId = 0;

  public eventData: EventTaskEntry[] | null = null;
  public taskAssignees: TaskAssignee[] = [];
  public taskAssigneeSearchText: Record<number, string> = {};
  public pendingTaskOwnerIds: Record<number, number | null> = {};
  public taskNameEditText: Record<number, string> = {};
  public canCreateTasks = false;

  public readonly assigningTaskIds = new Set<number>();
  public readonly editingTaskAssigneeIds = new Set<number>();
  public readonly editingTaskNameIds = new Set<number>();
  public readonly savingTaskNameIds = new Set<number>();
  public readonly editingTaskBudgetIds = new Set<number>();
  public readonly savingTaskBudgetIds = new Set<number>();
  public readonly reviewingTaskBudgetRequestIds = new Set<number>();
  public readonly requestingTaskBudgetIncreaseIds = new Set<number>();
  public taskBudgetEditAmounts: Record<number, string | number> = {};
  public taskBudgetIncreaseAmounts: Record<number, string | number> = {};
  public taskStatusEditValues: Record<number, TaskStatus> = {};
  public readonly deletingTaskIds = new Set<number>();
  public readonly clearedTaskAssigneeSearchIds = signal<Set<number>>(new Set<number>());

  public readonly taskStatuses = TASK_STATUSES;
  public isCreatingTask = false;
  public isSavingTask = false;
  public newTaskName = '';
  public newTaskBudget = '0.00';
  public isLoading = true;
  public hasLoadError = false;

  public get tasks(): EventTaskEntry[] {
    return this.eventData ?? [];
  }

  public navigateToTask(taskId: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    void this.router.navigate(['/dashboard', 'task', taskId]);
  }

  public get flattenedTasks(): Array<{ task: EventTaskEntry; depth: number }> {
    const byParent = new Map<number | null, EventTaskEntry[]>();
    const taskIds = new Set(this.tasks.map((task) => task.taskId));

    for (const task of this.tasks) {
      const parentId = task.parentTaskId && taskIds.has(task.parentTaskId) ? task.parentTaskId : null;
      const children = byParent.get(parentId) ?? [];
      children.push(task);
      byParent.set(parentId, children);
    }

    const flattened: Array<{ task: EventTaskEntry; depth: number }> = [];
    const visited = new Set<number>();

    const addChildren = (parentId: number | null, depth: number): void => {
      for (const task of byParent.get(parentId) ?? []) {
        if (visited.has(task.taskId)) continue;
        visited.add(task.taskId);
        flattened.push({ task, depth });
        addChildren(task.taskId, depth + 1);
      }
    };

    addChildren(null, 0);

    for (const task of this.tasks) {
      if (!visited.has(task.taskId)) {
        flattened.push({ task, depth: 0 });
      }
    }

    return flattened;
  }

  public get rootTasks(): Array<{ task: EventTaskEntry; depth: number }> {
    return this.flattenedTasks
      .filter((entry) => entry.depth === 0);
  }

  public getChildTasks(parentTaskId: number): EventTaskEntry[] {
    return this.tasks.filter((task) => task.parentTaskId === parentTaskId);
  }

  public getTaskDeletionBlockReason(task: EventTaskEntry): string | null {
    if (String(task.status || '').toUpperCase() !== 'NEW') {
      return this.formatTaskDeletionBlockReason([task]);
    }

    const blockedDescendants: EventTaskEntry[] = [];
    for (const descendantId of this.getTaskAndDescendantIds(task.taskId)) {
      if (descendantId === task.taskId) continue;
      const descendant = this.tasks.find((entry) => entry.taskId === descendantId);
      if (!descendant) continue;
      if (String(descendant.status || '').toUpperCase() !== 'NEW') {
        blockedDescendants.push(descendant);
      }
    }

    return blockedDescendants.length ? this.formatTaskDeletionBlockReason(blockedDescendants) : null;
  }

  private formatTaskDeletionBlockReason(tasks: Array<Pick<EventTaskEntry, 'taskId' | 'status'>>): string {
    const tasksByStatus = new Map<string, number[]>();
    for (const task of tasks) {
      const status = String(task.status || 'UNKNOWN').replace(/[_-]+/g, ' ').toLowerCase();
      const taskIds = tasksByStatus.get(status) ?? [];
      taskIds.push(task.taskId);
      tasksByStatus.set(status, taskIds);
    }

    return [...tasksByStatus].map(([status, taskIds]) => {
      const subject = taskIds.length === 1 ? `Task ID ${taskIds[0]}` : `Task IDs ${taskIds.join(', ')}`;
      return `${subject} ${taskIds.length === 1 ? 'is' : 'are'} ${status}`;
    }).join('; ');
  }

  public getTaskDeletionTooltip(task: EventTaskEntry): string {
    if (this.deletingTaskIds.has(task.taskId)) return 'Deleting task...';
    return this.getTaskDeletionBlockReason(task) ?? 'Delete task';
  }

  private getTaskAndDescendantIds(taskId: number): Set<number> {
    const taskIds = new Set<number>([taskId]);
    const pending = [taskId];
    while (pending.length > 0) {
      const parentId = pending.pop();
      if (parentId === undefined) continue;
      for (const child of this.getChildTasks(parentId)) {
        if (taskIds.has(child.taskId)) continue;
        taskIds.add(child.taskId);
        pending.push(child.taskId);
      }
    }
    return taskIds;
  }

  public getDescendantTaskCount(parentTaskId: number): number {
    const visited = new Set<number>([parentTaskId]);
    const countDescendants = (taskId: number): number => {
      let count = 0;
      for (const child of this.getChildTasks(taskId)) {
        if (visited.has(child.taskId)) continue;
        visited.add(child.taskId);
        count += 1 + countDescendants(child.taskId);
      }
      return count;
    };

    return countDescendants(parentTaskId);
  }

  public taskNumber(taskId: number): number {
    const flattened = this.flattenedTasks;
    const target = flattened.find((entry) => entry.task.taskId === taskId);
    if (!target) return 0;

    const siblings = flattened.filter((entry) =>
      entry.depth === target.depth &&
      (target.depth === 0 || entry.task.parentTaskId === target.task.parentTaskId)
    );
    return siblings.findIndex((entry) => entry.task.taskId === taskId) + 1;
  }

  public getTaskLevelBackground(depth: number): string {
    return taskHierarchyLevelBackground(depth);
  }

  public expandAllTasks(): void {
    this.taskPanels.forEach((panel) => panel.open());
  }

  public collapseAllTasks(): void {
    this.taskPanels.forEach((panel) => panel.close());
  }

  public ngOnInit(): void {
    const parentParams$ = this.route.parent?.params;
    if (!parentParams$) return;

    this.parentParamsSub = parentParams$.subscribe((params) => {
      const eventId = params['id'];
      if (eventId) {
        this.currentEventId = Number(eventId);
        this.loadEventTasks(eventId);
      }
    });
  }

  public ngOnDestroy(): void {
    this.parentParamsSub?.unsubscribe();
  }

  // --- Assignee Search & Editing ---
  public getFilteredTaskAssignees(taskId: number, ownerUserId: number | null): TaskAssignee[] {
    const search = (this.taskAssigneeSearchText[taskId] || '').trim().toLowerCase();
    return this.taskAssignees
      .filter(
        (assignee) =>
          !search ||
          (assignee.name || '').toLowerCase().includes(search) ||
          (assignee.email || '').toLowerCase().includes(search)
      )
      .sort(
        (a, b) =>
          Number(ownerUserId !== null && Number(b.userId) === Number(ownerUserId)) -
            Number(ownerUserId !== null && Number(a.userId) === Number(ownerUserId)) ||
          Number(b.isWinner) - Number(a.isWinner) ||
          (a.name || '').localeCompare(b.name || '')
      );
  }

  public isCurrentTaskAssignee(task: EventTaskEntry, userId: number): boolean {
    return task.ownerUserId !== null && Number(task.ownerUserId) === Number(userId);
  }

  public readonly displayTaskAssigneeName = (value: string | number | null): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    const assignee = this.taskAssignees.find((member) => Number(member.userId) === value);
    return assignee?.name || String(value);
  };

  public getTaskAssigneeDisplay(task: EventTaskEntry): string {
    return Object.prototype.hasOwnProperty.call(this.taskAssigneeSearchText, task.taskId)
      ? this.taskAssigneeSearchText[task.taskId]
      : task.ownerName || '';
  }

  public getTaskOwnerDesignation(task: EventTaskEntry): Pick<TaskAssignee, 'committeeRole' | 'roleIcon' | 'roleColor' | 'photo'> | null {
    const ownerUserId = this.editingTaskAssigneeIds.has(task.taskId) &&
      Object.prototype.hasOwnProperty.call(this.pendingTaskOwnerIds, task.taskId)
      ? this.pendingTaskOwnerIds[task.taskId]
      : task.ownerUserId;
    if (ownerUserId === null || ownerUserId === undefined) {
      return null;
    }
    const owner = this.taskAssignees.find((assignee) => Number(assignee.userId) === Number(ownerUserId));
    return {
      committeeRole: owner?.committeeRole || 'COMMITTEE_MEMBER',
      roleIcon: owner?.roleIcon || null,
      roleColor: owner?.roleColor || null,
      photo: owner?.photo || null
    };
  }

  public isEditingTaskAssignee(taskId: number): boolean {
    return this.editingTaskAssigneeIds.has(taskId);
  }

  public isEditingTaskName(taskId: number): boolean {
    return this.editingTaskNameIds.has(taskId);
  }

  public isEditingTaskRow(task: EventTaskEntry): boolean {
    return this.editingTaskNameIds.has(task.taskId) ||
      this.editingTaskAssigneeIds.has(task.taskId) ||
      this.editingTaskBudgetIds.has(task.taskId);
  }

  public editTaskRow(task: EventTaskEntry): void {
    if (this.isEditingTaskRow(task)) return;
    if (task.canManage) {
      this.taskBudgetEditAmounts[task.taskId] = task.budgetAmount;
      this.taskStatusEditValues[task.taskId] = (task.status || 'NEW') as TaskStatus;
      this.editingTaskBudgetIds.add(task.taskId);
      return;
    }
    if (task.canEditTask) this.editTaskName(task);
    if (task.canEditTask) {
      this.taskBudgetEditAmounts[task.taskId] = task.budgetAmount;
      this.editingTaskBudgetIds.add(task.taskId);
    }
    if (task.canAssignOwner && task.status?.toUpperCase() !== 'COMPLETED') {
      this.editTaskAssignee(task);
    }
  }

  public cancelEditTaskRow(task: EventTaskEntry): void {
    if (
      this.savingTaskNameIds.has(task.taskId) ||
      this.assigningTaskIds.has(task.taskId) ||
      this.savingTaskBudgetIds.has(task.taskId)
    ) return;
    this.cancelEditTaskName(task);
    this.cancelEditTaskAssignee(task);
    this.editingTaskBudgetIds.delete(task.taskId);
    delete this.taskBudgetEditAmounts[task.taskId];
    delete this.taskStatusEditValues[task.taskId];
  }

  public editTaskName(task: EventTaskEntry): void {
    if (!task.canEditTask || this.savingTaskNameIds.has(task.taskId)) return;
    this.taskNameEditText[task.taskId] = task.taskName;
    this.editingTaskNameIds.add(task.taskId);
    setTimeout(() => {
      document.getElementById(`task-name-${task.taskId}`)?.focus();
    });
  }

  public cancelEditTaskName(task: EventTaskEntry): void {
    this.editingTaskNameIds.delete(task.taskId);
    this.taskNameEditText[task.taskId] = task.taskName;
  }

  public canSaveTaskEdits(task: EventTaskEntry): boolean {
    const taskName = String(this.taskNameEditText[task.taskId] ?? '').trim();
    const hasNameChange = this.editingTaskNameIds.has(task.taskId) && taskName !== task.taskName;
    const hasOwnerChange = this.hasPendingTaskOwnerChange(task);
    const budgetAmount = String(this.taskBudgetEditAmounts[task.taskId] ?? '').trim();
    const isEditingBudget = this.editingTaskBudgetIds.has(task.taskId);
    const hasBudgetChange = isEditingBudget &&
      Number(budgetAmount).toFixed(2) !== Number(task.budgetAmount).toFixed(2);
    const hasStatusChange = task.canManage &&
      this.taskStatusEditValues[task.taskId] !== (task.status || 'NEW');
    return (hasNameChange || hasOwnerChange || hasBudgetChange || hasStatusChange) &&
      !(hasNameChange && !taskName) &&
      (!isEditingBudget || isValidTaskBudgetAmount(budgetAmount)) &&
      !this.savingTaskNameIds.has(task.taskId) &&
      !this.assigningTaskIds.has(task.taskId) &&
      !this.savingTaskBudgetIds.has(task.taskId);
  }

  public hasPendingTaskOwnerChange(task: EventTaskEntry): boolean {
    return Object.prototype.hasOwnProperty.call(this.pendingTaskOwnerIds, task.taskId) &&
      this.pendingTaskOwnerIds[task.taskId] !== task.ownerUserId;
  }

  public saveTaskEdits(task: EventTaskEntry): void {
    if (!this.canSaveTaskEdits(task)) return;

    const taskName = String(this.taskNameEditText[task.taskId] ?? '').trim();
    const hasNameChange = this.editingTaskNameIds.has(task.taskId) && taskName !== task.taskName;
    const hasOwnerChange = this.hasPendingTaskOwnerChange(task);
    const budgetAmount = String(this.taskBudgetEditAmounts[task.taskId] ?? '').trim();
    const hasBudgetChange = this.editingTaskBudgetIds.has(task.taskId) &&
      Number(budgetAmount).toFixed(2) !== Number(task.budgetAmount).toFixed(2);
    const hasStatusChange = task.canManage &&
      this.taskStatusEditValues[task.taskId] !== (task.status || 'NEW');
    if (hasNameChange && !taskName) {
      this.notifier.error('Task title cannot be empty.');
      return;
    }

    if (!hasOwnerChange) {
      this.cancelEditTaskAssignee(task);
    }

    if (hasNameChange) {
      this.savingTaskNameIds.add(task.taskId);
      this.tasksService.updateEventTaskName(task.taskId, taskName).subscribe({
        next: (updatedTask) => {
          this.savingTaskNameIds.delete(task.taskId);
          this.editingTaskNameIds.delete(task.taskId);
          if (this.currentEventId === task.eventId) {
            this.eventData = this.tasks.map((entry) => entry.taskId === task.taskId
              ? { ...entry, taskName: updatedTask.taskName, updatedAt: updatedTask.updatedAt }
              : entry);
            this.hierarchyTreeService.notifyTaskNameUpdated(task.taskId, updatedTask.taskName);
            this.notifier.success('Task title updated.');
          }
          this.taskNameEditText[task.taskId] = updatedTask.taskName;
        },
        error: (error) => {
          this.savingTaskNameIds.delete(task.taskId);
          this.notifier.error(error?.message || 'Failed to update task title.');
        }
      });
    } else {
      this.editingTaskNameIds.delete(task.taskId);
      this.taskNameEditText[task.taskId] = task.taskName;
    }

    if (hasOwnerChange) {
      const ownerUserId = this.pendingTaskOwnerIds[task.taskId];
      this.assigningTaskIds.add(task.taskId);
      this.tasksService.assignEventTask(task.taskId, ownerUserId).subscribe({
        next: (updatedTask) => {
          this.assigningTaskIds.delete(task.taskId);
          this.editingTaskAssigneeIds.delete(task.taskId);
          delete this.pendingTaskOwnerIds[task.taskId];
          this.taskAssigneeSearchText[task.taskId] = updatedTask.ownerName || '';
          this.clearedTaskAssigneeSearchIds.update((ids) => {
            const next = new Set(ids);
            next.delete(task.taskId);
            return next;
          });
          if (!hasNameChange) {
            this.editingTaskNameIds.delete(task.taskId);
            this.taskNameEditText[task.taskId] = task.taskName;
          }
          if (this.currentEventId === task.eventId) {
            this.eventData = this.tasks.map((entry) => entry.taskId === task.taskId
              ? {
                  ...entry,
                  ownerUserId: updatedTask.ownerUserId,
                  ownerName: updatedTask.ownerName,
                  assignedByName: updatedTask.assignedByName,
                  ownerAssignedAt: updatedTask.ownerAssignedAt,
                  updatedAt: updatedTask.updatedAt
                }
              : entry);
            this.hierarchyTreeService.triggerHierarchyTreeRefresh();
            this.notifier.success(
              ownerUserId === null
                ? `Task "${updatedTask.taskName}" is unassigned.`
                : `Task "${updatedTask.taskName}" assigned to ${updatedTask.ownerName}.`
            );
          }
        },
        error: (error) => {
          this.assigningTaskIds.delete(task.taskId);
          this.notifier.error(
            error?.error?.errors?.[0]?.message ||
            error?.error?.message ||
            'Failed to assign task.'
          );
        }
      });
    }

    if (hasBudgetChange || hasStatusChange) {
      this.savingTaskBudgetIds.add(task.taskId);
      this.taskDetailsService.updateTaskBudget(
        task.taskId,
        budgetAmount,
        hasStatusChange ? this.taskStatusEditValues[task.taskId] : undefined
      ).subscribe({
        next: (updatedTask) => {
          this.savingTaskBudgetIds.delete(task.taskId);
          this.editingTaskBudgetIds.delete(task.taskId);
          delete this.taskBudgetEditAmounts[task.taskId];
          delete this.taskStatusEditValues[task.taskId];
          if (this.currentEventId === task.eventId) {
            this.eventData = this.tasks.map((entry) => entry.taskId === task.taskId
              ? {
                  ...entry,
                  budgetAmount: updatedTask.budgetAmount,
                  status: updatedTask.status,
                  budgetRequestId: updatedTask.requestId,
                  requestedBudgetAmount: updatedTask.requestedBudgetAmount,
                  budgetRequestStatus: updatedTask.requestStatus,
                  budgetRequestedByName: updatedTask.requestStatus === 'PENDING' ? 'You' : null,
                  canReviewBudgetRequest: false,
                  updatedAt: updatedTask.updatedAt
                }
              : entry);
            this.notifier.success(updatedTask.requestStatus === 'PENDING'
              ? 'Budget increase request sent for approval.'
              : hasStatusChange
                ? 'Task budget and status updated.'
                : 'Task budget updated.');
          }
        },
        error: (error: Error) => {
          this.savingTaskBudgetIds.delete(task.taskId);
          this.notifier.error(error.message || 'Failed to update task budget.');
        }
      });
    } else {
      this.editingTaskBudgetIds.delete(task.taskId);
      delete this.taskBudgetEditAmounts[task.taskId];
      delete this.taskStatusEditValues[task.taskId];
    }
  }

  public isTaskAssigneeSearchCleared(taskId: number): boolean {
    return this.clearedTaskAssigneeSearchIds().has(taskId);
  }

  public hasTaskAssigneeSearch(taskId: number): boolean {
    return (this.taskAssigneeSearchText[taskId] || '').length > 0;
  }

  public editTaskAssignee(task: EventTaskEntry): void {
    if (!task.canAssignOwner || this.assigningTaskIds.has(task.taskId)) {
      return;
    }
    this.taskAssigneeSearchText[task.taskId] = task.ownerName || '';
    this.clearedTaskAssigneeSearchIds.update((ids) => {
      const next = new Set(ids);
      next.delete(task.taskId);
      return next;
    });
    this.pendingTaskOwnerIds[task.taskId] = task.ownerUserId;
    this.editingTaskAssigneeIds.add(task.taskId);
  }

  public cancelEditTaskAssignee(task: EventTaskEntry): void {
    this.editingTaskAssigneeIds.delete(task.taskId);
    delete this.pendingTaskOwnerIds[task.taskId];
    this.taskAssigneeSearchText[task.taskId] = task.ownerName || '';
    this.clearedTaskAssigneeSearchIds.update((ids) => {
      const next = new Set(ids);
      next.delete(task.taskId);
      return next;
    });
  }

  public onTaskAssigneeFocus(taskId: number, trigger: MatAutocompleteTrigger): void {
    this.taskAssigneeSearchText[taskId] = '';
    this.clearedTaskAssigneeSearchIds.update((ids) => new Set(ids).add(taskId));
    trigger.openPanel();
  }

  public onTaskAssigneeAutocompleteClosed(task: EventTaskEntry): void {
    if (this.assigningTaskIds.has(task.taskId)) {
      return;
    }

    const pendingOwnerId = this.pendingTaskOwnerIds[task.taskId];
    const pendingOwner = this.taskAssignees.find((member) => member.userId === pendingOwnerId);
    this.taskAssigneeSearchText[task.taskId] = pendingOwner?.name || task.ownerName || '';
    this.clearedTaskAssigneeSearchIds.update((ids) => {
      const next = new Set(ids);
      next.delete(task.taskId);
      return next;
    });
  }

  public onTaskAssigneeSearch(taskId: number, value: string): void {
    this.taskAssigneeSearchText[taskId] = value;
  }

  public clearTaskAssigneeSearch(
    taskId: number,
    trigger: MatAutocompleteTrigger,
    event: MouseEvent
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.taskAssigneeSearchText[taskId] = '';
    this.clearedTaskAssigneeSearchIds.update((ids) => new Set(ids).add(taskId));
    trigger.openPanel();
  }

  public onTaskAssigneeChange(task: EventTaskEntry, event: MatAutocompleteSelectedEvent): void {
    if (!task.canAssignOwner || this.assigningTaskIds.has(task.taskId)) {
      return;
    }

    const ownerUserId = event.option.value === '' ? null : Number(event.option.value);
    if (
      event.option.disabled ||
      ownerUserId === task.ownerUserId ||
      (ownerUserId !== null && this.isCurrentTaskAssignee(task, ownerUserId))
    ) {
      this.pendingTaskOwnerIds[task.taskId] = task.ownerUserId;
      this.taskAssigneeSearchText[task.taskId] = task.ownerName || '';
      this.clearedTaskAssigneeSearchIds.update((ids) => {
        const next = new Set(ids);
        next.delete(task.taskId);
        return next;
      });
      return;
    }

    if (ownerUserId !== null && !this.taskAssignees.some((assignee) => assignee.userId === ownerUserId)) {
      this.notifier.error('Selected assignee is not a member of this committee.');
      return;
    }

    const selectedAssignee = this.taskAssignees.find((assignee) => assignee.userId === ownerUserId);
    this.pendingTaskOwnerIds[task.taskId] = ownerUserId;
    this.taskAssigneeSearchText[task.taskId] = selectedAssignee?.name || '';
    this.clearedTaskAssigneeSearchIds.update((ids) => {
      const next = new Set(ids);
      next.delete(task.taskId);
      return next;
    });

  }

  public async onDeleteTask(task: EventTaskEntry, event: Event): Promise<void> {
    event.stopPropagation();
    if (!task.canDelete || this.deletingTaskIds.has(task.taskId) || this.getTaskDeletionBlockReason(task)) return;

    const dialogData: ConfirmDialogData = {
      title: 'Delete Task',
      message: `Delete "${task.taskName}" and its subtasks? Only NEW tasks can be deleted, and all descendants must also be NEW.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };
    const result = await firstValueFrom(this.confirmDialog.open(dialogData).afterClosed());
    if (!result?.confirmed || !task.canDelete || this.deletingTaskIds.has(task.taskId) || this.getTaskDeletionBlockReason(task)) return;

    const deletedTaskIds = this.getTaskAndDescendantIds(task.taskId);
    this.deletingTaskIds.add(task.taskId);
    try {
      await firstValueFrom(this.tasksService.deleteEventTask(task.taskId));
      if (this.currentEventId !== task.eventId) return;

      this.eventData = this.tasks.filter((entry) => !deletedTaskIds.has(entry.taskId));
      this.eventDetailsState.decrementTaskCounts(task.parentTaskId === null, deletedTaskIds.size);
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.notifier.success(`Task "${task.taskName}" deleted successfully.`);
    } catch (error) {
      this.notifier.error(
        error instanceof Error ? error.message : 'Failed to delete task.'
      );
    } finally {
      this.deletingTaskIds.delete(task.taskId);
    }
  }

  public statusTagClass(status: string | null | undefined): string {
    const normalized = String(status || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (normalized === 'assigned') return 'tag-legacy-assigned';
    return normalized ? `tag-${normalized}` : 'tag-none';
  }

  public statusLabel(status: string | null | undefined): string {
    return String(status || 'NEW').replace(/_/g, ' ');
  }

  public isValidTaskBudgetAmount(value: string): boolean {
    return isValidTaskBudgetAmount(value);
  }

  public formatTaskBudgetAmount(value: string | number | null | undefined): string {
    return formatTaskBudgetAmount(value);
  }

  public formatTaskBudgetAmountCompact(value: string | number | null | undefined): string {
    return formatTaskBudgetAmountCompact(value);
  }

  public getTaskBudgetDisplay(task: EventTaskEntry): string {
    const total = formatTaskBudgetAmountCompact(task.budgetAmount);
    const remaining = calculateTaskBudgetRemaining(task.taskId, task.budgetAmount, this.tasks);
    return `Rem ${formatTaskBudgetAmountCompact(remaining)} / Tot ${total}`;
  }

  public reviewTaskBudgetRequest(task: EventTaskEntry, decision: 'APPROVE' | 'REJECT'): void {
    const requestId = task.budgetRequestId;
    if (!requestId || !task.canReviewBudgetRequest || this.reviewingTaskBudgetRequestIds.has(task.taskId)) return;
    this.reviewingTaskBudgetRequestIds.add(task.taskId);
    this.taskDetailsService.reviewTaskBudgetRequest(requestId, decision).subscribe({
      next: (result) => {
        this.reviewingTaskBudgetRequestIds.delete(task.taskId);
        this.eventData = this.tasks.map((entry) => entry.taskId === task.taskId
          ? {
              ...entry,
              budgetAmount: result.budgetAmount,
              budgetRequestId: null,
              requestedBudgetAmount: null,
              budgetRequestStatus: null,
              budgetRequestedByName: null,
              canReviewBudgetRequest: false,
              updatedAt: result.updatedAt
            }
          : entry);
        this.notifier.success(decision === 'APPROVE' ? 'Budget request approved.' : 'Budget request rejected.');
      },
      error: (error: Error) => {
        this.reviewingTaskBudgetRequestIds.delete(task.taskId);
        this.notifier.error(error.message || 'Failed to review budget request.');
      }
    });
  }

  public canSubmitTaskBudgetIncrease(task: EventTaskEntry): boolean {
    const amount = this.taskBudgetIncreaseAmounts[task.taskId];
    return task.canRequestBudgetIncrease &&
      task.budgetRequestStatus !== 'PENDING' &&
      !this.requestingTaskBudgetIncreaseIds.has(task.taskId) &&
      isValidTaskBudgetAmount(amount) &&
      Number(amount) > 0;
  }

  public requestTaskBudgetIncrease(task: EventTaskEntry): void {
    const amount = String(this.taskBudgetIncreaseAmounts[task.taskId] ?? '').trim();
    if (!this.canSubmitTaskBudgetIncrease(task)) return;

    this.requestingTaskBudgetIncreaseIds.add(task.taskId);
    this.taskDetailsService.requestTaskBudgetIncrease(task.taskId, amount).subscribe({
      next: (result) => {
        this.requestingTaskBudgetIncreaseIds.delete(task.taskId);
        delete this.taskBudgetIncreaseAmounts[task.taskId];
        this.eventData = this.tasks.map((entry) => entry.taskId === task.taskId
          ? {
              ...entry,
              budgetAmount: result.budgetAmount,
              budgetRequestId: result.requestId,
              requestedBudgetAmount: result.requestedBudgetAmount,
              budgetRequestStatus: result.requestStatus,
              budgetRequestedByName: 'You',
              canReviewBudgetRequest: false,
              updatedAt: result.updatedAt
            }
          : entry);
        this.notifier.success('Budget increase request sent for approval.');
      },
      error: (error: Error) => {
        this.requestingTaskBudgetIncreaseIds.delete(task.taskId);
        this.notifier.error(error.message || 'Failed to request a budget increase.');
      }
    });
  }

  // --- Task Creation ---
  public onCreateTask(): void {
    if (!this.canCreateTasks || !this.currentEventId || this.isCreatingTask || this.isSavingTask) {
      return;
    }
    this.newTaskName = '';
    this.newTaskBudget = '0.00';
    this.isCreatingTask = true;
  }

  public onCancelTask(): void {
    if (this.isSavingTask) return;
    this.isCreatingTask = false;
    this.newTaskName = '';
    this.newTaskBudget = '0.00';
  }

  public onSaveTask(): void {
    const taskName = this.newTaskName.trim();
    if (!taskName || taskName.length > 255 || !isValidTaskBudgetAmount(this.newTaskBudget) || this.isSavingTask || !this.currentEventId) {
      return;
    }

    const eventId = this.currentEventId;
    this.isSavingTask = true;
    this.tasksService.createEventTask({
      eventId,
      taskName,
      budgetAmount: this.newTaskBudget.trim()
    }).subscribe({
      next: (task) => {
        if (this.currentEventId === eventId) {
          this.eventData = [...this.tasks, task];
          this.isCreatingTask = false;
          this.newTaskName = '';
          this.newTaskBudget = '0.00';
          this.eventDetailsState.incrementTaskCounts(true);
        }
        this.isSavingTask = false;
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
        this.notifier.success(`Task "${task.taskName}" created.`);
      },
      error: (error) => {
        this.isSavingTask = false;
        this.notifier.error(
          error?.error?.errors?.[0]?.message ||
          error?.error?.message ||
          'Failed to create task.'
        );
      }
    });
  }

  // --- Helpers ---
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
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (parts[0] || '').slice(0, 2).toUpperCase();
  }

  // --- Data Fetching ---
  private loadEventTasks(eventId: string): void {
    const requestId = ++this.taskLoadRequestId;
    this.taskAssigneeSearchText = {};
    this.pendingTaskOwnerIds = {};
    this.isLoading = true;
    this.hasLoadError = false;

    this.tasksService.getEventTasks(eventId).subscribe({
      next: (data: EventTasksPayload) => {
        if (requestId !== this.taskLoadRequestId) return;
        this.eventData = data.entries ?? [];
        this.canCreateTasks = data.canCreateTasks;
        this.taskAssignees = data.taskAssignees ?? [];
        this.isLoading = false;
      },
      error: (error) => {
        if (requestId !== this.taskLoadRequestId) return;
        this.eventData = [];
        this.taskAssignees = [];
        this.canCreateTasks = false;
        this.isLoading = false;
        this.hasLoadError = true;
        this.notifier.error(error?.error?.errors?.[0]?.message || 'Failed to load event tasks.');
      }
    });
  }
}