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
  selector: "app-dashboard-sent-requests",
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
  templateUrl: "./dashboard-sent-requests.html",
  styleUrls: ["./dashboard-sent-requests.scss"],
})
export class DashboardSentRequestsComponent {
  private service = inject(DashboardRequestsService);
  private confirmDialog = inject(ConfirmDialogService);

  isLoading = signal(false);

  sentRequests = signal<any[]>([]);

  sentAdminRequests = computed(() =>
    this.sentRequests()
      .filter((r) => r.requestType === "COMMITTEE_ADMIN")
      .sort((a, b) => new Date(b.requestSentTime).getTime() - new Date(a.requestSentTime).getTime())
  );

  sentMemberRequests = computed(() =>
    this.sentRequests()
      .filter((r) => r.requestType === "COMMITTEE_MEMBER")
      .sort((a, b) => new Date(b.requestSentTime).getTime() - new Date(a.requestSentTime).getTime())
  );

  sortSA = signal<Sort>({ active: '', direction: '' });
  sortSM = signal<Sort>({ active: '', direction: '' });

  sortedSentAdminRequests      = computed(() => this.applySort(this.sentAdminRequests(),      this.sortSA()));
  sortedSentMemberRequests     = computed(() => this.applySort(this.sentMemberRequests(),     this.sortSM()));

  sentColumns = ["index", "actions", "committee", "year", "sentOn", "resolvedOn", "resolvedBy"];

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.service.getSentCommitteeMembershipRequestsByLoggedInUser().toPromise()
      .then((sent) => {
        this.sentRequests.set(sent || []);
      })
      .catch((err: any) => console.error("Failed to load requests:", err))
      .finally(() => this.isLoading.set(false));
  }

  cancelSentRequest(committeeId: string, committeeName: string): void {
    const dialogData: ConfirmDialogData = {
      title: "Cancel Request",
      message: `Are you sure you want to cancel your request to join "${committeeName}"?`,
      confirmText: "Cancel Request",
      cancelText: "Keep Request",
    };

    this.confirmDialog.open(dialogData).afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

      this.isLoading.set(true);
      this.service
        .cancelSubmittedCommitteeMembershipRequest(Number(committeeId))
        .toPromise()
        .then(() => this.loadData())
        .catch((err: any) => {
          console.error("Failed to cancel request:", err);
          this.isLoading.set(false);
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
