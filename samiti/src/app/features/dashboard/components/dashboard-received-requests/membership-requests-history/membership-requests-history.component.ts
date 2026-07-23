import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTableModule } from "@angular/material/table";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSortModule, Sort } from "@angular/material/sort";
import { MembershipRequestsHistoryService, CommitteeMembershipRequestHistoryItem } from "./membership-requests-history.service";


@Component({
  selector: "app-membership-requests-history",
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSortModule,
  ],
  templateUrl: "./membership-requests-history.component.html",
  styleUrls: ["../../dashboard-received-requests/dashboard-received-requests.scss"],
})
export class MembershipRequestsHistoryComponent {
  private readonly service = inject(MembershipRequestsHistoryService);

  isLoading = signal(false);
  history = signal<CommitteeMembershipRequestHistoryItem[]>([]);

  sort = signal<Sort>({ active: '', direction: '' });
  sortedHistory = computed(() => this.applySort(this.history(), this.sort()));
  columns = ["index", "committee", "user", "requestRole", "sentOn", "resolvedOn", "status"];

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.service.getReceivedRequestsHistory().subscribe({
      next: (data) => this.history.set(data || []),
      error: (err: any) => console.error("Failed to load requests history:", err),
      complete: () => this.isLoading.set(false)
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

  private applySort(items: CommitteeMembershipRequestHistoryItem[], sort: Sort): CommitteeMembershipRequestHistoryItem[] {
    if (!sort.active || !sort.direction) return items;
    return [...items].sort((a, b) => {
      let valA = '';
      let valB = '';
      switch (sort.active) {
        case 'committee':   valA = a.committeeName ?? '';                            valB = b.committeeName ?? ''; break;
        case 'user':        valA = a.userDetails?.name ?? '';                        valB = b.userDetails?.name ?? ''; break;
        case 'requestRole': valA = a.requestRole ?? '';                              valB = b.requestRole ?? ''; break;
        case 'sentOn':      valA = a.requestSentTime ?? '';                          valB = b.requestSentTime ?? ''; break;
        case 'resolvedOn':  valA = a.resolvedAtTime ?? '';                           valB = b.resolvedAtTime ?? ''; break;
        case 'status':      valA = a.status ?? '';                                   valB = b.status ?? ''; break;
      }
      const cmp = valA.localeCompare(valB);
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }
}
