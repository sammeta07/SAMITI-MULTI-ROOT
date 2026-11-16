import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { TaskFinanceComponent } from './task-finance.component';

export interface TaskFinanceDialogData {
  taskId: number;
  taskName: string;
}

@Component({
  selector: 'app-task-finance-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatToolbarModule, TaskFinanceComponent],
  template: `
    <section class="drawer-layout-shell">
      <mat-toolbar class="drawer-synchronized-header">
        <div class="drawer-title-group">
          <mat-icon class="mode-indicator-icon">account_balance_wallet</mat-icon>
          <div class="drawer-title-copy">
            <h2>Task Finance</h2>
            <p>{{ data.taskName }} · #{{ data.taskId }}</p>
          </div>
        </div>
        <button mat-icon-button type="button" class="drawer-close-btn" aria-label="Close dialog" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </mat-toolbar>
      <div class="dialog-body">
        <app-task-finance [taskId]="data.taskId" [loadOnInit]="true" />
      </div>
      <footer class="drawer-action-footer">
        <button mat-button type="button" class="btn-cancel-flat" (click)="close()">Close</button>
      </footer>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
    }

    .drawer-layout-shell {
      display: flex;
      width: 100%;
      height: 100%;
      min-height: 0;
      flex-direction: column;
      background: #fff;
    }

    .drawer-synchronized-header {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      height: 60px;
      min-height: 60px;
      padding: 0 20px;
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      box-sizing: border-box;
    }

    .drawer-title-group {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 8px;
    }

    .mode-indicator-icon {
      flex: 0 0 auto;
      width: 1.35rem;
      height: 1.35rem;
      color: #f97316;
      font-size: 1.35rem;
    }

    .drawer-title-group h2,
    .drawer-title-group p {
      margin: 0;
    }

    .drawer-title-group h2 {
      color: #0f172a;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.2px;
      line-height: 1;
    }

    .drawer-title-group p {
      overflow: hidden;
      margin-top: 3px;
      color: #64748b;
      font-size: 0.75rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .drawer-close-btn {
      flex: 0 0 auto;
      color: #64748b;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .drawer-close-btn:hover {
      background: rgba(239, 68, 68, 0.08);
      color: #ef4444;
    }

    .dialog-body {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      padding: 24px;
      background: #f8fafc;
      box-sizing: border-box;
    }

    .dialog-body app-task-finance {
      flex: 1 1 auto;
      min-width: 0;
    }

    .drawer-action-footer {
      display: flex;
      flex: 0 0 auto;
      height: 55px;
      min-height: 55px;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 0 20px;
      border-top: 1px solid #e2e8f0;
      background: #fff;
      box-sizing: border-box;
    }

    .btn-cancel-flat {
      height: var(--samiti-action-height);
      min-height: var(--samiti-action-height);
      padding: 0 16px;
      border-radius: 6px;
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .btn-cancel-flat:hover {
      background: #f1f5f9;
    }

    @media (max-width: 600px) {
      .dialog-body {
        padding: 12px;
      }
    }
  `]
})
export class TaskFinanceDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<TaskFinanceDialogComponent>);
  public readonly data = inject<TaskFinanceDialogData>(MAT_DIALOG_DATA);

  public close(): void {
    this.dialogRef.close();
  }
}
