import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { ConfirmDialogData, ConfirmDialogResponse } from './confirm-dialog.models';

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(MatDialog);

  open(data: ConfirmDialogData): MatDialogRef<ConfirmDialogComponent, ConfirmDialogResponse> {
    return this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      disableClose: true,
      hasBackdrop: true,
      autoFocus: false,
      restoreFocus: false,
      panelClass: 'confirm-dialog-pane',
      backdropClass: 'confirm-dialog-backdrop',
      data: data,
    });
  }
}
