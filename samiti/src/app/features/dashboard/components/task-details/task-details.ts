import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, QueryList, signal, ViewChildren } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom, finalize } from 'rxjs';
import { LoadingStateService } from '../../../../shared/services/loading-state.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { TodoItem } from '../../models/todo.models';
import { TodoChecklistComponent } from '../todo-checklist/todo-checklist.component';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { calculateTaskBudgetRemaining, formatTaskBudgetAmount, formatTaskBudgetAmountCompact, isValidTaskBudgetAmount, TASK_STATUSES, TaskAssignee, TaskStatus, taskHierarchyLevelBackground } from '../event-details/event-tasks/event-tasks.models';
import { EventTasksService } from '../event-details/event-tasks/event-tasks.service';
import { EventDetailsStateService } from '../event-details/event-details-state.service';
import { TaskChild, TaskDetailsPayload } from './task-details.models';
import { TaskDetailsService } from './task-details.service';
import { TaskFinanceComponent } from '../task-finance/task-finance.component';

@Component({
  selector: 'app-task-details',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatExpansionModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    TodoChecklistComponent,
    TaskFinanceComponent
  ],
  templateUrl: './task-details.html',
  styleUrl: './task-details.scss'
})
export class TaskDetailsComponent implements OnInit {
  @ViewChildren(MatExpansionPanel) private subtaskPanels!: QueryList<MatExpansionPanel>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(TaskDetailsService);
  private readonly notifier = inject(NotifierService);
  private readonly loadingState = inject(LoadingStateService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly eventTasksService = inject(EventTasksService);
  private readonly eventDetailsState = inject(EventDetailsStateService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;
  public readonly isLoading = signal(true);
  public readonly task = signal<TaskDetailsPayload | null>(null);
  public readonly taskStatuses = TASK_STATUSES;
  public readonly isStatusDropdownOpen = signal(false);
  public readonly isEditingTask = signal(false);
  public readonly isSavingTaskName = signal(false);
  public readonly isEditingBudget = signal(false);
  public readonly isSavingBudget = signal(false);
  public readonly isDeletingTask = signal(false);
  public selectedTaskTabIndex = 0;
  public isCreatingChecklist = false;
  public newChecklistName = '';
  public isCreatingSubtask = false;
  public isSavingSubtask = false;
  public newSubtaskName = '';
  public newSubtaskBudget: string | number = '0.00';
  public editingTaskName = '';
  public editingBudgetAmount: string | number = '0.00';
  public budgetIncreaseAmount: string | number = '';
  public readonly isRequestingBudgetIncrease = signal(false);
  public editingBudgetStatus: TaskStatus = 'NEW';
  public readonly assigningSubtaskIds = new Set<number>();
  public readonly deletingSubtaskIds = new Set<number>();
  public readonly editingSubtaskAssigneeIds = new Set<number>();
  public readonly editingSubtaskNameIds = new Set<number>();
  public readonly savingSubtaskNameIds = new Set<number>();
  public readonly editingSubtaskBudgetIds = new Set<number>();
  public readonly savingSubtaskBudgetIds = new Set<number>();
  public readonly reviewingSubtaskBudgetRequestIds = new Set<number>();
  public readonly reviewingTaskBudgetRequestIds = new Set<number>();
  public readonly requestingSubtaskBudgetIncreaseIds = new Set<number>();
  public readonly clearedSubtaskAssigneeSearchIds = signal<Set<number>>(new Set<number>());
  public subtaskAssigneeSearchText: Record<number, string> = {};
  public pendingSubtaskOwnerIds: Record<number, number | null> = {};
  public subtaskNameEditText: Record<number, string> = {};
  public subtaskBudgetEditAmounts: Record<number, string | number> = {};
  public subtaskBudgetIncreaseAmounts: Record<number, string | number> = {};
  public subtaskBudgetEditStatuses: Record<number, TaskStatus> = {};

  public ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const taskId = params.get('id');
      if (!taskId || !/^\d+$/.test(taskId) || Number(taskId) <= 0) {
        this.requestId++;
        this.task.set(null);
        this.isLoading.set(false);
        this.notifier.error('Invalid task ID.');
        return;
      }
      this.loadTask(taskId);
    });
  }

  public onTodosChange(todos: TodoItem[]): void {
    this.task.update((current) => current ? { ...current, todos } : current);
  }

  public onCreateChecklistItem(task: TaskDetailsPayload): void {
    if (!task.canManageTodos) return;
    this.newChecklistName = '';
    this.isCreatingChecklist = true;
  }

  public onCancelChecklistItem(checklist: TodoChecklistComponent): void {
    if (checklist.isAdding) return;
    this.newChecklistName = '';
    this.isCreatingChecklist = false;
  }

  public onChecklistItemAdded(): void {
    this.newChecklistName = '';
    this.isCreatingChecklist = false;
  }

  public getSubtaskLevelBackground(depth: number): string {
    return taskHierarchyLevelBackground(depth);
  }

  public expandAllSubtasks(): void {
    this.subtaskPanels.forEach((panel) => panel.open());
  }

  public collapseAllSubtasks(): void {
    this.subtaskPanels.forEach((panel) => panel.close());
  }

  public onCreateSubtask(task: TaskDetailsPayload): void {
    if (!task.canCreateTasks || this.isCreatingSubtask || this.isSavingSubtask) return;
    this.newSubtaskName = '';
    this.newSubtaskBudget = '0.00';
    this.isCreatingSubtask = true;
  }

  public onCancelSubtask(): void {
    if (this.isSavingSubtask) return;
    this.isCreatingSubtask = false;
    this.newSubtaskName = '';
    this.newSubtaskBudget = '0.00';
  }

  public async onSaveSubtask(task: TaskDetailsPayload): Promise<void> {
    const taskName = this.newSubtaskName.trim();
    if (!task.canCreateTasks || !taskName || taskName.length > 255 ||
      !isValidTaskBudgetAmount(this.newSubtaskBudget) || this.isSavingSubtask) return;

    this.isSavingSubtask = true;
    try {
      const child = await firstValueFrom(this.eventTasksService.createEventTask({
        eventId: task.eventId,
        parentTaskId: task.taskId,
        taskName,
        budgetAmount: String(this.newSubtaskBudget).trim()
      }));
      this.task.update((current) =>
        current?.taskId === task.taskId
          ? {
              ...current,
              children: [...current.children, {
                taskId: child.taskId,
                parentTaskId: task.taskId,
                taskName: child.taskName,
                budgetAmount: child.budgetAmount,
                budgetRequestId: null,
                requestedBudgetAmount: null,
                budgetRequestStatus: null,
                budgetRequestedByName: null,
                canReviewBudgetRequest: false,
                canRequestBudgetIncrease: child.canRequestBudgetIncrease,
                status: child.status,
                ownerUserId: child.ownerUserId,
                ownerName: child.ownerName,
                assignedByName: child.assignedByName,
                createdByName: child.createdByName,
                createdAt: child.createdAt,
                ownerAssignedAt: child.ownerAssignedAt,
                canEditTask: child.canEditTask,
                canManage: child.canManage,
                canAssignOwner: child.canAssignOwner,
                canDelete: child.canDelete
              }],
              descendants: [...(current.descendants ?? []), {
                taskId: child.taskId,
                parentTaskId: task.taskId,
                taskName: child.taskName,
                budgetAmount: child.budgetAmount,
                budgetRequestId: null,
                requestedBudgetAmount: null,
                budgetRequestStatus: null,
                budgetRequestedByName: null,
                canReviewBudgetRequest: false,
                canRequestBudgetIncrease: child.canRequestBudgetIncrease,
                status: child.status,
                ownerUserId: child.ownerUserId,
                ownerName: child.ownerName,
                assignedByName: child.assignedByName,
                createdByName: child.createdByName,
                createdAt: child.createdAt,
                ownerAssignedAt: child.ownerAssignedAt,
                canEditTask: child.canEditTask,
                canManage: child.canManage,
                canAssignOwner: child.canAssignOwner,
                canDelete: child.canDelete
              }]
          }
          : current
      );
      this.eventDetailsState.incrementTaskCounts(false);
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.isCreatingSubtask = false;
      this.newSubtaskName = '';
      this.newSubtaskBudget = '0.00';
      this.notifier.success(`Subtask "${child.taskName}" created.`);
    } catch (error) {
      this.notifier.error(
        error instanceof Error ? error.message : 'Failed to create subtask.'
      );
    } finally {
      this.isSavingSubtask = false;
    }
  }

  public startTaskEditing(task: TaskDetailsPayload): void {
    if (!task.canEditTask || this.isSavingTaskName() || this.isDeletingTask()) return;
    this.editingTaskName = task.taskName;
    this.isEditingTask.set(true);
    setTimeout(() => document.getElementById('task-name')?.focus());
  }

  public cancelTaskEditing(): void {
    this.isEditingTask.set(false);
    this.editingTaskName = '';
  }

  public canSaveTaskName(task: TaskDetailsPayload): boolean {
    const taskName = this.editingTaskName.trim();
    return !this.isSavingTaskName() && Boolean(taskName) && taskName !== task.taskName;
  }

  public async saveTaskName(task: TaskDetailsPayload): Promise<void> {
    const taskName = this.editingTaskName.trim();
    if (!task.canEditTask || !this.canSaveTaskName(task) || taskName.length > 255) return;

    this.isSavingTaskName.set(true);
    try {
      const updatedTask = await firstValueFrom(this.service.updateTaskName(task.taskId, taskName));
      this.task.update((current) =>
        current?.taskId === task.taskId
          ? { ...current, taskName: updatedTask.taskName, updatedAt: updatedTask.updatedAt }
          : current
      );
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.cancelTaskEditing();
      this.notifier.success('Task updated successfully.');
    } catch (error) {
      this.notifier.error(
        error instanceof Error ? error.message : 'Failed to update task.'
      );
    } finally {
      this.isSavingTaskName.set(false);
    }
  }

  public startBudgetEditing(task: TaskDetailsPayload): void {
    if (!task.canEditTask && !task.canManage) return;
    if (this.isSavingBudget()) return;
    this.editingBudgetAmount = task.budgetAmount;
    this.editingBudgetStatus = this.statusValue(task.status) as TaskStatus;
    this.isEditingBudget.set(true);
  }

  public cancelBudgetEditing(): void {
    if (this.isSavingBudget()) return;
    this.isEditingBudget.set(false);
    this.editingBudgetAmount = '';
    this.editingBudgetStatus = 'NEW';
  }

  public isValidTaskBudgetAmount(value: string | number | null | undefined): boolean {
    return isValidTaskBudgetAmount(value);
  }

  public formatTaskBudgetAmount(value: string | number | null | undefined): string {
    return formatTaskBudgetAmount(value);
  }

  public formatTaskBudgetAmountCompact(value: string | number | null | undefined): string {
    return formatTaskBudgetAmountCompact(value);
  }

  public getTaskBudgetRemainingDisplay(taskId: number, budgetAmount: string | number): string {
    const remaining = calculateTaskBudgetRemaining(
      taskId,
      budgetAmount,
      this.task()?.descendants ?? []
    );
    return formatTaskBudgetAmountCompact(remaining);
  }

  public reviewSubtaskBudgetRequest(
    child: TaskDetailsPayload['descendants'][number],
    decision: 'APPROVE' | 'REJECT'
  ): void {
    const requestId = child.budgetRequestId;
    if (!requestId || !child.canReviewBudgetRequest || this.reviewingSubtaskBudgetRequestIds.has(child.taskId)) return;
    this.reviewingSubtaskBudgetRequestIds.add(child.taskId);
    this.service.reviewTaskBudgetRequest(requestId, decision).subscribe({
      next: (result) => {
        this.reviewingSubtaskBudgetRequestIds.delete(child.taskId);
        this.updateSubtaskBudget(child.taskId, {
          budgetAmount: result.budgetAmount,
          budgetRequestId: null,
          requestedBudgetAmount: null,
          budgetRequestStatus: null,
          budgetRequestedByName: null,
          canReviewBudgetRequest: false
        });
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
        this.notifier.success(decision === 'APPROVE' ? 'Budget request approved.' : 'Budget request rejected.');
      },
      error: (error: Error) => {
        this.reviewingSubtaskBudgetRequestIds.delete(child.taskId);
        this.notifier.error(error.message || 'Failed to review budget request.');
      }
    });
  }

  public reviewTaskBudgetRequest(
    task: TaskDetailsPayload,
    decision: 'APPROVE' | 'REJECT'
  ): void {
    const requestId = task.budgetRequestId;
    if (!requestId || !task.canReviewBudgetRequest || this.reviewingTaskBudgetRequestIds.has(task.taskId)) return;
    this.reviewingTaskBudgetRequestIds.add(task.taskId);
    this.service.reviewTaskBudgetRequest(requestId, decision).subscribe({
      next: (result) => {
        this.reviewingTaskBudgetRequestIds.delete(task.taskId);
        this.task.update((current) => current?.taskId === task.taskId
          ? {
              ...current,
                budgetAmount: result.budgetAmount,
                budgetRequestId: null,
                requestedBudgetAmount: null,
                budgetRequestStatus: null,
              budgetRequestedByName: null,
              canReviewBudgetRequest: false,
              updatedAt: result.updatedAt
            }
          : current
        );
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
        this.notifier.success(decision === 'APPROVE' ? 'Budget request approved.' : 'Budget request rejected.');
      },
      error: (error: Error) => {
        this.reviewingTaskBudgetRequestIds.delete(task.taskId);
        this.notifier.error(error.message || 'Failed to review budget request.');
      }
    });
  }

  public canSubmitBudgetIncrease(value: string | number | null | undefined): boolean {
    return isValidTaskBudgetAmount(value) && Number(value) > 0;
  }

  public async requestBudgetIncrease(task: TaskDetailsPayload): Promise<void> {
    const amount = String(this.budgetIncreaseAmount).trim();
    if (
      !task.canRequestBudgetIncrease ||
      task.budgetRequestStatus === 'PENDING' ||
      this.isRequestingBudgetIncrease() ||
      !this.canSubmitBudgetIncrease(amount)
    ) return;

    this.isRequestingBudgetIncrease.set(true);
    try {
      const result = await firstValueFrom(this.service.requestTaskBudgetIncrease(task.taskId, amount));
      this.task.update((current) => current?.taskId === task.taskId
        ? {
            ...current,
            budgetAmount: result.budgetAmount,
            budgetRequestId: result.requestId,
            requestedBudgetAmount: result.requestedBudgetAmount,
            budgetRequestStatus: result.requestStatus,
            budgetRequestedByName: 'You',
            canReviewBudgetRequest: false,
            updatedAt: result.updatedAt
          }
        : current
      );
      this.budgetIncreaseAmount = '';
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.notifier.success('Budget increase request sent for approval.');
    } catch (error) {
      this.notifier.error(
        error instanceof Error ? error.message : 'Failed to request a budget increase.'
      );
    } finally {
      this.isRequestingBudgetIncrease.set(false);
    }
  }

  public requestSubtaskBudgetIncrease(child: TaskChild): void {
    const amount = String(this.subtaskBudgetIncreaseAmounts[child.taskId] ?? '').trim();
    if (
      !child.canRequestBudgetIncrease ||
      child.budgetRequestStatus === 'PENDING' ||
      this.requestingSubtaskBudgetIncreaseIds.has(child.taskId) ||
      !this.canSubmitBudgetIncrease(amount)
    ) return;

    this.requestingSubtaskBudgetIncreaseIds.add(child.taskId);
    this.service.requestTaskBudgetIncrease(child.taskId, amount).subscribe({
      next: (result) => {
        this.requestingSubtaskBudgetIncreaseIds.delete(child.taskId);
        delete this.subtaskBudgetIncreaseAmounts[child.taskId];
        this.updateSubtaskBudget(child.taskId, {
          budgetAmount: result.budgetAmount,
          budgetRequestId: result.requestId,
          requestedBudgetAmount: result.requestedBudgetAmount,
          budgetRequestStatus: result.requestStatus,
          budgetRequestedByName: 'You',
          canReviewBudgetRequest: false
        });
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
        this.notifier.success('Budget increase request sent for approval.');
      },
      error: (error: Error) => {
        this.requestingSubtaskBudgetIncreaseIds.delete(child.taskId);
        this.notifier.error(error.message || 'Failed to request a budget increase.');
      }
    });
  }

  public canSaveTaskBudget(task: TaskDetailsPayload): boolean {
    const amount = String(this.editingBudgetAmount).trim();
    return (task.canEditTask || task.canManage) &&
      !this.isSavingBudget() &&
      isValidTaskBudgetAmount(amount) &&
      (Number(amount).toFixed(2) !== Number(task.budgetAmount).toFixed(2) ||
        (task.canManage && this.editingBudgetStatus !== this.statusValue(task.status)));
  }

  public async saveTaskBudget(task: TaskDetailsPayload): Promise<void> {
    const budgetAmount = String(this.editingBudgetAmount).trim();
    if (!this.canSaveTaskBudget(task)) return;
    const hasStatusChange = task.canManage &&
      this.editingBudgetStatus !== this.statusValue(task.status);

    this.isSavingBudget.set(true);
    try {
      const updatedTask = await firstValueFrom(
        this.service.updateTaskBudget(
          task.taskId,
          budgetAmount,
          task.canManage && this.editingBudgetStatus !== this.statusValue(task.status)
            ? this.editingBudgetStatus
            : undefined
        )
      );
      this.task.update((current) =>
        current?.taskId === task.taskId
          ? {
              ...current,
              budgetAmount: updatedTask.budgetAmount,
              status: updatedTask.status,
              budgetRequestId: updatedTask.requestId,
              requestedBudgetAmount: updatedTask.requestedBudgetAmount,
              budgetRequestStatus: updatedTask.requestStatus,
              budgetRequestedByName: updatedTask.requestStatus === 'PENDING' ? 'You' : null,
              canReviewBudgetRequest: false,
              updatedAt: updatedTask.updatedAt
            }
          : current
      );
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.isEditingBudget.set(false);
      this.editingBudgetAmount = '';
      this.editingBudgetStatus = 'NEW';
      this.notifier.success(updatedTask.requestStatus === 'PENDING'
        ? 'Budget increase request sent for approval.'
        : hasStatusChange
          ? 'Task budget and status updated successfully.'
          : 'Task budget updated successfully.');
    } catch (error) {
      this.notifier.error(
        error instanceof Error ? error.message : 'Failed to update task budget.'
      );
    } finally {
      this.isSavingBudget.set(false);
    }
  }

  public async onDeleteTask(task: TaskDetailsPayload): Promise<void> {
    if (!task.canDeleteTask || this.isDeletingTask() || this.getTaskDeletionBlockReason(task)) return;

    const dialogData: ConfirmDialogData = {
      title: 'Delete Task',
      message: `Delete "${task.taskName}" and its subtasks? Only NEW tasks can be deleted, and all descendants must also be NEW.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };
    const result = await firstValueFrom(this.confirmDialog.open(dialogData).afterClosed());
    if (!result?.confirmed || !task.canDeleteTask || this.getTaskDeletionBlockReason(task)) return;

    this.isDeletingTask.set(true);
    try {
      await firstValueFrom(this.service.deleteTask(task.taskId));
      this.notifier.success(`Task "${task.taskName}" deleted successfully.`);
      this.eventDetailsState.decrementTaskCounts(
        task.parentTaskId === null,
        1 + this.getSubtaskDescendantCount(task.taskId)
      );
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      if (task.parentTaskId) {
        await this.router.navigate(['/dashboard', 'task', task.parentTaskId]);
      } else {
        await this.router.navigate(['/dashboard', 'event', task.eventId]);
      }
    } catch (error) {
      this.notifier.error(
        error instanceof Error ? error.message : 'Failed to delete task.'
      );
    } finally {
      this.isDeletingTask.set(false);
    }
  }

  public async onDeleteSubtask(task: TaskChild, event: Event): Promise<void> {
    event.stopPropagation();
    if (!task.canDelete || this.deletingSubtaskIds.has(task.taskId) || this.getTaskDeletionBlockReason(task)) return;

    const result = await firstValueFrom(this.confirmDialog.open({
      title: 'Delete Subtask',
      message: `Delete "${task.taskName}" and its subtasks? Only NEW tasks can be deleted, and all descendants must also be NEW.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    }).afterClosed());
    if (!result?.confirmed || !task.canDelete || this.getTaskDeletionBlockReason(task)) return;

    const deletedTaskIds = this.getTaskAndDescendantIds(task.taskId);
    this.deletingSubtaskIds.add(task.taskId);
    try {
      await firstValueFrom(this.service.deleteTask(task.taskId));
      this.task.update((current) => current
        ? {
            ...current,
            children: current.children.filter((child) => !deletedTaskIds.has(child.taskId)),
            descendants: current.descendants.filter((child) => !deletedTaskIds.has(child.taskId))
          }
        : current
      );
      this.eventDetailsState.decrementTaskCounts(false, deletedTaskIds.size);
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.notifier.success(`Subtask "${task.taskName}" deleted successfully.`);
    } catch (error) {
      this.notifier.error(
        error instanceof Error ? error.message : 'Failed to delete subtask.'
      );
    } finally {
      this.deletingSubtaskIds.delete(task.taskId);
    }
  }

  public statusClass(status: string | null): string {
    const normalized = String(status || 'PENDING').toUpperCase();
    if (normalized === 'COMPLETED') return 'completed';
    if (normalized === 'IN_PROGRESS' || normalized === 'ACTIVE' || normalized === 'ONGOING') return 'started';
    if (normalized === 'HOLD') return 'hold';
    if (normalized === 'WONT_FIX') return 'wont-fix';
    if (normalized === 'ASSIGNED') return 'legacy-assigned';
    if (normalized === 'NEW') return 'new';
    return 'upcoming';
  }

  public displayStatus(status: string | null): string {
    return String(status || 'PENDING').replace(/[_-]+/g, ' ').toUpperCase();
  }

  public getSubtaskChildren(parentTaskId: number): TaskDetailsPayload['descendants'] {
    return (this.task()?.descendants ?? []).filter((child) => child.parentTaskId === parentTaskId);
  }

  public getTaskDeletionBlockReason(task: Pick<TaskDetailsPayload, 'taskId' | 'status'>): string | null {
    if (String(task.status || '').toUpperCase() !== 'NEW') {
      return this.formatTaskDeletionBlockReason([task]);
    }

    const pending = [...this.getSubtaskChildren(task.taskId)];
    const visited = new Set<number>([task.taskId]);
    const blockedDescendants: TaskChild[] = [];
    while (pending.length > 0) {
      const descendant = pending.pop();
      if (!descendant || visited.has(descendant.taskId)) continue;
      visited.add(descendant.taskId);
      if (String(descendant.status || '').toUpperCase() !== 'NEW') {
        blockedDescendants.push(descendant);
      }
      pending.push(...this.getSubtaskChildren(descendant.taskId));
    }

    return blockedDescendants.length ? this.formatTaskDeletionBlockReason(blockedDescendants) : null;
  }

  private formatTaskDeletionBlockReason(tasks: Array<Pick<TaskChild, 'taskId' | 'status'>>): string {
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

  public getTaskDeletionTooltip(task: TaskDetailsPayload): string {
    if (this.isDeletingTask()) return 'Deleting task...';
    return this.getTaskDeletionBlockReason(task) ?? 'Delete task';
  }

  public getSubtaskDeletionTooltip(task: TaskChild): string {
    if (this.deletingSubtaskIds.has(task.taskId)) return 'Deleting task...';
    return this.getTaskDeletionBlockReason(task) ?? 'Delete subtask';
  }

  private getTaskAndDescendantIds(taskId: number): Set<number> {
    const taskIds = new Set<number>([taskId]);
    const pending = [taskId];
    while (pending.length > 0) {
      const parentId = pending.pop();
      if (parentId === undefined) continue;
      for (const child of this.getSubtaskChildren(parentId)) {
        if (taskIds.has(child.taskId)) continue;
        taskIds.add(child.taskId);
        pending.push(child.taskId);
      }
    }
    return taskIds;
  }

  public getSubtaskNumber(taskId: number): number {
    const target = this.task()?.descendants.find((child) => child.taskId === taskId);
    if (!target) return 0;
    return this.getSubtaskChildren(target.parentTaskId ?? 0)
      .findIndex((child) => child.taskId === taskId) + 1;
  }

  public getSubtaskDescendantCount(parentTaskId: number): number {
    const visited = new Set<number>([parentTaskId]);
    const countChildren = (taskId: number): number => {
      let total = 0;
      for (const child of this.getSubtaskChildren(taskId)) {
        if (visited.has(child.taskId)) continue;
        visited.add(child.taskId);
        total += 1 + countChildren(child.taskId);
      }
      return total;
    };
    return countChildren(parentTaskId);
  }

  public getFilteredSubtaskAssignees(taskId: number, ownerUserId: number | null): TaskAssignee[] {
    const search = (this.subtaskAssigneeSearchText[taskId] || '').trim().toLowerCase();
    return (this.task()?.taskAssignees ?? [])
      .filter((assignee) =>
        !search ||
        assignee.name.toLowerCase().includes(search) ||
        assignee.email.toLowerCase().includes(search)
      )
      .sort((left, right) =>
        Number(ownerUserId !== null && Number(right.userId) === Number(ownerUserId)) -
          Number(ownerUserId !== null && Number(left.userId) === Number(ownerUserId)) ||
        Number(right.isWinner) - Number(left.isWinner) ||
        left.name.localeCompare(right.name)
      );
  }

  public getSubtaskOwnerDesignation(taskId: number): TaskAssignee | null {
    const child = this.task()?.descendants.find((entry) => entry.taskId === taskId);
    if (!child) return null;
    const ownerUserId = this.editingSubtaskAssigneeIds.has(taskId) &&
      Object.prototype.hasOwnProperty.call(this.pendingSubtaskOwnerIds, taskId)
      ? this.pendingSubtaskOwnerIds[taskId]
      : child.ownerUserId;
    if (ownerUserId === null || ownerUserId === undefined) return null;
    return this.task()?.taskAssignees.find((assignee) => Number(assignee.userId) === Number(ownerUserId)) ?? null;
  }

  public isCurrentSubtaskAssignee(taskId: number, userId: number): boolean {
    const child = this.task()?.descendants.find((entry) => entry.taskId === taskId);
    return child?.ownerUserId !== null &&
      child?.ownerUserId !== undefined &&
      Number(child.ownerUserId) === Number(userId);
  }

  public isSubtaskAssigneeUnassigned(taskId: number, ownerUserId: number | null): boolean {
    return this.editingSubtaskAssigneeIds.has(taskId) &&
      Object.prototype.hasOwnProperty.call(this.pendingSubtaskOwnerIds, taskId)
      ? this.pendingSubtaskOwnerIds[taskId] === null
      : ownerUserId === null;
  }

  public readonly displaySubtaskAssigneeName = (value: string | number | null): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    const assignee = this.task()?.taskAssignees.find((member) => Number(member.userId) === Number(value));
    return assignee?.name || String(value);
  };

  public getSubtaskAssigneeDisplay(taskId: number, ownerName: string | null): string {
    return Object.prototype.hasOwnProperty.call(this.subtaskAssigneeSearchText, taskId)
      ? this.subtaskAssigneeSearchText[taskId]
      : ownerName || '';
  }

  public isEditingSubtaskAssignee(taskId: number): boolean {
    return this.editingSubtaskAssigneeIds.has(taskId);
  }

  public isEditingSubtaskName(taskId: number): boolean {
    return this.editingSubtaskNameIds.has(taskId);
  }

  public isEditingSubtaskRow(taskId: number): boolean {
    return this.isEditingSubtaskName(taskId) ||
      this.isEditingSubtaskAssignee(taskId) ||
      this.editingSubtaskBudgetIds.has(taskId);
  }

  public isSubtaskAssigneeSearchCleared(taskId: number): boolean {
    return this.clearedSubtaskAssigneeSearchIds().has(taskId);
  }

  public hasSubtaskAssigneeSearch(taskId: number): boolean {
    return (this.subtaskAssigneeSearchText[taskId] || '').length > 0;
  }

  public getInitials(name: string | null | undefined): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    return parts.length > 1
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : (parts[0] || '').slice(0, 2).toUpperCase();
  }

  public editSubtaskRow(child: TaskDetailsPayload['descendants'][number]): void {
    if (this.isEditingSubtaskRow(child.taskId)) return;
    if (child.canManage) {
      this.subtaskBudgetEditAmounts[child.taskId] = child.budgetAmount;
      this.subtaskBudgetEditStatuses[child.taskId] = this.statusValue(child.status) as TaskStatus;
      this.editingSubtaskBudgetIds.add(child.taskId);
      return;
    }
    if (child.canEditTask) this.editSubtaskName(child);
    if (child.canEditTask) {
      this.subtaskBudgetEditAmounts[child.taskId] = child.budgetAmount;
      this.editingSubtaskBudgetIds.add(child.taskId);
    }
    if (child.canAssignOwner && child.status?.toUpperCase() !== 'COMPLETED') {
      this.editSubtaskAssignee(child.taskId, child.ownerName);
    }
  }

  public cancelEditSubtaskRow(child: TaskDetailsPayload['descendants'][number]): void {
    if (
      this.savingSubtaskNameIds.has(child.taskId) ||
      this.assigningSubtaskIds.has(child.taskId) ||
      this.savingSubtaskBudgetIds.has(child.taskId)
    ) return;
    this.cancelEditSubtaskName(child);
    this.cancelEditSubtaskAssignee(child.taskId, child.ownerName);
    this.editingSubtaskBudgetIds.delete(child.taskId);
    delete this.subtaskBudgetEditAmounts[child.taskId];
    delete this.subtaskBudgetEditStatuses[child.taskId];
  }

  public editSubtaskName(child: TaskDetailsPayload['descendants'][number]): void {
    if (!child.canEditTask || this.savingSubtaskNameIds.has(child.taskId)) return;
    this.subtaskNameEditText[child.taskId] = child.taskName;
    this.editingSubtaskNameIds.add(child.taskId);
    setTimeout(() => document.getElementById(`subtask-name-${child.taskId}`)?.focus());
  }

  public cancelEditSubtaskName(child: TaskDetailsPayload['descendants'][number]): void {
    this.editingSubtaskNameIds.delete(child.taskId);
    this.subtaskNameEditText[child.taskId] = child.taskName;
  }

  public canSaveSubtaskEdits(child: TaskDetailsPayload['descendants'][number]): boolean {
    const taskName = String(this.subtaskNameEditText[child.taskId] ?? '').trim();
    const hasNameChange = this.editingSubtaskNameIds.has(child.taskId) && taskName !== child.taskName;
    const hasOwnerChange = this.hasPendingSubtaskOwnerChange(child);
    const budgetAmount = String(this.subtaskBudgetEditAmounts[child.taskId] ?? '').trim();
    const isEditingBudget = this.editingSubtaskBudgetIds.has(child.taskId);
    const hasBudgetChange = isEditingBudget &&
      Number(budgetAmount).toFixed(2) !== Number(child.budgetAmount).toFixed(2);
    const hasStatusChange = child.canManage &&
      this.subtaskBudgetEditStatuses[child.taskId] !== this.statusValue(child.status);
    return (hasNameChange || hasOwnerChange || hasBudgetChange || hasStatusChange) &&
      !(hasNameChange && !taskName) &&
      (!isEditingBudget || isValidTaskBudgetAmount(budgetAmount)) &&
      !this.savingSubtaskNameIds.has(child.taskId) &&
      !this.assigningSubtaskIds.has(child.taskId) &&
      !this.savingSubtaskBudgetIds.has(child.taskId);
  }

  public hasPendingSubtaskOwnerChange(child: TaskDetailsPayload['descendants'][number]): boolean {
    return Object.prototype.hasOwnProperty.call(this.pendingSubtaskOwnerIds, child.taskId) &&
      this.pendingSubtaskOwnerIds[child.taskId] !== child.ownerUserId;
  }

  public saveSubtaskEdits(child: TaskDetailsPayload['descendants'][number]): void {
    if (!this.canSaveSubtaskEdits(child)) return;
    const taskName = String(this.subtaskNameEditText[child.taskId] ?? '').trim();
    const hasNameChange = this.editingSubtaskNameIds.has(child.taskId) && taskName !== child.taskName;
    const hasOwnerChange = this.hasPendingSubtaskOwnerChange(child);
    const budgetAmount = String(this.subtaskBudgetEditAmounts[child.taskId] ?? '').trim();
    const hasBudgetChange = this.editingSubtaskBudgetIds.has(child.taskId) &&
      Number(budgetAmount).toFixed(2) !== Number(child.budgetAmount).toFixed(2);
    const hasStatusChange = child.canManage &&
      this.subtaskBudgetEditStatuses[child.taskId] !== this.statusValue(child.status);
    if (hasNameChange && !taskName) {
      this.notifier.error('Task title cannot be empty.');
      return;
    }

    if (!hasOwnerChange) {
      this.cancelEditSubtaskAssignee(child.taskId, child.ownerName);
    }

    if (hasNameChange) {
      this.savingSubtaskNameIds.add(child.taskId);
      this.eventTasksService.updateEventTaskName(child.taskId, taskName).subscribe({
        next: (updated) => {
          this.savingSubtaskNameIds.delete(child.taskId);
          this.editingSubtaskNameIds.delete(child.taskId);
          this.subtaskNameEditText[child.taskId] = updated.taskName;
          this.updateSubtaskName(child.taskId, updated.taskName);
          this.hierarchyTreeService.notifyTaskNameUpdated(child.taskId, updated.taskName);
          this.notifier.success('Task title updated.');
        },
        error: (error) => {
          this.savingSubtaskNameIds.delete(child.taskId);
          this.notifier.error(
            error?.error?.errors?.[0]?.message ||
            error?.error?.message ||
            error?.message ||
            'Failed to update task title.'
          );
        }
      });
    } else {
      this.editingSubtaskNameIds.delete(child.taskId);
      this.subtaskNameEditText[child.taskId] = child.taskName;
    }

    if (hasOwnerChange) {
      this.saveSubtaskAssignee(child);
    }

    if (hasBudgetChange || hasStatusChange) {
      this.savingSubtaskBudgetIds.add(child.taskId);
      this.service.updateTaskBudget(
        child.taskId,
        budgetAmount,
        hasStatusChange ? this.subtaskBudgetEditStatuses[child.taskId] : undefined
      ).subscribe({
        next: (updatedTask) => {
          this.savingSubtaskBudgetIds.delete(child.taskId);
          this.editingSubtaskBudgetIds.delete(child.taskId);
          delete this.subtaskBudgetEditAmounts[child.taskId];
          delete this.subtaskBudgetEditStatuses[child.taskId];
          this.updateSubtaskBudget(child.taskId, {
            budgetAmount: updatedTask.budgetAmount,
            status: updatedTask.status,
            budgetRequestId: updatedTask.requestId,
            requestedBudgetAmount: updatedTask.requestedBudgetAmount,
            budgetRequestStatus: updatedTask.requestStatus,
            budgetRequestedByName: updatedTask.requestStatus === 'PENDING' ? 'You' : null,
            canReviewBudgetRequest: false
          });
          this.hierarchyTreeService.triggerHierarchyTreeRefresh();
          this.notifier.success(updatedTask.requestStatus === 'PENDING'
            ? 'Budget increase request sent for approval.'
            : hasStatusChange
              ? 'Subtask budget and status updated.'
              : 'Subtask budget updated.');
        },
        error: (error) => {
          this.savingSubtaskBudgetIds.delete(child.taskId);
          this.notifier.error(
            error?.error?.errors?.[0]?.message ||
            error?.error?.message ||
            error?.message ||
            'Failed to update subtask budget.'
          );
        }
      });
    } else {
      this.editingSubtaskBudgetIds.delete(child.taskId);
      delete this.subtaskBudgetEditAmounts[child.taskId];
      delete this.subtaskBudgetEditStatuses[child.taskId];
    }
  }

  public getRoleColorClass(role?: string | null): string {
    switch ((role || '').toUpperCase()) {
      case 'COMMITTEE_MASTER_ADMIN': return 'role-master';
      case 'COMMITTEE_ADMIN': return 'role-admin';
      case 'COMMITTEE_MEMBER': return 'role-member';
      default: return 'role-default';
    }
  }

  public editSubtaskAssignee(taskId: number, ownerName: string | null): void {
    const child = this.task()?.descendants.find((entry) => entry.taskId === taskId);
    if (!child?.canAssignOwner || child.status?.toUpperCase() === 'COMPLETED' || this.assigningSubtaskIds.has(taskId)) return;
    this.subtaskAssigneeSearchText[taskId] = ownerName || '';
    this.clearedSubtaskAssigneeSearchIds.update((ids) => {
      const next = new Set(ids);
      next.delete(taskId);
      return next;
    });
    this.pendingSubtaskOwnerIds[taskId] = child.ownerUserId;
    this.editingSubtaskAssigneeIds.add(taskId);
  }

  public cancelEditSubtaskAssignee(taskId: number, ownerName: string | null): void {
    this.editingSubtaskAssigneeIds.delete(taskId);
    delete this.pendingSubtaskOwnerIds[taskId];
    this.subtaskAssigneeSearchText[taskId] = ownerName || '';
    this.clearedSubtaskAssigneeSearchIds.update((ids) => {
      const next = new Set(ids);
      next.delete(taskId);
      return next;
    });
  }

  public onSubtaskAssigneeFocus(taskId: number, trigger: MatAutocompleteTrigger): void {
    this.subtaskAssigneeSearchText[taskId] = '';
    this.clearedSubtaskAssigneeSearchIds.update((ids) => new Set(ids).add(taskId));
    trigger.openPanel();
  }

  public onSubtaskAssigneeSearch(taskId: number, value: string): void {
    this.subtaskAssigneeSearchText[taskId] = value;
  }

  public onSubtaskAssigneeAutocompleteClosed(taskId: number, ownerName: string | null): void {
    if (this.assigningSubtaskIds.has(taskId)) return;
    if (Object.prototype.hasOwnProperty.call(this.pendingSubtaskOwnerIds, taskId)) {
      const pendingOwnerId = this.pendingSubtaskOwnerIds[taskId];
      const pendingOwner = this.task()?.taskAssignees.find((member) => member.userId === pendingOwnerId);
      this.subtaskAssigneeSearchText[taskId] = pendingOwner?.name || '';
    } else {
      this.subtaskAssigneeSearchText[taskId] = ownerName || '';
    }
    this.clearedSubtaskAssigneeSearchIds.update((ids) => {
      const next = new Set(ids);
      next.delete(taskId);
      return next;
    });
  }

  public clearSubtaskAssigneeSearch(
    taskId: number,
    trigger: MatAutocompleteTrigger,
    event: MouseEvent
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.subtaskAssigneeSearchText[taskId] = '';
    this.clearedSubtaskAssigneeSearchIds.update((ids) => new Set(ids).add(taskId));
    trigger.openPanel();
  }

  public onSubtaskAssigneeChange(
    taskId: number,
    ownerName: string | null,
    event: MatAutocompleteSelectedEvent
  ): void {
    const child = this.task()?.descendants.find((entry) => entry.taskId === taskId);
    if (!child?.canAssignOwner || this.assigningSubtaskIds.has(taskId)) return;
    const ownerUserId = event.option.value === '' ? null : Number(event.option.value);
    if (
      event.option.disabled ||
      ownerUserId === child.ownerUserId ||
      (ownerUserId !== null && this.isCurrentSubtaskAssignee(taskId, ownerUserId))
    ) {
      this.pendingSubtaskOwnerIds[taskId] = child.ownerUserId;
      this.subtaskAssigneeSearchText[taskId] = ownerName || '';
      this.clearedSubtaskAssigneeSearchIds.update((ids) => {
        const next = new Set(ids);
        next.delete(taskId);
        return next;
      });
      return;
    }
    const assignee = this.task()?.taskAssignees.find((member) => member.userId === ownerUserId);
    if (ownerUserId !== null && !assignee) {
      this.notifier.error('Selected assignee is not a member of this committee.');
      return;
    }

    this.pendingSubtaskOwnerIds[taskId] = ownerUserId;
    this.subtaskAssigneeSearchText[taskId] = assignee?.name || '';
    this.clearedSubtaskAssigneeSearchIds.update((ids) => {
      const next = new Set(ids);
      next.delete(taskId);
      return next;
    });
  }

  private saveSubtaskAssignee(child: TaskDetailsPayload['descendants'][number]): void {
    const taskId = child.taskId;
    const ownerUserId = this.pendingSubtaskOwnerIds[taskId];
    this.assigningSubtaskIds.add(taskId);
    this.eventTasksService.assignEventTask(taskId, ownerUserId).subscribe({
      next: (updated) => {
        this.assigningSubtaskIds.delete(taskId);
        this.editingSubtaskAssigneeIds.delete(taskId);
        delete this.pendingSubtaskOwnerIds[taskId];
        this.subtaskAssigneeSearchText[taskId] = updated.ownerName || '';
        this.clearedSubtaskAssigneeSearchIds.update((ids) => {
          const next = new Set(ids);
          next.delete(taskId);
          return next;
        });
        this.updateSubtaskEntry(updated);
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
        this.notifier.success(
          ownerUserId === null
            ? `Task "${updated.taskName}" is unassigned.`
            : `Task "${updated.taskName}" assigned to ${updated.ownerName}.`
        );
      },
      error: (error) => {
        this.assigningSubtaskIds.delete(taskId);
        this.notifier.error(
          error?.error?.errors?.[0]?.message ||
          error?.error?.message ||
          error?.message ||
          'Failed to assign task.'
        );
      }
    });
  }

  private updateSubtaskEntry(updated: {
    taskId: number;
    status: string | null;
    ownerUserId: number | null;
    ownerName: string | null;
    assignedByName: string | null;
    createdByName: string | null;
    createdAt: string;
    ownerAssignedAt: string | null;
    canManage: boolean;
    canEditTask: boolean;
    canAssignOwner: boolean;
    canDelete: boolean;
  }): void {
    this.task.update((current) => {
      if (!current) return current;
      const updateEntry = (child: TaskDetailsPayload['descendants'][number]) =>
        child.taskId === updated.taskId
          ? {
              ...child,
              status: updated.status,
              ownerUserId: updated.ownerUserId,
              ownerName: updated.ownerName,
              assignedByName: updated.assignedByName,
              createdByName: updated.createdByName,
              createdAt: updated.createdAt,
              ownerAssignedAt: updated.ownerAssignedAt,
              canManage: updated.canManage,
              canEditTask: updated.canEditTask,
              canAssignOwner: updated.canAssignOwner,
              canDelete: updated.canDelete
            }
          : child;
      return {
        ...current,
        children: current.children.map(updateEntry),
        descendants: current.descendants.map(updateEntry)
      };
    });
  }

  private updateSubtaskName(taskId: number, taskName: string): void {
    this.task.update((current) => {
      if (!current) return current;
      const updateEntry = (child: TaskDetailsPayload['descendants'][number]) =>
        child.taskId === taskId ? { ...child, taskName } : child;
      return {
        ...current,
        children: current.children.map(updateEntry),
        descendants: current.descendants.map(updateEntry)
      };
    });
  }

  private updateSubtaskBudget(
    taskId: number,
    budget: Partial<TaskDetailsPayload['descendants'][number]>
  ): void {
    this.task.update((current) => {
      if (!current) return current;
      const updateEntry = (child: TaskDetailsPayload['descendants'][number]) =>
        child.taskId === taskId ? { ...child, ...budget } : child;
      return {
        ...current,
        children: current.children.map(updateEntry),
        descendants: current.descendants.map(updateEntry)
      };
    });
  }

  public statusValue(status: string | null): string {
    return String(status || 'NEW').trim().toUpperCase();
  }

  private loadTask(taskId: string): void {
    const requestId = ++this.requestId;
    this.isLoading.set(true);
    this.task.set(null);
    this.pendingSubtaskOwnerIds = {};
    this.subtaskAssigneeSearchText = {};
    this.subtaskNameEditText = {};
    this.editingSubtaskAssigneeIds.clear();
    this.editingSubtaskNameIds.clear();
    this.clearedSubtaskAssigneeSearchIds.set(new Set<number>());
    this.loadingState.begin();

    this.service.getTaskDetails(taskId).pipe(
      finalize(() => {
        this.loadingState.end();
        if (requestId === this.requestId) this.isLoading.set(false);
      })
    ).subscribe({
      next: (details) => {
        if (requestId === this.requestId) this.task.set(details);
      },
      error: (error) => {
        if (requestId !== this.requestId) return;
        this.task.set(null);
        this.notifier.error(error?.error?.errors?.[0]?.message || error?.message || 'Failed to load task details.');
      }
    });
  }
}
