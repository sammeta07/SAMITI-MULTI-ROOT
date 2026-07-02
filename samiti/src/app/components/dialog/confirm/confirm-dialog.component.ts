import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { ConfirmDialogData, ConfirmDialogResponse } from './confirm-dialog.models';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent, ConfirmDialogResponse>);
  readonly data: ConfirmDialogData = inject(MAT_DIALOG_DATA);

  onCancel(): void {
    this.dialogRef.close({ confirmed: false });
  }

  onConfirm(): void {
    this.dialogRef.close({ confirmed: true });
  }
}
