import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TaskFinanceDialogComponent } from './task-finance-dialog.component';

@Injectable({ providedIn: 'root' })
export class TaskFinanceDialogService {
  private readonly dialog = inject(MatDialog);

  public open(taskId: number, taskName: string): void {
    document.body.classList.add('dialog-open');
    this.dialog.open(TaskFinanceDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      data: { taskId, taskName },
      panelClass: ['slide-in-dialog', 'task-finance-dialog-panel']
    }).afterClosed().subscribe(() => {
      document.body.classList.remove('dialog-open');
    });
  }
}
