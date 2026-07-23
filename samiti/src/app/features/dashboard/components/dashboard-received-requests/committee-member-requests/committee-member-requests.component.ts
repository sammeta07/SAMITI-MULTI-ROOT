import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSortModule, Sort } from "@angular/material/sort";
import { CommitteeMemberRequestsService, ReceivedCommitteeMembershipRequestItem, TakeActionOnCommitteeMembershipRequestBody } from "./committee-member-requests.service";
import { ConfirmDialogData } from "../../../../../components/dialog/confirm/confirm-dialog.models";
import { ConfirmDialogService } from "../../../../../components/dialog/confirm/confirm-dialog.service";


@Component({
  selector: "app-committee-member-requests",
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSortModule,
  ],
  templateUrl: "./committee-member-requests.component.html",
  styleUrls: ["../../dashboard-received-requests/dashboard-received-requests.scss"],
})
export class CommitteeMemberRequestsComponent {
  private readonly service = inject(CommitteeMemberRequestsService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  isLoading = signal(false);
  requests = signal<ReceivedCommitteeMembershipRequestItem[]>([]);

  sort = signal<Sort>({ active: '', direction: '' });
  sortedRequests = computed(() => this.applySort(this.requests(), this.sort()));
  columns = ["index", "actions", "committee", "user", "mobile", "sentOn", "resolvedOn", "resolvedBy"];

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.service.getReceivedCommitteeMemberRequests().subscribe({
      next: (data) => this.requests.set(data || []),
      error: (err: any) => console.error("Failed to load member requests:", err),
      complete: () => this.isLoading.set(false)
    });
  }

  approveRequest(committeeId: string, userId: string): void {
    const dialogData: ConfirmDialogData = {
      title: "Accept Request",
      message: "Are you sure you want to accept this membership request?",
      confirmText: "Accept",
      cancelText: "Cancel",
    };

    this.confirmDialog.open(dialogData).afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.takeAction(committeeId, userId, "ACCEPTED", "approve");
    });
  }

  rejectRequest(committeeId: string, userId: string): void {
    const dialogData: ConfirmDialogData = {
      title: "Reject Request",
      message: "Are you sure you want to reject this membership request?",
      confirmText: "Reject",
      cancelText: "Cancel",
    };

    this.confirmDialog.open(dialogData).afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.takeAction(committeeId, userId, "REJECTED", "reject");
    });
  }

  private takeAction(committeeId: string, userId: string, decisionAction: "ACCEPTED" | "REJECTED", label: string): void {
    this.isLoading.set(true);
    const body: TakeActionOnCommitteeMembershipRequestBody = {
      committeeId: Number(committeeId),
      targetUserId: Number(userId),
      decisionAction
    };
    this.service.takeActionOnCommitteeMembershipRequest(body).subscribe({
      next: () => this.loadData(),
      error: (err: any) => {
        console.error(`Failed to ${label} request:`, err);
        this.isLoading.set(false);
      }
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

  private applySort(items: ReceivedCommitteeMembershipRequestItem[], sort: Sort): ReceivedCommitteeMembershipRequestItem[] {
    if (!sort.active || !sort.direction) return items;
    return [...items].sort((a, b) => {
      let valA = '';
      let valB = '';
      switch (sort.active) {
        case 'committee':  valA = a.committeeName ?? '';                              valB = b.committeeName ?? ''; break;
        case 'user':       valA = a.userDetails?.name ?? '';                          valB = b.userDetails?.name ?? ''; break;
        case 'sentOn':     valA = a.requestSentTime ?? '';                            valB = b.requestSentTime ?? ''; break;
        case 'resolvedOn': valA = a.resolvedAtTime ?? '';                             valB = b.resolvedAtTime ?? ''; break;
        case 'resolvedBy': valA = a.resolvedByName ?? '';                             valB = b.resolvedByName ?? ''; break;
        case 'actions':    valA = a.status ?? '';                                     valB = b.status ?? ''; break;
      }
      const cmp = valA.localeCompare(valB);
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }
}
