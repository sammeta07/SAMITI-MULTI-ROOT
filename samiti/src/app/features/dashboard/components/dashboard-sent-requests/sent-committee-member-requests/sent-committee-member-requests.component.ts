import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";
import { SentCommitteeMemberRequestsService, SentCommitteeMemberRequestItem } from "./sent-committee-member-requests.service";
import { ConfirmDialogData } from "../../../../../components/dialog/confirm/confirm-dialog.models";
import { ConfirmDialogService } from "../../../../../components/dialog/confirm/confirm-dialog.service";

@Component({
  selector: "app-sent-committee-member-requests",
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: "./sent-committee-member-requests.component.html",
  styleUrls: ["../../dashboard-sent-requests/dashboard-sent-requests.scss"],
})
export class SentCommitteeMemberRequestsComponent {
  private readonly service = inject(SentCommitteeMemberRequestsService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  isLoading = signal(false);
  requests = signal<SentCommitteeMemberRequestItem[]>([]);

  sortActive = signal('');
  sortDirection = signal<'asc' | 'desc'>('desc');

  readonly sortedRequests = computed<SentCommitteeMemberRequestItem[]>(() => {
    const items = this.requests();
    const active = this.sortActive();
    const dir = this.sortDirection();

    if (!active) {
      return items;
    }

    return [...items].sort((a, b) => {
      let valA = '';
      let valB = '';
      switch (active) {
        case 'committee':  valA = a.committeeName ?? '';                              valB = b.committeeName ?? ''; break;
        case 'year':       valA = a.establishYear ? String(a.establishYear) : '';    valB = b.establishYear ? String(b.establishYear) : ''; break;
        case 'sentOn':     valA = a.requestSentTime ?? '';                            valB = b.requestSentTime ?? ''; break;
        case 'resolvedOn': valA = a.resolvedAtTime ?? '';                             valB = b.resolvedAtTime ?? ''; break;
        case 'resolvedBy': valA = a.resolvedByName ?? '';                             valB = b.resolvedByName ?? ''; break;
        case 'actions':    valA = a.status ?? '';                                     valB = b.status ?? ''; break;
      }
      const cmp = valA.localeCompare(valB);
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.service.getSentCommitteeMemberRequests().subscribe({
      next: (data) => this.requests.set(data || []),
      error: (err: any) => console.error("Failed to load sent member requests:", err),
      complete: () => this.isLoading.set(false)
    });
  }

  cancelRequest(committeeId: number, committeeName: string): void {
    const dialogData: ConfirmDialogData = {
      title: "Cancel Request",
      message: "Are you sure you want to cancel your membership request?",
      confirmText: "Cancel",
      cancelText: "Keep",
      highlightText: committeeName,
    };

    this.confirmDialog.open(dialogData).afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.isLoading.set(true);
      this.service.cancelSubmittedCommitteeMembershipRequest(committeeId).subscribe({
        next: () => this.loadData(),
        error: (err: any) => {
          console.error("Failed to cancel request:", err);
          this.isLoading.set(false);
        }
      });
    });
  }

  getInitials(name: string): string {
    return (name || "N")
      .split(" ")
      .map((n) => n.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  setSort(column: string): void {
    if (this.sortActive() === column) {
      this.sortDirection.update(dir => dir === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortActive.set(column);
      this.sortDirection.set('desc');
    }
  }
}
