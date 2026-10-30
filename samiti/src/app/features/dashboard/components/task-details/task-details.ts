import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { firstValueFrom, finalize } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { LoadingStateService } from '../../../../shared/services/loading-state.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { TodoItem } from '../../models/todo.models';
import { TodoChecklistComponent } from '../todo-checklist/todo-checklist.component';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { TASK_STATUSES, TaskStatus } from '../event-details/event-tasks/event-tasks.models';
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
    TodoChecklistComponent
  ],
  templateUrl: './task-details.html',
  styleUrl: './task-details.scss'
})
export class TaskDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(TaskDetailsService);
  private readonly authService = inject(AuthService);
  private readonly notifier = inject(NotifierService);
  private readonly loadingState = inject(LoadingStateService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
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
  public editingTaskName = '';

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

  public startTaskEditing(task: TaskDetailsPayload): void {
    if (!task.canCreateTasks || this.isSavingTaskName() || this.isDeletingTask()) return;
    this.editingTaskName = task.taskName;
    this.isEditingTask.set(true);
  }

  public cancelTaskEditing(): void {
    this.isEditingTask.set(false);
    this.editingTaskName = '';
  }

  public async saveTaskName(task: TaskDetailsPayload): Promise<void> {
    const taskName = this.editingTaskName.trim();
    if (!task.canCreateTasks || !taskName || taskName.length > 255 || this.isSavingTaskName()) return;

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
    if (!task.canCreateTasks || this.isDeletingTask()) return;

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

  public statusValue(status: string | null): string {
    return String(status || 'NEW').trim().toUpperCase();
  }

  public canUpdateStatus(task: TaskDetailsPayload): boolean {
    return task.ownerUserId !== null && task.ownerUserId === this.authService.getStoredUserData()?.id;
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
