import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbar } from '@angular/material/toolbar';
import { CreateProgramService } from './create-program.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { HeaderService } from '../../header/header.service';

@Component({
  selector: 'app-create-program-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatDatepickerModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatToolbar,
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
  public startDateTime: Date | null = null;
  public endDateTime: Date | null = null;

  public readonly isSubmitting = signal<boolean>(false);
  public readonly isEditMode = signal<boolean>(false);
  public readonly editingProgramId = signal<number | null>(null);

  ngOnInit(): void {
    const injectedProgramId = Number(this.injectedData?.programId);
    if (Number.isInteger(injectedProgramId) && injectedProgramId > 0) {
      this.isEditMode.set(true);
      this.editingProgramId.set(injectedProgramId);
    }

    const committeeAddress = this.injectedData?.address || this.injectedData?.committeeAddress;
    if (typeof committeeAddress === 'string' && committeeAddress.trim().length > 0) {
      this.address = committeeAddress.trim();
    }

    const injectedProgramName = this.injectedData?.programName;
    if (typeof injectedProgramName === 'string' && injectedProgramName.trim().length > 0) {
      this.programName = injectedProgramName.trim();
    }

    const injectedVisibility = String(this.injectedData?.visibility || '').toUpperCase();
    if (injectedVisibility === 'VISIBLE' || injectedVisibility === 'HIDDEN') {
      this.visibility = injectedVisibility;
    }

    const injectedStartDateTime = this.parseDateInput(this.injectedData?.startDateTime || this.injectedData?.startDate);
    if (injectedStartDateTime) {
      this.startDateTime = injectedStartDateTime;
    }

    const injectedEndDateTime = this.parseDateInput(this.injectedData?.endDateTime || this.injectedData?.endDate);
    if (injectedEndDateTime) {
      this.endDateTime = injectedEndDateTime;
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

  get isFormValid(): boolean {
    if (!this.programName?.trim() || !this.startDateTime || !this.endDateTime) {
      return false;
    }

    return this.startDateTime.getTime() <= this.endDateTime.getTime();
  }

  private formatDateForApi(value: Date | null): string | null {
    if (!value) {
      return null;
    }

    const pad = (input: number): string => String(input).padStart(2, '0');
    return [
      value.getFullYear(),
      pad(value.getMonth() + 1),
      pad(value.getDate())
    ].join('-') + 'T00:00:00';
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
      startDateTime: this.formatDateForApi(this.startDateTime) as string,
      endDateTime: this.formatDateForApi(this.endDateTime) as string,
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

  private parseDateInput(value: unknown): Date | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
    const parsedDate = new Date(normalized);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }
}
