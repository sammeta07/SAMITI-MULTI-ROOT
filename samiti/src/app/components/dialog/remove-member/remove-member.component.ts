import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RemoveMemberDialogData, RemoveMemberDialogResponse, RemoveMemberResponse } from './remove-member.models';
import { RemoveMemberDialogService } from './remove-member.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';

@Component({
  selector: 'app-remove-member-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './remove-member.component.html',
  styleUrl: './remove-member.component.scss',
})
export class RemoveMemberDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<RemoveMemberDialogComponent, RemoveMemberDialogResponse>);
  readonly data: RemoveMemberDialogData = inject(MAT_DIALOG_DATA);
  private readonly removeMemberService = inject(RemoveMemberDialogService);
  private readonly notifier = inject(NotifierService);

  isLoading = signal<boolean>(false);

  onCancel(): void {
    this.dialogRef.close({ confirmed: false });
  }

  onConfirm(): void {
    this.isLoading.set(true);
    this.removeMemberService.removeMember(this.data.userId, this.data.committeeId).subscribe({
      next: (response: RemoveMemberResponse) => {
        this.isLoading.set(false);
        this.notifier.success('Member removed successfully!');
        this.dialogRef.close({ confirmed: true });
      },
      error: (err) => {
        this.isLoading.set(false);
        this.notifier.error(err?.error?.message || 'Failed to remove member. Please try again.');
      },
    });
  }
}
