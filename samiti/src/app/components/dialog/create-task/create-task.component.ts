import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbar } from '@angular/material/toolbar';
import { EventTasksService } from '../../../features/dashboard/components/event-details/event-tasks/event-tasks.service';
import { EventTaskEntry } from '../../../features/dashboard/components/event-details/event-tasks/event-tasks.models';
import { NotifierService } from '../../../shared/notifier/notifier.service';

export interface CreateTaskDialogData {
  eventId: number;
  parentTasks: EventTaskEntry[];
}

@Component({
  selector: 'app-create-task-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatToolbar
  ],
  templateUrl: './create-task.component.html',
  styleUrl: './create-task.component.scss'
})
export class CreateTaskDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<CreateTaskDialogComponent>);
  private readonly tasksService = inject(EventTasksService);
  private readonly notifier = inject(NotifierService);
  public readonly data = inject<CreateTaskDialogData>(MAT_DIALOG_DATA);

  public taskName = '';
  public parentTaskId: number | null = null;
  public readonly isSubmitting = signal(false);

  public get isFormValid(): boolean {
    return Boolean(this.taskName.trim()) && this.taskName.trim().length <= 255;
  }

  public onCancel(): void {
    this.dialogRef.close(false);
  }

  public onSubmit(): void {
    if (!this.isFormValid || this.isSubmitting()) {
      return;
    }

    if (!Number.isInteger(this.data.eventId) || this.data.eventId <= 0) {
      this.notifier.error('Event ID is missing. Please reopen the task dialog.');
      return;
    }

    this.isSubmitting.set(true);
    this.tasksService.createEventTask({
      eventId: this.data.eventId,
      taskName: this.taskName.trim(),
      parentTaskId: this.parentTaskId
    }).subscribe({
      next: (task) => {
        this.isSubmitting.set(false);
        this.dialogRef.close(task);
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.notifier.error(
          error?.error?.errors?.[0]?.message ||
          error?.error?.message ||
          'Failed to create task.'
        );
      }
    });
  }
}
