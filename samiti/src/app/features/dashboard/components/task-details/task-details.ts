import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
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
import { TASK_STATUSES, TaskAssignee, TaskStatus } from '../event-details/event-tasks/event-tasks.models';
import { EventTasksService } from '../event-details/event-tasks/event-tasks.service';
import { EventDetailsStateService } from '../event-details/event-details-state.service';
import { TaskDetailsPayload } from './task-details.models';
import { TaskDetailsService } from './task-details.service';

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
    TodoChecklistComponent
  ],
  templateUrl: './task-details.html',
  styleUrl: './task-details.scss'
})
export class TaskDetailsComponent implements OnInit {
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
  public readonly isUpdatingStatus = signal(false);
  public readonly isStatusDropdownOpen = signal(false);
  public readonly isEditingTask = signal(false);
  public readonly isSavingTaskName = signal(false);
  public readonly isDeletingTask = signal(false);
  public selectedTaskTabIndex = 0;
  public isCreatingSubtask = false;
  public isSavingSubtask = false;
  public newSubtaskName = '';
  public editingTaskName = '';
  public readonly assigningSubtaskIds = new Set<number>();
  public readonly editingSubtaskAssigneeIds = new Set<number>();
  public readonly updatingSubtaskStatusIds = new Set<number>();
  public readonly clearedSubtaskAssigneeSearchIds = signal<Set<number>>(new Set<number>());
  public subtaskAssigneeSearchText: Record<number, string> = {};

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

  public onCreateSubtask(task: TaskDetailsPayload): void {
    if (!task.canCreateTasks || this.isCreatingSubtask || this.isSavingSubtask) return;
    this.newSubtaskName = '';
    this.isCreatingSubtask = true;
  }

  public onCancelSubtask(): void {
    if (this.isSavingSubtask) return;
    this.isCreatingSubtask = false;
    this.newSubtaskName = '';
  }

