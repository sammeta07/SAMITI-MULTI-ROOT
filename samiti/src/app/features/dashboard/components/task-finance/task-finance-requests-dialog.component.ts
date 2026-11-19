import { CommonModule } from '@angular/common';
import { Component, inject, Signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TaskFinanceTransaction } from './task-finance.models';

export interface TaskFinanceRequestsDialogData {
  taskName: string;
  assigneeName: string | null;
  transactions: Signal<TaskFinanceTransaction[]>;
  isSaving: Signal<boolean>;
  confirmReceipt: (transaction: TaskFinanceTransaction) => void;
}

@Component({
  selector: 'app-task-finance-requests-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatToolbarModule, MatTooltipModule],
  template: `
    <section class="drawer-shell">
      <mat-toolbar class="drawer-header">
        <div class="title-group">
          <mat-icon class="header-icon">request_quote</mat-icon>
          <div class="title-stack">
            <h2>Payment History</h2>
            <div class="subtitle-row">
              <span class="subtitle" [matTooltip]="data.taskName">{{ data.taskName | titlecase }}</span>
              @if (data.assigneeName) {
                <span class="assignee-subtitle">Assignee: {{ data.assigneeName | titlecase }}</span>
              }
            </div>
          </div>
        </div>
        <button mat-icon-button type="button" class="close-btn" aria-label="Close dialog" matTooltip="Close" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </mat-toolbar>

      <main class="dialog-body">
        <!-- Combined Disbursement Ledger -->
        <section class="panel ledger-panel">
          @if (taskTransactions().length > 0) {
            <div class="ledger-list">
              <table class="ledger-table">
                <thead>
                  <tr>
                    <th>SNo</th>
                    <th>Amount</th>
                    <th>Datetime</th>
                    <th>Disbursed By</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (transaction of taskTransactions(); track transaction.id; let index = $index) {
                    <tr
                      [class.cash-in]="transaction.transactionType === 'ADVANCE_RETURN'"
                      [class.cash-out]="transaction.transactionType !== 'ADVANCE_RETURN'"
                    >
                      <td>{{ index + 1 }}</td>
                      <td class="amount">₹{{ money(transaction.amount) }}</td>
                      <td>{{ transaction.createdAt | date: 'dd MMM, h:mm a' }}</td>
                      <td>{{ transaction.createdByName | titlecase }}</td>
                      <td class="ledger-status">
                        @if (transaction.transactionType === 'ADVANCE_RETURN' && transaction.status === 'CONFIRMED') {
                          <span class="pill approved receipt-status">
                            <mat-icon>check</mat-icon> Return Accepted
                          </span>
                        } @else if (transaction.receivedByName && transaction.receivedAt) {
                          <span class="pill approved receipt-status">
                            <mat-icon>check</mat-icon> Received
                          </span>
                        } @else if (transaction.canConfirmReceipt) {
                          <button
                            mat-flat-button
                            type="button"
                            class="btn-confirm-xs"
                            [disabled]="data.isSaving()"
                            (click)="confirmReceipt(transaction)"
                          >
                            Confirm Receipt
                          </button>
                        } @else if (transaction.transactionType === 'ADVANCE_ISSUED') {
                          <span class="pill pending receipt-status">Awaiting Receipt</span>
                        } @else {
                          <span class="pill neutral receipt-status">{{ formatLabel(transaction.transactionType) }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state">No disbursements recorded yet.</div>
          }
        </section>
      </main>

      <footer class="drawer-footer">
        <button mat-button type="button" class="btn-close" (click)="close()">Close</button>
      </footer>
    </section>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      background: #fff;
      box-sizing: border-box;
    }

    ::ng-deep .mat-mdc-dialog-surface,
    ::ng-deep .mat-mdc-dialogContainer {
      border-radius: 0 !important;
      box-shadow: -4px 0 24px rgba(15, 23, 42, 0.08) !important;
    }

    .drawer-shell {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;
      background: #fff;
    }

    /* Header */
    .drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 54px !important;
      min-height: 54px !important;
      padding: 0 16px !important;
      background: #fff !important;
      border-bottom: 1px solid #e2e8f0;
      flex-shrink: 0;
      box-sizing: border-box;
    }

    .title-group {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .header-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: #f97316;
      flex-shrink: 0;
    }

    .title-stack {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 2px;
    }

    .subtitle-row {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 8px;
    }

    h2 {
      margin: 0;
      color: #0f172a;
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.01em;
    }

    .subtitle {
      min-width: 0;
      color: #64748b;
      font-size: 0.7rem;
      font-weight: 500;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .assignee-subtitle {
      flex: 0 0 auto;
      color: #475569;
      font-size: 0.68rem;
      font-weight: 600;
      line-height: 1.1;
      white-space: nowrap;
    }

    .close-btn {
      width: 32px !important;
      height: 32px !important;
      padding: 4px !important;
      color: #64748b !important;
      flex-shrink: 0;
    }

    .close-btn:hover {
      background: rgba(239, 68, 68, 0.08) !important;
      color: #ef4444 !important;
    }

    /* Body */
    .dialog-body {
      display: flex;
      flex: 1 1 0;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      padding: 14px 16px;
      background: #f8fafc;
      box-sizing: border-box;
    }

    .panel {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
    }

    /* Ledger Panel */
    .ledger-panel {
      display: flex;
      flex: 1 1 0;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
    }

    .ledger-list {
      display: block;
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: #cbd5e1 transparent;
    }

    .ledger-list::-webkit-scrollbar { width: 4px; }

    .ledger-list::-webkit-scrollbar-thumb {
      border-radius: 99px;
      background: #cbd5e1;
    }

    .ledger-table {
      width: 100%;
      min-width: 0;
      table-layout: fixed;
      border-collapse: separate;
      border-spacing: 0;
      color: #334155;
      font-size: 0.68rem;
    }

    .ledger-table th,
    .ledger-table td {
      padding: 7px 8px;
      border-bottom: 1px solid #f1f5f9;
      text-align: left;
      vertical-align: middle;
    }

    .ledger-table th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: #f1f5f9;
      color: #64748b;
      font-size: 0.61rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .ledger-table th:nth-child(1) { width: 7%; }
    .ledger-table th:nth-child(2) { width: 15%; }
    .ledger-table th:nth-child(3) { width: 22%; }
    .ledger-table th:nth-child(4) { width: 32%; }
    .ledger-table th:nth-child(5) { width: 24%; }
    .ledger-table th:last-child { text-align: left; }

    .ledger-table tbody tr:hover { background: #f8fafc; }
    .ledger-table tbody tr.cash-in { background: #ecfdf5; }
    .ledger-table tbody tr.cash-out { background: #fef2f2; }
    .ledger-table tbody tr:last-child td { border-bottom: 0; }

    .ledger-table .amount {
      color: #0f172a;
      font-weight: 700;
      white-space: nowrap;
    }

    .ledger-table .ledger-status {
      text-align: left;
      white-space: nowrap;
    }

    .empty-state {
      color: #94a3b8;
      font-size: 0.7rem;
      padding: 2px 0;
    }

    /* Pills */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 7px;
      border-radius: 99px;
      border: 1px solid transparent;
      font-size: 0.63rem;
      font-weight: 700;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .receipt-status,
    .btn-confirm-xs {
      width: 108px !important;
      min-width: 108px !important;
      max-width: 108px !important;
      height: var(--samiti-action-height) !important;
      min-height: var(--samiti-action-height) !important;
      max-height: var(--samiti-action-height) !important;
      justify-content: center;
      box-sizing: border-box;
      border-radius: 5px !important;
      white-space: nowrap;
    }

    .pill mat-icon {
      width: 11px;
      height: 11px;
      font-size: 11px;
    }

    .approved { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
    .pending, .partially-approved { background: #fffbeb; border-color: #fde68a; color: #b45309; }
    .neutral { background: #f1f5f9; border-color: #e2e8f0; color: #475569; }

    .btn-confirm-xs {
      display: inline-flex !important;
      align-items: center;
      gap: 4px;
      height: 28px !important;
      min-height: 28px !important;
      padding: 0 11px !important;
      border-radius: 5px !important;
      font-size: 0.71rem !important;
      font-weight: 700 !important;
      line-height: 1 !important;
    }

    .btn-confirm-xs {
      padding: 0 9px !important;
      background: #fff7ed !important;
      border: 1px solid #fed7aa !important;
      color: #c2410c !important;
      font-size: 0.66rem !important;
    }

    .btn-confirm-xs:hover:not([disabled]) { background: #ffedd5 !important; }

    .btn-confirm-xs[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Footer */
    .drawer-footer {
      display: flex;
      flex: 0 0 auto;
      height: 48px;
      min-height: 48px;
      align-items: center;
      justify-content: flex-end;
      padding: 0 16px;
      border-top: 1px solid #e2e8f0;
      background: #fff;
      box-sizing: border-box;
    }

    .btn-close {
      height: 30px !important;
      min-height: 30px !important;
      padding: 0 14px !important;
      border-radius: 5px !important;
      color: #475569 !important;
      font-size: 0.72rem !important;
      font-weight: 700 !important;
    }

    .btn-close:hover { background: #f1f5f9 !important; }

    @media (max-width: 540px) {
      .dialog-body { padding: 10px; }
    }
  `]
})
export class TaskFinanceRequestsDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<TaskFinanceRequestsDialogComponent>);
  public readonly data = inject<TaskFinanceRequestsDialogData>(MAT_DIALOG_DATA);

  public close(): void {
    this.dialogRef.close();
  }

  public confirmReceipt(transaction: TaskFinanceTransaction): void {
    this.data.confirmReceipt(transaction);
  }

  public taskTransactions(): TaskFinanceTransaction[] {
    return [...this.data.transactions()]
      .sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id - right.id
      );
  }

  public money(value: string | number | null | undefined): string {
    return Math.round(Number(value || 0)).toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
  }

  public formatLabel(raw: string): string {
    return raw.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}