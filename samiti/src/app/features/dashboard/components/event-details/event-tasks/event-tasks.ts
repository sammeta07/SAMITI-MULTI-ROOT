import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { EventTasksService } from './event-tasks.service';
import { EventTaskEntry, EventTasksPayload, TaskAssignee, TaskStatus } from './event-tasks.models';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { DashboardHierarchyTreeService } from '../../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';

@Component({
  selector: 'app-event-tasks',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule
  ],
  templateUrl: './event-tasks.html',
  styleUrl: './event-tasks.scss'
})
export class EventTasksComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(EventTasksService);
  private readonly notifier = inject(NotifierService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private parentParamsSub?: Subscription;
  private currentEventId: number | null = null;
  private taskLoadRequestId = 0;

  public eventData: EventTaskEntry[] | null = null;
  public canCreateTasks = false;
  public taskAssignees: TaskAssignee[] = [];
  public readonly taskStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;
  public isCreatingTask = false;
  public isSavingTask = false;
  public newTaskName = '';
  public newTaskStatus: TaskStatus = this.taskStatuses[0];
  public newTaskOwnerUserId: number | null = null;
  public newTaskCreatedAt = new Date();
  public isLoading = true;
  public hasLoadError = false;

  public get tasks(): EventTaskEntry[] {
    return this.eventData ?? [];
  }

  public get flattenedTasks(): Array<{ task: EventTaskEntry; depth: number }> {
    const byParent = new Map<number | null, EventTaskEntry[]>();
    const taskIds = new Set(this.tasks.map((task) => task.taskId));
    for (const task of this.tasks) {
      const parentId = task.parentTaskId && taskIds.has(task.parentTaskId)
        ? task.parentTaskId
        : null;
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

  public statusTagClass(status: string | null | undefined): string {
    const normalized = String(status || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return normalized ? `tag-${normalized}` : 'tag-none';
  }

  public onCreateTask(): void {
    if (!this.canCreateTasks || !this.currentEventId || this.isCreatingTask || this.isSavingTask) {
      return;
    }

    this.newTaskName = '';
    this.newTaskStatus = this.taskStatuses[0];
    this.newTaskOwnerUserId = null;
    this.newTaskCreatedAt = new Date();
    this.isCreatingTask = true;
  }

  public onCancelTask(): void {
    if (this.isSavingTask) {
      return;
    }
    this.isCreatingTask = false;
  }

  public onTaskAssigneeChange(value: string): void {
    this.newTaskOwnerUserId = value ? Number(value) : null;
  }

  public onSaveTask(): void {
    const taskName = this.newTaskName.trim();
    if (!taskName || taskName.length > 255 || this.isSavingTask || !this.currentEventId) {
      return;
    }

    const eventId = this.currentEventId;
    this.isSavingTask = true;
    this.tasksService.createEventTask({
      eventId,
      taskName,
      status: this.newTaskStatus,
      ownerUserId: this.newTaskOwnerUserId
    }).subscribe({
      next: (task) => {
        if (this.currentEventId === eventId) {
          this.eventData = [...this.tasks, task];
          this.isCreatingTask = false;
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

  ngOnInit(): void {
    const parentParams$ = this.route.parent?.params;
    if (!parentParams$) return;

    this.parentParamsSub = parentParams$.subscribe(params => {
      const eventId = params['id'];
      if (eventId) {
        this.currentEventId = Number(eventId);
        this.loadEventTasks(eventId);
      }
    });
  }

  private loadEventTasks(eventId: string): void {
    const requestId = ++this.taskLoadRequestId;
    this.isLoading = true;
    this.hasLoadError = false;
    this.tasksService.getEventTasks(eventId).subscribe({
      next: (data: EventTasksPayload) => {
        if (requestId !== this.taskLoadRequestId) {
          return;
        }
        this.eventData = data.entries ?? [];
        this.canCreateTasks = data.canCreateTasks;
        this.taskAssignees = data.taskAssignees ?? [];
        this.isLoading = false;
      },
      error: (error) => {
        if (requestId !== this.taskLoadRequestId) {
          return;
        }
        this.eventData = [];
        this.canCreateTasks = false;
        this.taskAssignees = [];
        this.isLoading = false;
        this.hasLoadError = true;
        this.notifier.error(error?.error?.errors?.[0]?.message || 'Failed to load event tasks.');
      }
    });
  }

  ngOnDestroy(): void {
    this.parentParamsSub?.unsubscribe();
  }
}