  public async onSaveSubtask(task: TaskDetailsPayload): Promise<void> {
    const taskName = this.newSubtaskName.trim();
    if (!task.canCreateTasks || !taskName || taskName.length > 255 || this.isSavingSubtask) return;

    this.isSavingSubtask = true;
    try {
      const child = await firstValueFrom(this.eventTasksService.createEventTask({
        eventId: task.eventId,
        parentTaskId: task.taskId,
        taskName
      }));
      this.task.update((current) =>
        current?.taskId === task.taskId
          ? {
              ...current,
              children: [...current.children, {
                taskId: child.taskId,
                parentTaskId: task.taskId,
                taskName: child.taskName,
                status: child.status,
                ownerUserId: child.ownerUserId,
                ownerName: child.ownerName,
                assignedByName: child.assignedByName,
                createdByName: child.createdByName,
                createdAt: child.createdAt,
                ownerAssignedAt: child.ownerAssignedAt,
                canManage: child.canManage,
                canAssignOwner: child.canAssignOwner,
                canDelete: child.canDelete
              }],
              descendants: [...(current.descendants ?? []), {
                taskId: child.taskId,
                parentTaskId: task.taskId,
                taskName: child.taskName,
                status: child.status,
                ownerUserId: child.ownerUserId,
                ownerName: child.ownerName,
                assignedByName: child.assignedByName,
                createdByName: child.createdByName,
                createdAt: child.createdAt,
                ownerAssignedAt: child.ownerAssignedAt,
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
  }

  public cancelTaskEditing(): void {
    this.isEditingTask.set(false);
    this.editingTaskName = '';
  }

  public async saveTaskName(task: TaskDetailsPayload): Promise<void> {
    const taskName = this.editingTaskName.trim();
    if (!task.canEditTask || !taskName || taskName.length > 255 || this.isSavingTaskName()) return;

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

  public async onDeleteTask(task: TaskDetailsPayload): Promise<void> {
    if (!task.canDeleteTask || this.isDeletingTask()) return;

    const dialogData: ConfirmDialogData = {
      title: 'Delete Task',
      message: `Are you sure you want to delete "${task.taskName}"? Tasks with subtasks must have those subtasks removed first.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };
    const result = await firstValueFrom(this.confirmDialog.open(dialogData).afterClosed());
    if (!result?.confirmed) return;

    this.isDeletingTask.set(true);
    try {
      await firstValueFrom(this.service.deleteTask(task.taskId));
      this.notifier.success(`Task "${task.taskName}" deleted successfully.`);
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

  public getFilteredSubtaskAssignees(taskId: number): TaskAssignee[] {
    const search = (this.subtaskAssigneeSearchText[taskId] || '').trim().toLowerCase();
    return (this.task()?.taskAssignees ?? [])
      .filter((assignee) =>
        !search ||
        assignee.name.toLowerCase().includes(search) ||
        assignee.email.toLowerCase().includes(search)
      )
      .sort((left, right) =>
        Number(right.isWinner) - Number(left.isWinner) || left.name.localeCompare(right.name)
      );
  }

  public getSubtaskOwnerDesignation(taskId: number): TaskAssignee | null {
    const child = this.task()?.descendants.find((entry) => entry.taskId === taskId);
    if (!child?.ownerUserId) return null;
    return this.task()?.taskAssignees.find((assignee) => assignee.userId === child.ownerUserId) ?? null;
  }

  public getSubtaskAssigneeDisplay(taskId: number, ownerName: string | null): string {
    return Object.prototype.hasOwnProperty.call(this.subtaskAssigneeSearchText, taskId)
      ? this.subtaskAssigneeSearchText[taskId]
      : ownerName || '';
  }

  public isEditingSubtaskAssignee(taskId: number): boolean {
    return this.editingSubtaskAssigneeIds.has(taskId);
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
    if (!child?.canAssignOwner || this.assigningSubtaskIds.has(taskId)) return;
    this.subtaskAssigneeSearchText[taskId] = ownerName || '';
    this.clearedSubtaskAssigneeSearchIds.update((ids) => {
      const next = new Set(ids);
      next.delete(taskId);
      return next;
    });
    this.editingSubtaskAssigneeIds.add(taskId);
  }

  public cancelEditSubtaskAssignee(taskId: number, ownerName: string | null): void {
    this.editingSubtaskAssigneeIds.delete(taskId);
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
    const assignee = this.task()?.taskAssignees.find((member) => member.userId === ownerUserId);
    if (ownerUserId !== null && !assignee) {
      this.notifier.error('Selected assignee is not a member of this committee.');
      return;
    }

    this.assigningSubtaskIds.add(taskId);
    this.eventTasksService.assignEventTask(taskId, ownerUserId).subscribe({
      next: (updated) => {
        this.assigningSubtaskIds.delete(taskId);
        this.editingSubtaskAssigneeIds.delete(taskId);
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
        this.editingSubtaskAssigneeIds.delete(taskId);
        this.subtaskAssigneeSearchText[taskId] = ownerName || '';
        this.notifier.error(
          error?.error?.errors?.[0]?.message ||
          error?.error?.message ||
          error?.message ||
          'Failed to assign task.'
        );
      }
    });
  }

  public canUpdateSubtaskStatus(taskId: number): boolean {
    const child = this.task()?.descendants.find((entry) => entry.taskId === taskId);
    return Boolean(child?.canManage);
  }

  public onSubtaskStatusChange(taskId: number, event: Event): void {
    const select = event.currentTarget;
    const currentTask = this.task();
    const child = currentTask?.descendants.find((entry) => entry.taskId === taskId);
    if (!(select instanceof HTMLSelectElement) || !currentTask || !child) return;

    const status = this.taskStatuses.find((candidate) => candidate === select.value);
    if (!status || !this.canUpdateSubtaskStatus(taskId) || this.updatingSubtaskStatusIds.has(taskId)) {
      select.value = child.status || 'NEW';
      return;
    }

    this.updatingSubtaskStatusIds.add(taskId);
    this.eventTasksService.updateEventTaskStatus(taskId, status).subscribe({
      next: (updated) => {
        this.updatingSubtaskStatusIds.delete(taskId);
        this.updateSubtaskEntry(updated);
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
        this.notifier.success(`Task "${updated.taskName}" status updated to ${this.displayStatus(updated.status)}.`);
      },
      error: (error) => {
        this.updatingSubtaskStatusIds.delete(taskId);
        select.value = child.status || 'NEW';
        this.notifier.error(
          error?.error?.errors?.[0]?.message ||
          error?.error?.message ||
          error?.message ||
          'Failed to update task status.'
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

  public statusValue(status: string | null): string {
    return String(status || 'NEW').trim().toUpperCase();
  }

  public canUpdateStatus(task: TaskDetailsPayload): boolean {
    return task.canManage;
  }

  public onStatusChange(event: Event, task: TaskDetailsPayload): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }

    const statusValue = select.value;
    const status = this.taskStatuses.find((candidate) => candidate === statusValue);
    if (!status || !this.canUpdateStatus(task) || this.isUpdatingStatus()) {
      select.value = this.statusValue(task.status);
      return;
    }

    this.isUpdatingStatus.set(true);
    this.service.updateTaskStatus(task.taskId, status).subscribe({
      next: (updatedTask) => {
        this.isUpdatingStatus.set(false);
        this.task.update((current) =>
          current?.taskId === updatedTask.taskId
            ? { ...current, status: updatedTask.status, updatedAt: updatedTask.updatedAt }
            : current
        );
        this.notifier.success(`Task status updated to ${this.displayStatus(updatedTask.status)}.`);
      },
      error: (error) => {
        this.isUpdatingStatus.set(false);
        select.value = this.statusValue(task.status);
        this.notifier.error(
          error?.error?.errors?.[0]?.message ||
          error?.error?.message ||
          error?.message ||
          'Failed to update task status.'
        );
      }
    });
  }

  private loadTask(taskId: string): void {
    const requestId = ++this.requestId;
    this.isLoading.set(true);
    this.task.set(null);
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
