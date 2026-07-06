import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTabsModule } from "@angular/material/tabs";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSortModule, Sort } from "@angular/material/sort";
import { DashboardRequestsService } from "./dashboard-requests.service";

@Component({
  selector: "app-dashboard-requests",
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatExpansionModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSortModule,
  ],
  templateUrl: "./dashboard-requests.html",
  styleUrls: ["./dashboard-requests.scss"],
})
export class DashboardRequestsComponent {
  private service = inject(DashboardRequestsService);

  isLoading = signal(false);

  /** Query Data */
  receivedRequests = signal<any[]>([]);
  sentRequests = signal<any[]>([]);
  /** Computed: Received Tab - Admin Requests */
  receivedAdminRequests = computed(() =>
    this.receivedRequests()
      .filter((r) => r.requestType === "COMMITTEE_ADMIN")
      .sort((a, b) => new Date(b.requestSentTime).getTime() - new Date(a.requestSentTime).getTime())
  );

  /** Computed: Received Tab - Member Requests */
  receivedMemberRequests = computed(() =>
    this.receivedRequests()
      .filter((r) => r.requestType === "COMMITTEE_MEMBER")
      .sort((a, b) => new Date(b.requestSentTime).getTime() - new Date(a.requestSentTime).getTime())
  );

  /** Computed: Sent Tab - Admin Requests */
  sentAdminRequests = computed(() =>
    this.sentRequests()
      .filter((r) => r.requestType === "COMMITTEE_ADMIN")
      .sort((a, b) => new Date(b.requestSentTime).getTime() - new Date(a.requestSentTime).getTime())
  );

  /** Computed: Sent Tab - Member Requests */
  sentMemberRequests = computed(() =>
    this.sentRequests()
      .filter((r) => r.requestType === "COMMITTEE_MEMBER")
      .sort((a, b) => new Date(b.requestSentTime).getTime() - new Date(a.requestSentTime).getTime())
  );

  /** Sort states per table */
  sortRA = signal<Sort>({ active: '', direction: '' });
  sortRM = signal<Sort>({ active: '', direction: '' });
  sortSA = signal<Sort>({ active: '', direction: '' });
  sortSM = signal<Sort>({ active: '', direction: '' });

  /** Sorted table data */
  sortedReceivedAdminRequests  = computed(() => this.applySort(this.receivedAdminRequests(),  this.sortRA()));
  sortedReceivedMemberRequests = computed(() => this.applySort(this.receivedMemberRequests(), this.sortRM()));
  sortedSentAdminRequests      = computed(() => this.applySort(this.sentAdminRequests(),      this.sortSA()));
  sortedSentMemberRequests     = computed(() => this.applySort(this.sentMemberRequests(),     this.sortSM()));

  /** Table columns */
  receivedAdminColumns = ["index", "committee", "user", "mobile", "sentOn", "resolvedOn", "resolvedBy", "actions"];
  receivedColumns = ["index", "committee", "user", "mobile", "sentOn", "resolvedOn", "resolvedBy", "actions"];
  sentColumns = ["index", "committee", "year", "sentOn", "resolvedOn", "resolvedBy", "actions"];
  constructor() {
    this.loadData();
  }

  /** Load all three queries */
  private loadData(): void {
    this.isLoading.set(true);
    Promise.all([
      this.service.getReceivedCommitteeMembershipRequestsForAdminCommittees().toPromise(),
      this.service.getSentCommitteeMembershipRequestsByLoggedInUser().toPromise(),
    ])
      .then(([received, sent]) => {
        this.receivedRequests.set(received || []);
        this.sentRequests.set(sent || []);
      })
      .catch((err: any) => console.error("Failed to load requests:", err))
      .finally(() => this.isLoading.set(false));
  }

  approveRequest(committeeId: string, userId: string): void {
    this.isLoading.set(true);
    this.service
      .takeActionOnCommitteeMembershipRequest({
        committeeId: Number(committeeId),
        targetUserId: Number(userId),
        decisionAction: "ACCEPTED"
      })
      .toPromise()
      .then(() => this.loadData())
      .catch((err: any) => {
        console.error("Failed to approve request:", err);
        this.isLoading.set(false);
      });
  }

  rejectRequest(committeeId: string, userId: string): void {
    this.isLoading.set(true);
    this.service
      .takeActionOnCommitteeMembershipRequest({
        committeeId: Number(committeeId),
        targetUserId: Number(userId),
        decisionAction: "REJECTED"
      })
      .toPromise()
      .then(() => this.loadData())
      .catch((err: any) => {
        console.error("Failed to reject request:", err);
        this.isLoading.set(false);
      });
  }

  cancelSentRequest(committeeId: string, committeeName: string): void {
    const confirm = window.confirm(`Cancel request to join "${committeeName}"?`);
    if (!confirm) return;
    this.isLoading.set(true);
    this.service
      .cancelSubmittedCommitteeMembershipRequest(Number(committeeId))
      .toPromise()
      .then(() => this.loadData())
      .catch((err: any) => {
        console.error("Failed to cancel request:", err);
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
