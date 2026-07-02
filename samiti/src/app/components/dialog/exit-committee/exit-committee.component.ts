import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ExitCommitteeDialogData, ExitCommitteeDialogResponse, ExitCommitteeResponse } from './exit-committee.models';
import { ExitCommitteeDialogService } from './exit-committee.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';

@Component({
  selector: 'app-exit-committee-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './exit-committee.component.html',
  styleUrl: './exit-committee.component.scss',
})
export class ExitCommitteeDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ExitCommitteeDialogComponent, ExitCommitteeDialogResponse>);
  readonly data: ExitCommitteeDialogData = inject(MAT_DIALOG_DATA);
  private readonly exitCommitteeService = inject(ExitCommitteeDialogService);
  private readonly notifier = inject(NotifierService);

  isLoading = signal<boolean>(false);

  onCancel(): void {
    this.dialogRef.close({ confirmed: false });
  }

  onConfirm(): void {
    this.isLoading.set(true);
    this.exitCommitteeService.exitCommittee(this.data.committeeId).subscribe({
      next: (response: ExitCommitteeResponse) => {
        this.isLoading.set(false);
        this.notifier.success('Successfully left the committee!');
        this.dialogRef.close({ confirmed: true });
      },
      error: (err) => {
        this.isLoading.set(false);
        this.notifier.error(err?.error?.message || 'Failed to exit committee. Please try again.');
      },
    });
  }
}
