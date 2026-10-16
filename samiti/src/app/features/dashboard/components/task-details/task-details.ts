import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { finalize } from 'rxjs';
import { LoadingStateService } from '../../../../shared/services/loading-state.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { TodoItem } from '../../models/todo.models';
import { TodoChecklistComponent } from '../todo-checklist/todo-checklist.component';
import { TaskDetailsPayload } from './task-details.models';
import { TaskDetailsService } from './task-details.service';

@Component({
  selector: 'app-task-details',
  standalone: true,
  imports: [
    CommonModule,
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
  private readonly service = inject(TaskDetailsService);
  private readonly notifier = inject(NotifierService);
  private readonly loadingState = inject(LoadingStateService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;

  public readonly isLoading = signal(true);
  public readonly task = signal<TaskDetailsPayload | null>(null);

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

  public statusClass(status: string | null): string {
    const normalized = String(status || 'PENDING').toUpperCase();
    if (normalized === 'COMPLETED') return 'completed';
    if (normalized === 'IN_PROGRESS' || normalized === 'ACTIVE' || normalized === 'ONGOING') return 'started';
    return 'upcoming';
  }

  public displayStatus(status: string | null): string {
    return String(status || 'PENDING').replace(/[_-]+/g, ' ').toUpperCase();
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
