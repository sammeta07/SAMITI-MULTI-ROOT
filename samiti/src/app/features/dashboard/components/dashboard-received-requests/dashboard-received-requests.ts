import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSortModule, Sort } from "@angular/material/sort";
import { DashboardRequestsService } from "../dashboard-requests/dashboard-requests.service";
import { MatTabsModule } from "@angular/material/tabs";
import { ConfirmDialogService } from "../../../../components/dialog/confirm/confirm-dialog.service";
import { ConfirmDialogData } from "../../../../components/dialog/confirm/confirm-dialog.models";


@Component({
  selector: "app-dashboard-received-requests",
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSortModule,
  ],
  templateUrl: "./dashboard-received-requests.html",
  styleUrls: ["./dashboard-received-requests.scss"],
})
export class DashboardReceivedRequestsComponent {
  private service = inject(DashboardRequestsService);
  private confirmDialog = inject(ConfirmDialogService);

  isLoading = signal(false);

  receivedRequests = signal<any[]>([]);

  receivedAdminRequests = computed(() =>
    this.receivedRequests()
      .filter((r) => r.requestRole === "COMMITTEE_ADMIN")
      .sort((a, b) => new Date(b.requestSentTime).getTime() - new Date(a.requestSentTime).getTime())
  );


  receivedMemberRequests = computed(() =>
    this.receivedRequests()
      .filter((r) => r.requestRole === "COMMITTEE_MEMBER")
      .sort((a, b) => new Date(b.requestSentTime).getTime() - new Date(a.requestSentTime).getTime())
  );

  sortRA = signal<Sort>({ active: '', direction: '' });
  sortRM = signal<Sort>({ active: '', direction: '' });

  sortedReceivedAdminRequests  = computed(() => this.applySort(this.receivedAdminRequests(),  this.sortRA()));
  sortedReceivedMemberRequests = computed(() => this.applySort(this.receivedMemberRequests(), this.sortRM()));
  receivedAdminColumns = ["index", "actions", "committee", "user", "mobile", "sentOn", "resolvedOn", "resolvedBy"];

  receivedColumns = ["index", "actions", "committee", "user", "mobile", "sentOn", "resolvedOn", "resolvedBy"];

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.service.getReceivedCommitteeMembershipRequestsForAdminCommittees().toPromise()
      .then((received) => {
        this.receivedRequests.set(received || []);
      })
      .catch((err: any) => console.error("Failed to load requests:", err))
      .finally(() => this.isLoading.set(false));
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
    this.service
      .takeActionOnCommitteeMembershipRequest({
        committeeId: Number(committeeId),
        targetUserId: Number(userId),
        decisionAction
      })
      .toPromise()
      .then(() => this.loadData())
      .catch((err: any) => {
        console.error(`Failed to ${label} request:`, err);
        this.isLoading.set(false);
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

  private applySort(items: any[], sort: Sort): any[] {
    if (!sort.active || !sort.direction) return items;
    return [...items].sort((a, b) => {
      let valA = '';
      let valB = '';
      switch (sort.active) {
        case 'committee':  valA = a.committeeName ?? '';                              valB = b.committeeName ?? ''; break;
        case 'user':       valA = a.userDetails?.name ?? a.requesterName ?? '';       valB = b.userDetails?.name ?? b.requesterName ?? ''; break;
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
