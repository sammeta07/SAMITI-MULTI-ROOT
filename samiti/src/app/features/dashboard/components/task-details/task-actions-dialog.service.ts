import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { TaskStatus } from '../event-details/event-tasks/event-tasks.models';
import { EventTasksService } from '../event-details/event-tasks/event-tasks.service';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { TaskActionsDialogComponent, TaskActionsDialogResult, TaskActionsDialogUpdate } from './task-actions-dialog.component';
import { TaskDetailsPayload } from './task-details.models';
import { TaskDetailsService } from './task-details.service';

@Injectable({ providedIn: 'root' })
export class TaskActionsDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly taskDetailsService = inject(TaskDetailsService);
  private readonly eventTasksService = inject(EventTasksService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly notifier = inject(NotifierService);

  public async open(
    taskId: number,
    onUpdated?: (task: TaskDetailsPayload) => void
  ): Promise<void> {
    try {
      const task = await firstValueFrom(this.taskDetailsService.getTaskDetails(String(taskId)));
      if (!this.canOpenTaskActions(task)) return;

      document.body.classList.add('dialog-open');
      const dialogRef = this.dialog.open(TaskActionsDialogComponent, {
        position: { right: '0', top: '0' },
        height: '100%',
        width: '50%',
        autoFocus: true,
        disableClose: true,
        hasBackdrop: true,
        panelClass: 'slide-in-dialog',
        data: {
          task,
          onAction: (result: TaskActionsDialogResult) => this.handleAction(task, result, onUpdated)
        }
      });

      dialogRef.afterClosed().subscribe(() => {
        document.body.classList.remove('dialog-open');
      });
    } catch (error) {
      this.notifier.error(error instanceof Error ? error.message : 'Failed to load task details.');
    }
  }

  private canOpenTaskActions(task: TaskDetailsPayload): boolean {
    return task.canEditTask || task.canAssignOwner || task.canManage;
  }

  private async handleAction(
    task: TaskDetailsPayload,
    result: TaskActionsDialogResult,
    onUpdated?: (task: TaskDetailsPayload) => void
  ): Promise<TaskActionsDialogUpdate | null> {
    try {
      switch (result.action) {
        case 'rename':
          if (!task.canEditTask) return null;
          await firstValueFrom(this.taskDetailsService.updateTaskName(task.taskId, result.taskName));
          this.notifier.success('Task updated successfully.');
          break;
        case 'assign-owner':
          if (!task.canAssignOwner || result.ownerUserId === task.ownerUserId) return null;
          await firstValueFrom(this.eventTasksService.assignEventTask(task.taskId, result.ownerUserId));
          this.notifier.success('Task owner updated successfully.');
          break;
        case 'update-status':
          if (
            !task.canUpdateStatus ||
            result.status === String(task.status || 'NEW').trim().toUpperCase().replace(/[\s-]+/g, '_')
          ) return null;
          await firstValueFrom(this.taskDetailsService.updateTaskStatus(task.taskId, result.status as TaskStatus));
          this.notifier.success('Task status updated successfully.');
          break;
      }

      const updatedTask = await firstValueFrom(this.taskDetailsService.getTaskDetails(String(task.taskId)));
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      onUpdated?.(updatedTask);
      return { task: updatedTask };
    } catch (error) {
      this.notifier.error(error instanceof Error ? error.message : 'Failed to update task.');
      return null;
    }
  }
}
