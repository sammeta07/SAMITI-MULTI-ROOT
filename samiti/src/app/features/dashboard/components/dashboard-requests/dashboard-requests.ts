import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTabsModule } from "@angular/material/tabs";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
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

  /** Table columns */
  receivedAdminColumns = ["index", "committee", "user", "mobile", "sentOn", "resolvedOn", "resolvedBy", "actions"];
  receivedColumns = ["index", "committee", "user", "mobile", "sentOn", "resolvedOn", "resolvedBy", "actions"];
  sentColumns = ["index", "committee", "user", "year", "sentOn", "resolvedOn", "resolvedBy", "actions"];
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
}
