import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatToolbar } from '@angular/material/toolbar';
import { CreateEventService } from './create-event.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { TextFormatService } from '../../../shared/services/text-format-service.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-create-event-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatToolbar,
  ],
  templateUrl: './create-event.component.html',
  styleUrl: './create-event.component.scss'
})
export class CreateEventDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<CreateEventDialogComponent>);
  private readonly createEventService = inject(CreateEventService);
  private readonly notifier = inject(NotifierService);
  private readonly textFormatService = inject(TextFormatService);
  private readonly authService = inject(AuthService);

  public readonly injectedData = inject(MAT_DIALOG_DATA, { optional: true });

  // Form bindings
  public eventName: string = '';
  public eventDisplayName: string = '';
  public description: string = '';
  public status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' = 'UPCOMING';
  public type: string = 'puja';
  public readonly visibility: 'VISIBLE' | 'HIDDEN' = 'HIDDEN';
  public startDate: Date | null = null;
  public endDate: Date | null = null;

  public readonly isSubmitting = signal<boolean>(false);

  public readonly eventTypes = ['puja', 'sports', 'meeting', 'celebration', 'workshop', 'other'];
  public readonly statuses = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'];

  get isFormValid(): boolean {
    return (
      !!this.eventName?.trim() &&
      !!this.eventDisplayName?.trim() &&
      this.eventDisplayName.trim().length <= 20 &&
      !!this.status &&
      !!this.startDate
    );
  }

  public onCancel(): void {
    this.dialogRef.close(false);
  }

  public onSubmit(): void {
    if (!this.isFormValid) return;

    this.isSubmitting.set(true);

    const committeeId = this.injectedData?.committeeId;
    if (!committeeId) {
      this.notifier.error('Committee ID not provided');
      this.isSubmitting.set(false);
      return;
    }

    const startDateStr = this.startDate ? this.startDate.toISOString().split('T')[0] : null;
    const endDateStr = this.endDate ? this.endDate.toISOString().split('T')[0] : null;

    const payload = {
      committeeId: Number(committeeId),
      eventName: this.eventName.trim(),
      eventDisplayName: this.eventDisplayName.trim(),
      description: this.description?.trim() || undefined,
      status: this.status,
      type: this.type || undefined,
      visibility: this.visibility,
      startDate: startDateStr,
      endDate: endDateStr
    };

    this.createEventService.createEvent(payload).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        const rawUserName = this.authService.getStoredUserData()?.name || 'User';
        const displayUserName = this.textFormatService.toTitleCase(rawUserName);
        const displayEventName = this.textFormatService.toTitleCase(response.eventName || this.eventName);

        this.notifier.success(
          `Hi, **${displayUserName}**! You have successfully created the event **${displayEventName}**.`,
          'Event Created'
        );
        this.dialogRef.close(response);
      },
      error: (error) => {
        this.isSubmitting.set(false);
        const errorMessage = error?.error?.errors?.[0]?.message || 'Failed to create event';
        this.notifier.error(errorMessage);
        console.error('Create event error:', error);
      }
    });
  }
}

