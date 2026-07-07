import { Component, inject, OnInit, signal } from '@angular/core';
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
import { HeaderService } from '../../header/header.service';

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
export class CreateEventDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<CreateEventDialogComponent>);
  private readonly createEventService = inject(CreateEventService);
  private readonly notifier = inject(NotifierService);
  private readonly textFormatService = inject(TextFormatService);
  private readonly authService = inject(AuthService);
  private readonly headerService = inject(HeaderService);

  public readonly injectedData = inject(MAT_DIALOG_DATA, { optional: true });

  // Form bindings
  public eventName: string = '';
  public eventDisplayName: string = '';
  public address: string = '';
  public latitude: number | null = null;
  public longitude: number | null = null;
  public status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' = 'UPCOMING';
  public category: string = 'puja';
  public visibility: 'VISIBLE' | 'HIDDEN' = 'HIDDEN';
  public startDate: Date | null = null;
  public endDate: Date | null = null;

  public readonly isSubmitting = signal<boolean>(false);
  public readonly type = signal<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  public readonly isEditMode = signal<boolean>(false);
  public readonly editingEventId = signal<number | null>(null);

  public readonly eventTypes = ['puja', 'sports', 'meeting', 'celebration', 'workshop', 'other'];
  public readonly statuses = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'];

  ngOnInit(): void {
    const injectedEventId = Number(this.injectedData?.eventId);
    if (Number.isInteger(injectedEventId) && injectedEventId > 0) {
      this.isEditMode.set(true);
      this.editingEventId.set(injectedEventId);
    }

    const committeeAddress = this.injectedData?.address || this.injectedData?.committeeAddress;
    if (typeof committeeAddress === 'string' && committeeAddress.trim().length > 0) {
      this.address = committeeAddress.trim();
    }

    const injectedEventType = this.injectedData?.eventType;
    this.type.set(injectedEventType === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC');

    const injectedVisibility = String(this.injectedData?.visibility || '').toUpperCase();
    if (injectedVisibility === 'VISIBLE' || injectedVisibility === 'HIDDEN') {
      this.visibility = injectedVisibility;
    }

    const injectedEventName = this.injectedData?.eventName;
    if (typeof injectedEventName === 'string' && injectedEventName.trim().length > 0) {
      this.eventName = injectedEventName.trim();
    }

    const injectedEventDisplayName = this.injectedData?.eventDisplayName;
    if (typeof injectedEventDisplayName === 'string' && injectedEventDisplayName.trim().length > 0) {
      this.eventDisplayName = injectedEventDisplayName.trim();
    }

    const injectedStatus = String(this.injectedData?.status || '').toUpperCase();
    if (this.statuses.includes(injectedStatus)) {
      this.status = injectedStatus as 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
    }

    const injectedCategory = this.injectedData?.category;
    if (typeof injectedCategory === 'string' && injectedCategory.trim().length > 0) {
      this.category = injectedCategory.trim().toLowerCase();
    }

    const injectedStartDate = this.parseDateInput(this.injectedData?.startDate);
    if (injectedStartDate) {
      this.startDate = injectedStartDate;
    }

    const injectedEndDate = this.parseDateInput(this.injectedData?.endDate);
    if (injectedEndDate) {
      this.endDate = injectedEndDate;
    }

    const injectedLatitude = Number(this.injectedData?.latitude);
    if (!Number.isNaN(injectedLatitude)) {
      this.latitude = injectedLatitude;
    }

    const injectedLongitude = Number(this.injectedData?.longitude);
    if (!Number.isNaN(injectedLongitude)) {
      this.longitude = injectedLongitude;
    }

    if (this.latitude === null || this.longitude === null) {
      const gps = this.headerService.userLocationCords();
      if (gps) {
        this.latitude = gps.lat;
        this.longitude = gps.long;
      }
    }
  }

  public get dialogTitle(): string {
    if (this.isEditMode()) {
      return 'Edit Event';
    }

    return this.type() === 'PRIVATE' ? 'Create Private Event' : 'Create Public Event';
  }

  public get dialogSubtitle(): string {
    if (this.isEditMode()) {
      return 'Update event information and save changes';
    }

    return 'by default this event will be hidden from public';
  }

  public get submitButtonLabel(): string {
    return this.isEditMode() ? 'Save Changes' : 'Create Event';
  }

  public get submitButtonIcon(): string {
    return this.isEditMode() ? 'save' : 'add_event';
  }

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
      address: this.address?.trim() || undefined,
      status: this.status,
      category: this.category || undefined,
      visibility: this.visibility,
      type: this.type(),
      startDate: startDateStr,
      endDate: endDateStr,
      latitude: Number(this.latitude ?? 0),
      longitude: Number(this.longitude ?? 0)
    };

    if (this.isEditMode()) {
      const eventId = Number(this.editingEventId());
      if (!Number.isInteger(eventId) || eventId <= 0) {
        this.notifier.error('Event ID not provided for update');
        this.isSubmitting.set(false);
        return;
      }
    }

    const request$ = this.isEditMode()
      ? this.createEventService.updateEvent({
          ...payload,
          eventId: Number(this.editingEventId())
        })
      : this.createEventService.createEvent(payload);

    request$.subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        const rawUserName = this.authService.getStoredUserData()?.name || 'User';
        const displayUserName = this.textFormatService.toTitleCase(rawUserName);
        const displayEventName = this.textFormatService.toTitleCase(response.eventName || this.eventName);

        if (this.isEditMode()) {
          this.notifier.success(
            `Hi, **${displayUserName}**! You have successfully updated the event **${displayEventName}**.`,
            'Event Updated'
          );
        } else {
          this.notifier.success(
            `Hi, **${displayUserName}**! You have successfully created the event **${displayEventName}**.`,
            'Event Created'
          );
        }
        this.dialogRef.close(response);
      },
      error: (error) => {
        this.isSubmitting.set(false);
        const errorMessage = error?.error?.errors?.[0]?.message || (this.isEditMode() ? 'Failed to update event' : 'Failed to create event');
        this.notifier.error(errorMessage);
        console.error(this.isEditMode() ? 'Update event error:' : 'Create event error:', error);
      }
    });
  }

  private parseDateInput(value: unknown): Date | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    const parsedDate = new Date(`${value.trim()}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }
}

