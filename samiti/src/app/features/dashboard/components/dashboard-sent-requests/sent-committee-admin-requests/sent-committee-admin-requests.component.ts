import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSortModule, Sort } from "@angular/material/sort";
import { SentCommitteeAdminRequestsService, SentCommitteeAdminRequestItem } from "./sent-committee-admin-requests.service";
import { ConfirmDialogData } from "../../../../../components/dialog/confirm/confirm-dialog.models";
import { ConfirmDialogService } from "../../../../../components/dialog/confirm/confirm-dialog.service";

@Component({
  selector: "app-sent-committee-admin-requests",
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSortModule,
  ],
  templateUrl: "./sent-committee-admin-requests.component.html",
  styleUrls: ["../../dashboard-sent-requests/dashboard-sent-requests.scss"],
})
export class SentCommitteeAdminRequestsComponent {
  private readonly service = inject(SentCommitteeAdminRequestsService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  isLoading = signal(false);
  requests = signal<SentCommitteeAdminRequestItem[]>([]);

  sort = signal<Sort>({ active: '', direction: '' });
  sortedRequests = computed(() => this.applySort(this.requests(), this.sort()));
  columns = ["index", "actions", "committee", "year", "sentOn", "resolvedOn", "resolvedBy"];

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.service.getSentCommitteeAdminRequests().subscribe({
      next: (data) => this.requests.set(data || []),
      error: (err: any) => console.error("Failed to load sent admin requests:", err),
      complete: () => this.isLoading.set(false)
    });
  }

  cancelRequest(committeeId: string, committeeName: string): void {
    const dialogData: ConfirmDialogData = {
      title: "Cancel Request",
      message: "Are you sure you want to cancel your admin request?",
      confirmText: "Cancel",
      cancelText: "Keep",
      highlightText: committeeName,
    };

    this.confirmDialog.open(dialogData).afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.isLoading.set(true);
      this.service.cancelSubmittedCommitteeMembershipRequest(Number(committeeId)).subscribe({
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

  private applySort(items: SentCommitteeAdminRequestItem[], sort: Sort): SentCommitteeAdminRequestItem[] {
    if (!sort.active || !sort.direction) return items;
    return [...items].sort((a, b) => {
      let valA = '';
      let valB = '';
      switch (sort.active) {
        case 'committee':  valA = a.committeeName ?? '';                              valB = b.committeeName ?? ''; break;
        case 'year':       valA = a.establishYear ? String(a.establishYear) : '';    valB = b.establishYear ? String(b.establishYear) : ''; break;
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
