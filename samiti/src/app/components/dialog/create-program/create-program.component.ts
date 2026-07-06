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
import { CreateProgramService } from './create-program.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { TextFormatService } from '../../../shared/services/text-format-service.service';

@Component({
  selector: 'app-create-program-dialog',
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
  templateUrl: './create-program.component.html',
  styleUrl: './create-program.component.scss'
})
export class CreateProgramDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<CreateProgramDialogComponent>);
  private readonly createProgramService = inject(CreateProgramService);
  private readonly notifier = inject(NotifierService);
  private readonly textFormatService = inject(TextFormatService);

  public readonly injectedData = inject(MAT_DIALOG_DATA, { optional: true });

  // Form bindings
  public programName: string = '';
  public description: string = '';
  public status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' = 'UPCOMING';
  public startDate: Date | null = null;
  public endDate: Date | null = null;

  public readonly isSubmitting = signal<boolean>(false);

  public readonly statuses = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'];

  get isFormValid(): boolean {
    return !!this.programName?.trim() && !!this.status && !!this.startDate;
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

    const formatDate = (d: Date | null): string | null =>
      d ? d.toISOString().split('T')[0] : null;

    this.createProgramService.createProgram({
      eventId,
      programName: this.programName.trim(),
      description: this.description.trim() || undefined,
      status: this.status,
      startDate: formatDate(this.startDate),
      endDate: formatDate(this.endDate),
    }).subscribe({
      next: (result) => {
        this.isSubmitting.set(false);
        this.dialogRef.close(result);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.notifier.error(err?.error?.message || 'Failed to create program.');
      }
    });
  }
}
