import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { EventTasksService } from './event-tasks.service';
import { EventTaskEntry, EventTasksPayload, TaskAssignee, TASK_STATUSES, TaskStatus } from './event-tasks.models';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { DashboardHierarchyTreeService } from '../../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { EventDetailsStateService } from '../event-details-state.service';
import { AuthService } from '../../../../../core/services/auth.service';

@Component({
  selector: 'app-event-tasks',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatExpansionModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule
  ],
  templateUrl: './event-tasks.html',
  styleUrl: './event-tasks.scss'
})
export class EventTasksComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly tasksService = inject(EventTasksService);
  private readonly notifier = inject(NotifierService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly eventDetailsState = inject(EventDetailsStateService);
  private readonly authService = inject(AuthService);
  private parentParamsSub?: Subscription;
  private currentEventId: number | null = null;
  private taskLoadRequestId = 0;

  public eventData: EventTaskEntry[] | null = null;
  public taskAssignees: TaskAssignee[] = [];
  public taskAssigneeSearchText: Record<number, string> = {};
  public canCreateTasks = false;
  public readonly assigningTaskIds = new Set<number>();
  public readonly editingTaskAssigneeIds = new Set<number>();
  public readonly updatingTaskStatusIds = new Set<number>();
  public readonly taskStatuses = TASK_STATUSES;
  public isCreatingTask = false;
  public isSavingTask = false;
  public newTaskName = '';
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
    if (normalized === 'assigned') return 'tag-legacy-assigned';
    return normalized ? `tag-${normalized}` : 'tag-none';
  }

  public statusLabel(status: string | null | undefined): string {
    return String(status || 'NEW').replace(/_/g, ' ');
  }

  public canUpdateTaskStatus(task: EventTaskEntry): boolean {
    return task.ownerUserId !== null && task.ownerUserId === this.authService.getStoredUserData()?.id;
  }

  public onTaskStatusChange(task: EventTaskEntry, event: Event): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }

    const status = this.taskStatuses.find((candidate) => candidate === select.value);
    if (!status || !this.canUpdateTaskStatus(task) || this.updatingTaskStatusIds.has(task.taskId)) {
      select.value = task.status || 'NEW';
      return;
    }

    this.updatingTaskStatusIds.add(task.taskId);
    this.tasksService.updateEventTaskStatus(task.taskId, status).subscribe({
      next: (updatedTask) => {
        this.updatingTaskStatusIds.delete(task.taskId);
        if (this.currentEventId !== task.eventId) {
          return;
        }
        this.eventData = this.tasks.map((entry) =>
          entry.taskId === updatedTask.taskId ? updatedTask : entry
        );
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
        this.notifier.success(`Task "${updatedTask.taskName}" status updated to ${this.statusLabel(updatedTask.status)}.`);
      },
      error: (error) => {
        this.updatingTaskStatusIds.delete(task.taskId);
        select.value = task.status || 'NEW';
        this.notifier.error(
          error?.error?.errors?.[0]?.message ||
          error?.error?.message ||
          error?.message ||
          'Failed to update task status.'
        );
      }
    });
  }

  public getFilteredTaskAssignees(taskId: number): TaskAssignee[] {
    const search = (this.taskAssigneeSearchText[taskId] || '').trim().toLowerCase();
    return this.taskAssignees
      .filter((assignee) =>
        !search ||
        assignee.name.toLowerCase().includes(search) ||
        assignee.email.toLowerCase().includes(search)
      )
      .sort((a, b) => Number(b.isWinner) - Number(a.isWinner) || a.name.localeCompare(b.name));
  }

  public getTaskAssigneeDisplay(task: EventTaskEntry): string {
    return Object.prototype.hasOwnProperty.call(this.taskAssigneeSearchText, task.taskId)
      ? this.taskAssigneeSearchText[task.taskId]
      : task.ownerName || 'Unassigned';
  }

  public getTaskOwnerDesignation(task: EventTaskEntry): Pick<TaskAssignee, 'committeeRole' | 'roleIcon' | 'roleColor' | 'photo'> | null {
    if (task.ownerUserId === null) {
      return null;
    }

    const owner = this.taskAssignees.find((assignee) => assignee.userId === task.ownerUserId);
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

  public editTaskAssignee(task: EventTaskEntry): void {
    if (!this.canCreateTasks || this.assigningTaskIds.has(task.taskId)) {
      return;
    }

    this.taskAssigneeSearchText[task.taskId] = task.ownerName || 'Unassigned';
    this.editingTaskAssigneeIds.add(task.taskId);
  }

  public cancelEditTaskAssignee(task: EventTaskEntry): void {
    this.editingTaskAssigneeIds.delete(task.taskId);
    this.taskAssigneeSearchText[task.taskId] = task.ownerName || 'Unassigned';
  }

  public onTaskAssigneeFocus(taskId: number, input: HTMLInputElement): void {
    this.taskAssigneeSearchText[taskId] = '';
    input.value = '';
  }

  public onTaskAssigneeSearch(taskId: number, value: string): void {
    this.taskAssigneeSearchText[taskId] = value;
  }

  public hasTaskAssigneeSearch(taskId: number): boolean {
    return (this.taskAssigneeSearchText[taskId] || '').length > 0;
  }

  public clearTaskAssigneeSearch(
    taskId: number,
    input: HTMLInputElement,
    trigger: MatAutocompleteTrigger,
    event: MouseEvent
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.taskAssigneeSearchText[taskId] = '';
    input.value = '';
    trigger.openPanel();
  }

  public onTaskAssigneeBlur(task: EventTaskEntry): void {
    if (!this.assigningTaskIds.has(task.taskId)) {
      this.taskAssigneeSearchText[task.taskId] = task.ownerName || 'Unassigned';
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

  public getInitials(name: string | null | undefined): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (parts[0] || '').slice(0, 2).toUpperCase();
  }

  public onTaskAssigneeChange(task: EventTaskEntry, event: MatAutocompleteSelectedEvent): void {
    if (!this.canCreateTasks || this.assigningTaskIds.has(task.taskId)) {
      return;
    }

    const ownerUserId = event.option.value === '' ? null : Number(event.option.value);
    if (ownerUserId !== null && !this.taskAssignees.some((assignee) => assignee.userId === ownerUserId)) {
      this.notifier.error('Selected assignee is not a member of this committee.');
      return;
    }
    const selectedAssignee = this.taskAssignees.find((assignee) => assignee.userId === ownerUserId);
    this.taskAssigneeSearchText[task.taskId] = selectedAssignee?.name || 'Unassigned';

    this.assigningTaskIds.add(task.taskId);
    this.tasksService.assignEventTask(task.taskId, ownerUserId).subscribe({
      next: (updatedTask) => {
        this.assigningTaskIds.delete(task.taskId);
        this.editingTaskAssigneeIds.delete(task.taskId);
        if (this.currentEventId === task.eventId) {
          this.eventData = this.tasks.map((entry) =>
            entry.taskId === updatedTask.taskId ? updatedTask : entry
          );
          this.taskAssigneeSearchText[task.taskId] = updatedTask.ownerName || 'Unassigned';
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
        this.editingTaskAssigneeIds.delete(task.taskId);
        if (this.currentEventId !== task.eventId) {
          return;
        }
        this.taskAssigneeSearchText[task.taskId] = task.ownerName || 'Unassigned';
        this.notifier.error(
          error?.error?.errors?.[0]?.message ||
          error?.error?.message ||
          'Failed to assign task.'
        );
      }
    });
  }

  public onCreateTask(): void {
    if (!this.canCreateTasks || !this.currentEventId || this.isCreatingTask || this.isSavingTask) {
      return;
    }

    this.newTaskName = '';
    this.isCreatingTask = true;
  }

  public onCancelTask(): void {
    if (this.isSavingTask) {
      return;
    }
    this.isCreatingTask = false;
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
      taskName
    }).subscribe({
      next: (task) => {
        if (this.currentEventId === eventId) {
          this.eventData = [...this.tasks, task];
          this.isCreatingTask = false;
          this.eventDetailsState.headerData.update((header) =>
            header ? { ...header, tasksCount: (header.tasksCount ?? 0) + 1 } : header
          );
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
    this.taskAssigneeSearchText = {};
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
        this.taskAssignees = [];
        this.canCreateTasks = false;
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
