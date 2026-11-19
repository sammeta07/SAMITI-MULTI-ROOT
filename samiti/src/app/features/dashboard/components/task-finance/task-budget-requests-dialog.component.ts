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
  getTopUpSourceBudgetRequestIds,
  TaskBudgetRequest,
  TaskFinanceRequest
} from './task-finance.models';

export interface TaskBudgetRequestsDialogData {
  taskName: string;
  assigneeName: string | null;
  requests: Signal<TaskBudgetRequest[]>;
  financeRequests: Signal<TaskFinanceRequest[]>;
  isTreasurer: boolean;
  isSaving: Signal<boolean>;
  reviewRequest: (request: TaskBudgetRequest, decision: 'APPROVE' | 'REJECT') => void;
  cancelRequest: (request: TaskBudgetRequest) => void;
  reviewFinanceRequest: (request: TaskFinanceRequest, decision: 'APPROVE' | 'REJECT') => void;
}

type BudgetIncreaseHistoryRow =
  | { kind: 'budget'; key: string; id: number; createdAt: string; request: TaskBudgetRequest }
  | { kind: 'finance'; key: string; id: number; createdAt: string; request: TaskFinanceRequest };

@Component({
  selector: 'app-task-budget-requests-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatToolbarModule, MatTooltipModule],
  template: `
    <section class="drawer-layout-shell">
      <mat-toolbar class="drawer-synchronized-header">
        <div class="drawer-title-group">
          <div class="header-icon-badge">
            <mat-icon>request_quote</mat-icon>
          </div>
          <div class="header-title-stack">
            <h2>Budget Increase Requests</h2>
            <div class="header-subtitle-row">
              <span class="header-subtitle">{{ data.taskName | titlecase }}</span>
              @if (data.assigneeName) {
                <span class="assignee-subtitle">Assignee: {{ data.assigneeName | titlecase }}</span>
              }
            </div>
          </div>
        </div>
        <div class="header-right-actions">
          <span class="request-count-pill">{{ historyRows().length }} {{ historyRows().length === 1 ? 'Request' : 'Requests' }}</span>
          <button mat-icon-button type="button" class="drawer-close-btn" aria-label="Close dialog" matTooltip="Close" (click)="close()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </mat-toolbar>

      <main class="dialog-body">
        @if (historyRows().length === 0) {
            <div class="empty-state-box">
              <mat-icon>receipt_long</mat-icon>
              <p>No requests found for this task.</p>
            </div>
        } @else {
          <div class="budget-table-wrap">
            <table class="history-table">
              <thead>
                <tr>
                  <th>SNo</th>
                  <th>Request</th>
                  <th>Amount</th>
                  <th>Revision</th>
                  <th>Requested By</th>
                  <th>Requested At</th>
                  <th>Action By / At</th>
                  <th class="status-heading">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (row of historyRows(); track row.key; let index = $index) {
                  <tr [class.is-actionable]="row.kind === 'budget'
                    ? row.request.canReviewCreator || row.request.canReviewAuthority
                    : row.request.canReviewAuthority">
                    <td><span class="request-id">{{ index + 1 }}</span></td>
                    @if (row.kind === 'budget') {
                      <td><strong>Top Up</strong></td>
                      <td><span class="increase">+₹{{ money(row.request.requestedIncrease) }}</span></td>
                      <td>
                        <div class="revision-flow">
                          <span class="old-amt">₹{{ money(row.request.budgetBeforeRequest) }}</span>
                          <mat-icon class="arrow-icon">east</mat-icon>
                          <span class="new-amt">₹{{ money(row.request.requestedAmount) }}</span>
                        </div>
                      </td>
                      <td>{{ row.request.requestedByName | titlecase }}</td>
                      <td>{{ row.request.createdAt | date: 'dd MMM yy, h:mm a' }}</td>
                      <td class="actioner-cell">
                        <strong>{{ actionByName(row.request) ? (actionByName(row.request) | titlecase) : '—' }}</strong>
                        <small>{{ budgetActionAt(row.request) ? (budgetActionAt(row.request) | date: 'dd MMM yy, h:mm a') : '—' }}</small>
                      </td>
                      <td class="status-cell">
                        <div class="status-action-stack">
                          @if (shouldShowStatus(row.request)) {
                            <span
                              class="status"
                              [class.fixed-status]="data.isTreasurer || row.request.status === 'APPROVED' || row.request.status === 'PENDING' || row.request.status === 'REJECTED' || row.request.status === 'CANCELLED' || row.request.status === 'CANCELED'"
                              [ngClass]="statusClass(displayedStatus(row.request).status)"
                            >
                              {{ displayedStatus(row.request).label }}
                            </span>
                          }
                          @if (row.request.canReviewCreator || row.request.canReviewAuthority) {
                            <div class="actions">
                              <button
                                mat-flat-button
                                type="button"
                                class="submit-action-btn icon-action-btn"
                                aria-label="Approve request"
                                matTooltip="Approve request"
                                matTooltipPosition="above"
                                [disabled]="data.isSaving()"
                                (click)="reviewRequest(row.request, 'APPROVE')"
                              >
                                <mat-icon>check</mat-icon><span class="action-label">Approve</span>
                              </button>
                              <button
                                mat-button
                                type="button"
                                class="reject-action-btn icon-action-btn"
                                aria-label="Reject request"
                                matTooltip="Reject request"
                                matTooltipPosition="above"
                                [disabled]="data.isSaving()"
                                (click)="reviewRequest(row.request, 'REJECT')"
                              >
                                <mat-icon>close</mat-icon><span class="action-label">Reject</span>
                              </button>
                            </div>
                          } @else if (row.request.canCancel) {
                            <div class="actions">
                              <button
                                mat-button
                                type="button"
                                class="reject-action-btn"
                                [disabled]="data.isSaving()"
                                (click)="cancelRequest(row.request)"
                              >
                                <mat-icon>close</mat-icon><span>Cancel</span>
                              </button>
                            </div>
                          }
                        </div>
                      </td>
                    } @else {
                      <td>
                        <div class="finance-request-label">
                          <strong>{{ formatLabel(row.request.requestType) }}</strong>
                          @if (row.request.status !== 'APPROVED' && !row.request.canReviewAuthority) {
                            <span class="status" [ngClass]="statusClass(row.request.status)">
                              {{ formatLabel(row.request.status) }}
                            </span>
                          }
                        </div>
                      </td>
                      <td class="finance-amount">{{ financeAmount(row.request) }}</td>
                      <td class="finance-revision">{{ financeRevision(row.request) }}</td>
                      <td>{{ row.request.requestedByName | titlecase }}</td>
                      <td>{{ row.request.createdAt | date: 'dd MMM yy, h:mm a' }}</td>
                      <td class="actioner-cell">
                        <strong>{{ financeActionBy(row.request) ? (financeActionBy(row.request) | titlecase) : '—' }}</strong>
                        <small>{{ financeActionAt(row.request) ? (financeActionAt(row.request) | date: 'dd MMM yy, h:mm a') : '—' }}</small>
                      </td>
                      <td class="status-cell">
                        <div class="status-action-stack">
                          @if (row.request.status === 'APPROVED') {
                            <span class="status fixed-status approved">Approved</span>
                          } @else if (!row.request.canReviewAuthority) {
                            <span class="status fixed-status" [ngClass]="statusClass(row.request.status)">
                              {{ formatLabel(row.request.status) }}
                            </span>
                          }
                          @if (row.request.canReviewAuthority) {
                            <div class="actions">
                              <button
                                mat-flat-button
                                type="button"
                                class="submit-action-btn"
                                [disabled]="data.isSaving()"
                                (click)="reviewFinanceRequest(row.request, 'APPROVE')"
                              >
                                <mat-icon>check</mat-icon><span>Approve</span>
                              </button>
                              <button
                                mat-button
                                type="button"
                                class="reject-action-btn"
                                matTooltip="Reject Request"
                                [disabled]="data.isSaving()"
                                (click)="reviewFinanceRequest(row.request, 'REJECT')"
                              >
                                <mat-icon>close</mat-icon><span>Reject</span>
                              </button>
                            </div>
                          }
                        </div>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </main>

      <footer class="drawer-action-footer">
        <button mat-button type="button" class="btn-cancel-flat" (click)="close()">Close</button>
      </footer>
    </section>
  `,
  styles: [`
    :host {
      display: flex;
      width: 100%;
      height: 100%;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
      background: #fff;
      box-sizing: border-box;
    }

    ::ng-deep .mat-mdc-dialog-surface,
    ::ng-deep .mat-mdc-dialogContainer {
      border-radius: 0 !important;
      box-shadow: -4px 0 24px rgba(15, 23, 42, 0.08) !important;
    }

    .drawer-layout-shell {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;
      background: #fff;
    }

    /* Compact Header with Integrated Task Subtitle */
    .drawer-synchronized-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 56px !important;
      min-height: 56px !important;
      padding: 0 16px !important;
      background: #fff !important;
      border-bottom: 1px solid #e2e8f0;
      flex-shrink: 0;
      box-sizing: border-box;
    }

    .drawer-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .header-icon-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 7px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      color: #f97316;
      flex-shrink: 0;
    }

    .header-icon-badge mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }

    .header-title-stack {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .header-title-stack h2 {
      overflow: hidden;
      margin: 0;
      color: #0f172a;
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: -0.2px;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-subtitle {
      min-width: 0;
      overflow: hidden;
      color: #64748b;
      font-size: 0.72rem;
      font-weight: 600;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-subtitle-row {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 8px;
      margin-top: 2px;
    }

    .assignee-subtitle {
      flex: 0 0 auto;
      color: #475569;
      font-size: 0.68rem;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
    }

    .header-right-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .request-count-pill {
      padding: 2px 8px;
      border-radius: 999px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      color: #475569;
      font-size: 0.68rem;
      font-weight: 700;
    }

    .drawer-close-btn {
      width: 32px !important;
      height: 32px !important;
      padding: 0 !important;
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      color: #64748b;
      transition: all 0.15s ease;
    }

    .drawer-close-btn:hover {
      background: rgba(239, 68, 68, 0.08);
      color: #ef4444;
    }

    /* Compact Body */
    .dialog-body {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      padding: 14px 16px;
      background: #f8fafc;
      box-sizing: border-box;
    }

    .empty-state-box {
      display: flex;
      flex: 1 1 0;
      min-height: 0;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 36px 16px;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      background: #fff;
      color: #64748b;
      font-size: 0.78rem;
    }

    .empty-state-box mat-icon {
      color: #94a3b8;
      font-size: 26px;
      width: 26px;
      height: 26px;
    }

    /* High-Density Table */
    .budget-table-wrap {
      flex: 1 1 0;
      min-height: 0;
      overflow: auto;
      border: 1px solid #e2e8f0;
      border-radius: 7px;
      background: #fff;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
      scrollbar-width: thin;
      scrollbar-color: #cbd5e1 transparent;
      overscroll-behavior: contain;
    }

    .budget-table-wrap::-webkit-scrollbar { width: 5px; height: 5px; }
    .budget-table-wrap::-webkit-scrollbar-thumb { border-radius: 99px; background: #cbd5e1; }

    table {
      width: 100%;
      min-width: 720px;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.74rem;
    }

    .history-table {
      width: 100%;
      min-width: 940px;
      table-layout: fixed;
      font-size: 0.66rem;
    }

    .history-table th,
    .history-table td {
      padding: 6px;
      overflow-wrap: anywhere;
    }

    .history-table th:nth-child(1) { width: 5%; }
    .history-table th:nth-child(2) { width: 12%; }
    .history-table th:nth-child(3) { width: 10%; }
    .history-table th:nth-child(4) { width: 20%; }
    .history-table th:nth-child(5) { width: 12%; }
    .history-table th:nth-child(6) { width: 13%; }
    .history-table th:nth-child(7) { width: 14%; }
    .history-table th:nth-child(8) { width: 14%; }

    .finance-request-label {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    }

    .finance-amount {
      color: #0f172a;
      font-weight: 700;
    }

    .finance-revision {
      color: #c2410c;
      font-weight: 700;
      white-space: nowrap;
    }

    thead {
      position: sticky;
      top: 0;
      z-index: 1;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 2;
      padding: 7px 10px;
      border-bottom: 1px solid #e2e8f0;
      background: #f1f5f9;
      color: #475569;
      font-size: 0.63rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    td {
      padding: 8px 10px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
      vertical-align: middle;
    }

    tbody tr {
      transition: background-color 0.12s ease;
    }

    tbody tr:hover {
      background: #f8fafc;
    }

    tbody tr.is-actionable {
      background: #fffdf9;
    }

    tbody tr.is-actionable:hover {
      background: #fffbeb;
    }

    tbody tr:last-child td { border-bottom: 0; }

    .status-heading,
    .status-cell { text-align: right; }
    .actioner-cell strong,
    .actioner-cell small { display: block; }
    .actioner-cell strong {
      color: #0f172a;
      font-size: 0.68rem;
      font-weight: 600;
      line-height: 1.25;
    }
    .actioner-cell small {
      margin-top: 2px;
      color: #64748b;
      font-size: 0.6rem;
    }

    .request-id {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      color: #334155;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.66rem;
      font-weight: 700;
    }

    /* Compact Revision Column */
    .revision-flow {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .old-amt {
      color: #64748b;
      font-size: 0.71rem;
    }

    .arrow-icon {
      width: 13px;
      height: 13px;
      font-size: 13px;
      color: #94a3b8;
    }

    .new-amt {
      color: #0f172a;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .increase {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border: 1px solid #99f6e4;
      border-radius: 4px;
      background: #f0fdfa;
      color: #0f766e;
      font-size: 0.64rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .status {
      display: inline-flex;
      align-items: center;
      padding: 1px 7px;
      border: 1px solid transparent;
      border-radius: 999px;
      font-size: 0.63rem;
      font-weight: 600;
      line-height: 1.4;
      white-space: nowrap;
    }

    .status.fixed-status {
      width: 84px;
      height: 24px;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }

    .approved { border-color: #a7f3d0; background: #ecfdf5; color: #047857; }
    .pending,
    .partially-approved { border-color: #fde68a; background: #fffbeb; color: #b45309; }
    .rejected { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
    .cancelled { border-color: #cbd5e1; background: #f1f5f9; color: #475569; }
    /* Compact Inline Actions */
    .status-action-stack {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
    }

    .actions {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .actions .icon-action-btn {
      width: 28px !important;
      min-width: 28px !important;
      justify-content: center !important;
      gap: 0 !important;
      padding: 0 !important;
    }

    .actions .icon-action-btn .action-label {
      display: none !important;
    }

    .submit-action-btn {
      display: inline-flex !important;
      height: 26px !important;
      min-height: 26px !important;
      align-items: center !important;
      gap: 3px !important;
      padding: 0 9px !important;
      border-radius: 5px !important;
      background-color: #16a34a !important;
      color: #fff !important;
      font-size: 0.68rem !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      box-shadow: 0 1px 2px rgba(22, 163, 74, 0.2) !important;
      transition: all 0.15s ease !important;
      white-space: nowrap;
    }

    .submit-action-btn mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
      margin: 0 !important;
    }

    .submit-action-btn:hover:not([disabled]) {
      background-color: #15803d !important;
    }

    .submit-action-btn[disabled] {
      background-color: #e2e8f0 !important;
      color: #94a3b8 !important;
      box-shadow: none !important;
      cursor: not-allowed;
    }

    .reject-action-btn {
      display: inline-flex !important;
      height: 26px !important;
      min-height: 26px !important;
      min-width: auto !important;
      align-items: center !important;
      gap: 2px !important;
      padding: 0 8px !important;
      border: 1px solid #fecaca !important;
      border-radius: 5px !important;
      background: #fef2f2 !important;
      color: #b91c1c !important;
      font-size: 0.68rem !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      white-space: nowrap;
    }

    .reject-action-btn mat-icon {
      width: 13px;
      height: 13px;
      font-size: 13px;
      margin: 0 !important;
    }

    .reject-action-btn:hover:not([disabled]) { background: #fee2e2 !important; }
    .reject-action-btn[disabled] { cursor: not-allowed; opacity: 0.55; }

    /* Compact Footer */
    .drawer-action-footer {
      display: flex;
      flex: 0 0 auto;
      height: 46px;
      min-height: 46px;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 0 16px;
      border-top: 1px solid #e2e8f0;
      background: #fff;
      box-sizing: border-box;
    }

    .btn-cancel-flat {
      height: 30px !important;
      min-height: 30px !important;
      padding: 0 14px !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 5px !important;
      color: #475569 !important;
      font-size: 0.72rem !important;
      font-weight: 700 !important;
    }

    .btn-cancel-flat:hover {
      background: #f1f5f9 !important;
      color: #0f172a !important;
    }

    @media (max-width: 600px) {
      .dialog-body { padding: 10px; }
      th, td { padding: 7px 6px; }
    }
  `]
})
export class TaskBudgetRequestsDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<TaskBudgetRequestsDialogComponent>);
  public readonly data = inject<TaskBudgetRequestsDialogData>(MAT_DIALOG_DATA);

  public close(): void {
    this.dialogRef.close();
  }

  public reviewRequest(request: TaskBudgetRequest, decision: 'APPROVE' | 'REJECT'): void {
    this.data.reviewRequest(request, decision);
  }

  public reviewFinanceRequest(request: TaskFinanceRequest, decision: 'APPROVE' | 'REJECT'): void {
    this.data.reviewFinanceRequest(request, decision);
  }

  public cancelRequest(request: TaskBudgetRequest): void {
    this.data.cancelRequest(request);
  }

  public historyRows(): BudgetIncreaseHistoryRow[] {
    const financeRequests = [...this.data.financeRequests()]
      .sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id - right.id
      );
    const representedBudgetRequestIds = getTopUpSourceBudgetRequestIds(financeRequests);
    const budgetRows: BudgetIncreaseHistoryRow[] = this.data.requests()
      .filter((request) => request.status !== 'PENDING' && !representedBudgetRequestIds.has(request.id))
      .map((request) => ({
        kind: 'budget',
        key: `budget-${request.id}`,
        id: request.id,
        createdAt: request.createdAt,
        request
      }));
    const initialAdvance = createInitialAdvanceHistoryRequest(financeRequests, this.data.requests());
    const allFinanceRequests = initialAdvance
      ? [initialAdvance, ...financeRequests]
      : financeRequests;
    const financeRows: BudgetIncreaseHistoryRow[] = allFinanceRequests.map((request) => ({
      kind: 'finance',
      key: `finance-${request.id}`,
      id: request.id,
      createdAt: request.createdAt,
      request
    }));

    return [...budgetRows, ...financeRows].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id - right.id ||
      left.kind.localeCompare(right.kind)
    );
  }

  public financeAmount(request: TaskFinanceRequest): string {
    const requested = Number(request.requestedAmount);
    const approved = Number(request.approvedAmount ?? request.requestedAmount);
    const requestedLabel = `₹${this.money(requested)}`;
    return requested === approved
      ? requestedLabel
      : `${requestedLabel} → ₹${this.money(approved)}`;
  }

  public financeRevision(request: TaskFinanceRequest): string {
    const revision = getTaskFinanceRequestRevision(request, this.data.requests());
    if (revision) {
      return `₹${this.money(revision.previousBudget)} → ₹${this.money(revision.newBudget)}`;
    }
    return `₹0 → ₹${this.money(request.approvedAmount ?? request.requestedAmount)}`;
  }

  public financeActionBy(request: TaskFinanceRequest): string | null {
    return request.authorityReviewedByName || request.reviewedByName;
  }

  public financeActionAt(request: TaskFinanceRequest): string | null {
    return request.authorityReviewedAt || request.reviewedAt;
  }

  public budgetActionAt(request: TaskBudgetRequest): string | null {
    return request.authorityReviewedAt || request.creatorReviewedAt;
  }

  public money(value: string | number): string {
    return Math.round(Number(value || 0)).toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
  }

  public formatLabel(raw: string): string {
    return raw.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  public actionByName(request: TaskBudgetRequest): string | null {
    return request.actionByName || request.authorityReviewedByName || request.creatorReviewedByName;
  }

  public shouldShowStatus(request: TaskBudgetRequest): boolean {
    const hasAction = request.canReviewCreator || request.canReviewAuthority || request.canCancel;
    const showsPending = this.data.isTreasurer
      ? request.status !== 'APPROVED'
      : request.status === 'PENDING' && request.approvalStage !== 'CREATOR';
    return !(hasAction && showsPending);
  }

  public displayedStatus(request: TaskBudgetRequest): { status: string; label: string } {
    const isFinalStatus = ['APPROVED', 'REJECTED', 'CANCELLED', 'CANCELED'].includes(request.status);
    if (this.data.isTreasurer && !isFinalStatus) {
      return { status: 'PENDING', label: 'Pending' };
    }

    return {
      status: request.status,
      label: request.status === 'PENDING' && request.approvalStage === 'CREATOR' && !this.data.isTreasurer
        ? 'Creator Review'
        : this.formatLabel(request.status)
    };
  }

  public statusClass(status: string): string {
    switch (status) {
      case 'APPROVED': return 'approved';
      case 'PENDING':
      case 'PARTIALLY_APPROVED': return 'partially-approved';
      case 'REJECTED': return 'rejected';
      case 'CANCELLED':
      case 'CANCELED': return 'cancelled';
      default: return '';
    }
  }
}