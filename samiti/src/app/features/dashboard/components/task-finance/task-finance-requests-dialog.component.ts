import { CommonModule } from '@angular/common';
import { Component, inject, Signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  createInitialAdvanceHistoryRequest,
  getTaskFinanceRequestRevision,
  TaskBudgetRequest,
  TaskFinanceRequest,
  TaskFinanceTransaction
} from './task-finance.models';

export interface TaskFinanceRequestsDialogData {
  taskName: string;
  assigneeName: string | null;
  requests: TaskFinanceRequest[];
  budgetRequests: TaskBudgetRequest[];
  transactions: TaskFinanceTransaction[];
  isSaving: Signal<boolean>;
  reviewRequest: (request: TaskFinanceRequest, decision: 'APPROVE' | 'REJECT') => void;
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
            <h2>Finance Requests</h2>
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
          <div class="panel-header">
            <span class="panel-title">
              <mat-icon>payments</mat-icon>
              Disbursement History
            </span>
            <span class="count-badge">{{ taskTransactions().length }}</span>
          </div>

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
                    <tr>
                      <td>{{ index + 1 }}</td>
                      <td class="amount">₹{{ money(transaction.amount) }}</td>
                      <td>{{ transaction.createdAt | date: 'dd MMM, h:mm a' }}</td>
                      <td>{{ transaction.createdByName | titlecase }}</td>
                      <td class="ledger-status">
                        @if (transaction.receivedByName && transaction.receivedAt) {
                          <span class="pill approved receipt-status" [matTooltip]="'Received on ' + (transaction.receivedAt | date: 'dd MMM yy, h:mm a')">
                            <mat-icon>check</mat-icon> Received
                          </span>
                        } @else if (transaction.canConfirmReceipt) {
                          <button
                            mat-flat-button
                            type="button"
                            class="btn-confirm-xs"
                            [disabled]="data.isSaving()"
                            (click)="confirmAndClose(transaction)"
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

        <section class="panel request-history-panel">
          <div class="panel-header">
            <span class="panel-title">
              <mat-icon>request_quote</mat-icon>
              Request History
            </span>
            <span class="count-badge">{{ taskRequests().length }}</span>
          </div>

          @if (taskRequests().length > 0) {
            <div class="request-history-list">
              <table class="request-history-table">
                <thead>
                  <tr>
                    <th>SNo</th>
                    <th>Request</th>
                    <th>Amount</th>
                    <th>Revision</th>
                    <th>Requested By</th>
                    <th>Requested At</th>
                    <th>Approved By</th>
                    <th>Approved At</th>
                  </tr>
                </thead>
                <tbody>
                  @for (request of taskRequests(); track request.id; let index = $index) {
                    @let budgetRequest = getBudgetRequest(request);
                    <tr [class.is-actionable]="request.canReviewAuthority">
                      <td>{{ index + 1 }}</td>
                      <td class="request-summary-cell">
                        <div class="request-summary">
                          <strong>{{ formatLabel(request.requestType) }}</strong>
                          @if (request.status !== 'APPROVED') {
                            <span class="pill" [ngClass]="statusClass(request.status)">
                              {{ formatLabel(request.status) }}
                            </span>
                          }
                        </div>

                        @if (request.canReviewAuthority) {
                          <div class="card-actions">
                            <button
                              mat-button
                              type="button"
                              class="btn-reject"
                              [disabled]="data.isSaving()"
                              (click)="reviewAndClose(request, 'REJECT')"
                            >
                              <mat-icon>close</mat-icon> Reject
                            </button>
                            <button
                              mat-flat-button
                              type="button"
                              class="btn-approve"
                              [disabled]="data.isSaving()"
                              (click)="reviewAndClose(request, 'APPROVE')"
                            >
                              <mat-icon>check</mat-icon> Approve
                            </button>
                          </div>
                        }
                      </td>
                      <td class="request-value amount">{{ requestAmountSummary(request) }}</td>
                      <td class="request-value revision">{{ getRequestImpact(request) }}</td>
                      <td class="request-value">{{ request.requestedByName | titlecase }}</td>
                      <td class="request-value">{{ request.createdAt | date: 'dd MMM, h:mm a' }}</td>
                      <td class="request-value">
                        @if (budgetRequest) {
                          {{ budgetRequest.authorityReviewedByName ? (budgetRequest.authorityReviewedByName | titlecase) : '—' }}
                        } @else {
                          {{ approvedByName(request) ? (approvedByName(request) | titlecase) : '—' }}
                        }
                      </td>
                      <td class="request-value">
                        @if (budgetRequest) {
                          {{ (budgetRequest.authorityReviewedAt | date: 'dd MMM, h:mm a') || '—' }}
                        } @else {
                          {{ (approvedAt(request) | date: 'dd MMM, h:mm a') || '—' }}
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state">No finance requests found.</div>
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
      display: grid;
      flex: 1 1 0;
      min-height: 0;
      grid-template-rows: minmax(0, 7fr) minmax(0, 3fr);
      gap: 10px;
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
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .panel-title {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #334155;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .panel-title mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
      color: #64748b;
    }

    .count-badge {
      padding: 1px 6px;
      border-radius: 99px;
      background: #f1f5f9;
      color: #475569;
      font-size: 0.65rem;
      font-weight: 700;
    }

    .ledger-list {
      display: block;
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: #cbd5e1 transparent;
    }

    .ledger-list::-webkit-scrollbar,
    .request-history-list::-webkit-scrollbar { width: 4px; }

    .ledger-list::-webkit-scrollbar-thumb,
    .request-history-list::-webkit-scrollbar-thumb {
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
    .ledger-table th:last-child { text-align: right; }

    .ledger-table tbody tr:hover { background: #f8fafc; }
    .ledger-table tbody tr:last-child td { border-bottom: 0; }

    .ledger-table .amount {
      color: #0f172a;
      font-weight: 700;
      white-space: nowrap;
    }

    .ledger-table .ledger-status {
      text-align: right;
      white-space: nowrap;
    }

    .empty-state {
      color: #94a3b8;
      font-size: 0.7rem;
      padding: 2px 0;
    }

    .request-history-panel {
      display: flex;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
    }

    .request-history-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: #cbd5e1 transparent;
    }

    .request-history-table {
      width: 100%;
      min-width: 0;
      table-layout: fixed;
      border-collapse: separate;
      border-spacing: 0;
      color: #334155;
      font-size: 0.67rem;
    }

    .request-history-table th,
    .request-history-table td {
      padding: 6px;
      border-bottom: 1px solid #f1f5f9;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }

    .request-history-table th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: #f1f5f9;
      color: #64748b;
      font-size: 0.59rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .request-history-table th:nth-child(1) { width: 5%; }
    .request-history-table th:nth-child(2) { width: 14%; }
    .request-history-table th:nth-child(3) { width: 11%; }
    .request-history-table th:nth-child(4) { width: 15%; }
    .request-history-table th:nth-child(5) { width: 13%; }
    .request-history-table th:nth-child(6) { width: 14%; }
    .request-history-table th:nth-child(7) { width: 14%; }
    .request-history-table th:nth-child(8) { width: 14%; }

    .request-history-table tbody tr:hover { background: #f8fafc; }
    .request-history-table tbody tr.is-actionable { background: #fffdf9; }
    .request-history-table tbody tr.is-actionable:hover { background: #fffbeb; }
    .request-history-table tbody tr:last-child td { border-bottom: 0; }

    .request-history-table .amount {
      color: #0f172a;
      font-weight: 700;
    }

    .request-value {
      color: #1e293b;
      font-weight: 600;
    }

    .request-value.revision {
      color: #c2410c;
      white-space: nowrap;
    }

    .request-summary {
      display: flex;
      min-width: 0;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    }

    .id-tag {
      padding: 1px 5px;
      border-radius: 4px;
      background: #f1f5f9;
      color: #475569;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.66rem;
      font-weight: 700;
    }

    .request-summary strong {
      color: #0f172a;
      font-size: 0.72rem;
      font-weight: 700;
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
    .rejected { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
    .neutral { background: #f1f5f9; border-color: #e2e8f0; color: #475569; }

    /* Actions */
    .card-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-start;
      align-items: center;
      gap: 6px;
      padding-top: 2px;
    }

    .btn-approve,
    .btn-reject,
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

    .btn-approve mat-icon,
    .btn-reject mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }

    .btn-approve {
      background: #16a34a !important;
      color: #fff !important;
    }

    .btn-approve:hover:not([disabled]) { background: #15803d !important; }

    .btn-reject {
      background: #fef2f2 !important;
      border: 1px solid #fecaca !important;
      color: #b91c1c !important;
    }

    .btn-reject:hover:not([disabled]) { background: #fee2e2 !important; }

    .btn-confirm-xs {
      padding: 0 9px !important;
      background: #fff7ed !important;
      border: 1px solid #fed7aa !important;
      color: #c2410c !important;
      font-size: 0.66rem !important;
    }

    .btn-confirm-xs:hover:not([disabled]) { background: #ffedd5 !important; }

    .btn-approve[disabled],
    .btn-reject[disabled],
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

  public reviewAndClose(request: TaskFinanceRequest, decision: 'APPROVE' | 'REJECT'): void {
    this.data.reviewRequest(request, decision);
    this.close();
  }

  public confirmAndClose(transaction: TaskFinanceTransaction): void {
    this.data.confirmReceipt(transaction);
    this.close();
  }

  public taskTransactions(): TaskFinanceTransaction[] {
    return [...this.data.transactions]
      .sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id - right.id
      );
  }

  public taskRequests(): TaskFinanceRequest[] {
    const requests = [...this.data.requests]
      .sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id - right.id
      );
    const initialAdvance = createInitialAdvanceHistoryRequest(
      requests,
      this.data.budgetRequests
    );
    return initialAdvance ? [initialAdvance, ...requests] : requests;
  }

  public getBudgetRequest(request: TaskFinanceRequest): TaskBudgetRequest | null {
    if (request.sourceBudgetRequestId === null) return null;
    return this.data.budgetRequests.find(
      (budgetRequest) => budgetRequest.id === request.sourceBudgetRequestId
    ) ?? null;
  }

  public getRequestImpact(request: TaskFinanceRequest): string {
    const revision = getTaskFinanceRequestRevision(request, this.data.budgetRequests);
    if (revision) {
      return `₹${this.money(revision.previousBudget)} → ₹${this.money(revision.newBudget)}`;
    }
    return `₹0 → ₹${this.money(request.approvedAmount ?? request.requestedAmount)}`;
  }

  public requestAmountSummary(request: TaskFinanceRequest): string {
    const requestedAmount = Number(request.requestedAmount);
    const approvedAmount = Number(request.approvedAmount ?? request.requestedAmount);
    const requested = this.money(requestedAmount);
    return requestedAmount === approvedAmount
      ? `₹${requested}`
      : `₹${requested} → ₹${this.money(approvedAmount)}`;
  }

  public approvedByName(request: TaskFinanceRequest): string | null {
    if (request.status !== 'APPROVED' && request.status !== 'PARTIALLY_APPROVED') {
      return null;
    }
    return request.authorityReviewedByName || request.reviewedByName;
  }

  public approvedAt(request: TaskFinanceRequest): string | null {
    if (request.status !== 'APPROVED' && request.status !== 'PARTIALLY_APPROVED') {
      return null;
    }
    return request.authorityReviewedAt || request.reviewedAt;
  }

  public money(value: string | number | null | undefined): string {
    return Math.round(Number(value || 0)).toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
  }

  public formatLabel(raw: string): string {
    return raw.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  public statusClass(status: string): string {
    switch (status) {
      case 'APPROVED': return 'approved';
      case 'PENDING':
      case 'PARTIALLY_APPROVED': return 'partially-approved';
      case 'REJECTED': return 'rejected';
      default: return 'neutral';
    }
  }
}