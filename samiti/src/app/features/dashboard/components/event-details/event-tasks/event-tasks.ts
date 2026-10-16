import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Subscription } from 'rxjs';
import { EventTasksService } from './event-tasks.service';
import { EventTaskEntry, EventTasksPayload } from './event-tasks.models';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { CreateTaskDialogComponent } from '../../../../../components/dialog/create-task/create-task.component';
import { DashboardHierarchyTreeService } from '../../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { TodoAssignee, TodoItem } from '../../../models/todo.models';
import { TodoChecklistComponent } from '../../todo-checklist/todo-checklist.component';

@Component({
  selector: 'app-event-tasks',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    TodoChecklistComponent
  ],
  templateUrl: './event-tasks.html',
  styleUrl: './event-tasks.scss'
})
export class EventTasksComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(EventTasksService);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private parentParamsSub?: Subscription;
  private currentEventId: number | null = null;
  private taskLoadRequestId = 0;

  public eventData: EventTaskEntry[] | null = null;
  public canCreateTasks = false;
  public canManageTodos = false;
  public canToggleTodos = false;
  public todoAssignees: TodoAssignee[] = [];
  public isLoading = true;
  public hasLoadError = false;

  public get tasks(): EventTaskEntry[] {
    return this.eventData ?? [];
  }

  public get tasksCount(): number {
    return this.tasks.length;
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

  public onTaskTodosChange(taskId: number, todos: TodoItem[]): void {
    this.eventData = this.tasks.map((task) => task.taskId === taskId ? { ...task, todos } : task);
  }

  public statusTagClass(status: string | null | undefined): string {
    const normalized = String(status || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return normalized ? `tag-${normalized}` : 'tag-none';
  }

  public onCreateTask(): void {
    if (!this.canCreateTasks || !this.currentEventId) {
      return;
    }

    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateTaskDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog',
      data: {
        eventId: this.currentEventId,
        parentTasks: this.tasks
      }
    });
    dialogRef.afterClosed().subscribe((task) => {
      document.body.classList.remove('dialog-open');
      if (!task) {
        return;
      }
      this.loadEventTasks(String(this.currentEventId));
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.notifier.success(`Task "${task.taskName}" created.`);
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
        this.canManageTodos = data.canManageTodos;
        this.canToggleTodos = data.canToggleTodos;
        this.todoAssignees = data.todoAssignees ?? [];
        this.isLoading = false;
      },
      error: (error) => {
        if (requestId !== this.taskLoadRequestId) {
          return;
        }
        this.eventData = [];
        this.canCreateTasks = false;
        this.canManageTodos = false;
        this.canToggleTodos = false;
        this.todoAssignees = [];
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
