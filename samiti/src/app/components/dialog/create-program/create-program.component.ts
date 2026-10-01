import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideNativeDateAdapter } from '@angular/material/core';
import { CreateProgramService } from './create-program.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { HeaderService } from '../../header/header.service';

@Component({
  selector: 'app-create-program-dialog',
  standalone: true,
  providers: [provideNativeDateAdapter()],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatDatepickerModule,
    MatTimepickerModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatToolbar,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './create-program.component.html',
  styleUrl: './create-program.component.scss'
})
export class CreateProgramDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<CreateProgramDialogComponent>);
  private readonly createProgramService = inject(CreateProgramService);
  private readonly notifier = inject(NotifierService);
  private readonly headerService = inject(HeaderService);

  public readonly injectedData = inject(MAT_DIALOG_DATA, { optional: true });

  // Form bindings
  public programName: string = '';
  public address: string = '';
  public visibility: 'VISIBLE' | 'HIDDEN' = 'HIDDEN';
  public latitude: number | null = null;
  public longitude: number | null = null;
  public startDate: Date | null = null;
  public endDate: Date | null = null;
  public startTime: Date | null = null;
  public endTime: Date | null = null;
  public isRecurring: boolean = false;

  public readonly isSubmitting = signal<boolean>(false);
  public readonly isEditMode = signal<boolean>(false);
  public readonly editingProgramId = signal<number | null>(null);
  public readonly isAddressEditable = signal<boolean>(false);
  public readonly isFetchingLocation = signal<boolean>(false);
  private readonly originalAddress = signal<string>('');

  ngOnInit(): void {
    const injectedProgramId = Number(this.injectedData?.programId);
    if (Number.isInteger(injectedProgramId) && injectedProgramId > 0) {
      this.isEditMode.set(true);
      this.editingProgramId.set(injectedProgramId);
    }

    const committeeAddress = this.injectedData?.address || this.injectedData?.committeeAddress;
    if (typeof committeeAddress === 'string' && committeeAddress.trim().length > 0) {
      this.address = committeeAddress.trim();
      this.originalAddress.set(this.address);
    }

    const injectedProgramName = this.injectedData?.programName;
    if (typeof injectedProgramName === 'string' && injectedProgramName.trim().length > 0) {
      this.programName = injectedProgramName.trim();
    }

    const injectedVisibility = String(this.injectedData?.visibility || '').toUpperCase();
    if (injectedVisibility === 'VISIBLE' || injectedVisibility === 'HIDDEN') {
      this.visibility = injectedVisibility;
    }

    const injectedStartDate = this.injectedData?.startDate;
    if (typeof injectedStartDate === 'string' && injectedStartDate.trim().length > 0) {
      const parsed = new Date(injectedStartDate.trim() + 'T00:00:00');
      if (!Number.isNaN(parsed.getTime())) {
        this.startDate = parsed;
      }
    }

    const injectedEndDate = this.injectedData?.endDate;
    if (typeof injectedEndDate === 'string' && injectedEndDate.trim().length > 0) {
      const parsed = new Date(injectedEndDate.trim() + 'T00:00:00');
      if (!Number.isNaN(parsed.getTime())) {
        this.endDate = parsed;
      }
    }

    const injectedStartTime = this.injectedData?.startTime;
    if (typeof injectedStartTime === 'string' && injectedStartTime.trim().length > 0) {
      this.startTime = this.parseTime(injectedStartTime.trim());
    }

    const injectedEndTime = this.injectedData?.endTime;
    if (typeof injectedEndTime === 'string' && injectedEndTime.trim().length > 0) {
      this.endTime = this.parseTime(injectedEndTime.trim());
    }

    const injectedIsRecurring = this.injectedData?.isRecurring;
    if (typeof injectedIsRecurring === 'boolean') {
      this.isRecurring = injectedIsRecurring;
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
    return this.isEditMode() ? 'Edit Program' : 'Create New Program';
  }

  public get submitButtonLabel(): string {
    return this.isEditMode() ? (this.isSubmitting() ? 'Saving...' : 'Save Program') : (this.isSubmitting() ? 'Creating...' : 'Create Program');
  }

  public get submitButtonIcon(): string {
    return this.isEditMode() ? 'save' : 'add';
  }

  public get isFormValid(): boolean {
    if (!this.programName?.trim() || !this.startDate || !this.endDate || !this.startTime || !this.endTime) {
      return false;
    }

    if (!this.address?.trim()) {
      return false;
    }

    if (this.latitude == null || this.longitude == null) {
      return false;
    }

    const startDateStr = this.toDateString(this.startDate);
    const endDateStr = this.toDateString(this.endDate);

    if (!startDateStr || !endDateStr) {
      return false;
    }

    if (startDateStr > endDateStr) {
      return false;
    }

    if (
      startDateStr === endDateStr &&
      this.timeToSeconds(this.startTime) >= this.timeToSeconds(this.endTime)
    ) {
      return false;
    }

    return true;
  }

  public enableAddressEdit(): void {
    this.originalAddress.set(this.address);
    this.isAddressEditable.set(true);
  }

  public resetAddress(): void {
    this.address = this.originalAddress();
    this.isAddressEditable.set(false);
  }

  public fetchUserLocation(): void {
    if (!navigator.geolocation) {
      return;
    }

    this.isFetchingLocation.set(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.latitude = Number(position.coords.latitude.toFixed(6));
        this.longitude = Number(position.coords.longitude.toFixed(6));
        this.isFetchingLocation.set(false);
      },
      () => {
        this.isFetchingLocation.set(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  private parseTime(value: string): Date | null {
    const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] || 0);
    if (hours > 23 || minutes > 59 || seconds > 59) {
      return null;
    }

    return new Date(2000, 0, 1, hours, minutes, seconds);
  }

  private timeToSeconds(value: Date): number {
    return value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
  }

  private formatTimeForApi(value: Date): string {
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    const seconds = String(value.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  private toDateString(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public onCancel(): void {
    this.dialogRef.close(false);
  }

  public onSubmit(): void {
    if (!this.isFormValid) return;

    const eventId = this.injectedData?.eventId;
    if (!eventId) {
      this.notifier.error('Event ID not provided');
      return;
    }

    this.isSubmitting.set(true);

    const payload = {
      eventId,
      programName: this.programName.trim(),
      address: this.address.trim() || undefined,
      visibility: this.visibility,
      startDate: this.toDateString(this.startDate) || '',
      endDate: this.toDateString(this.endDate) || '',
      startTime: this.formatTimeForApi(this.startTime!),
      endTime: this.formatTimeForApi(this.endTime!),
      isRecurring: this.isRecurring
    };

    const request$ = this.isEditMode()
      ? this.createProgramService.updateProgram({
          ...payload,
          programId: Number(this.editingProgramId())
        })
      : this.createProgramService.createProgram(payload);

    request$.subscribe({
      next: (result) => {
        this.isSubmitting.set(false);
        this.dialogRef.close(result);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.notifier.error(err?.error?.message || (this.isEditMode() ? 'Failed to update program.' : 'Failed to create program.'));
      }
    });
  }
}
