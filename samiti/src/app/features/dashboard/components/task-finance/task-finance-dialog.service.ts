import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { TaskFinanceDialogComponent } from './task-finance-dialog.component';

@Injectable({ providedIn: 'root' })
export class TaskFinanceDialogService {
  private readonly dialog = inject(MatDialog);

  public open(taskId: number, taskName: string, ownerName: string | null | undefined): Observable<void> {
    return this.openDialog({
      taskId,
      taskName,
      ownerName: ownerName ?? null
    });
  }

  public openEvent(eventId: number, eventName: string): Observable<void> {
    return this.openDialog({
      eventId,
      taskName: eventName,
      ownerName: null
    });
  }

  private openDialog(data: {
    taskId?: number;
    eventId?: number;
    taskName: string;
    ownerName: string | null;
  }): Observable<void> {
    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(TaskFinanceDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '100%',
      maxWidth: '100vw',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      data,
      panelClass: ['slide-in-dialog', 'task-finance-dialog-panel']
    });
    const closed = dialogRef.afterClosed();
    closed.subscribe(() => {
      document.body.classList.remove('dialog-open');
    });
    return closed.pipe(map(() => undefined));
  }
}
