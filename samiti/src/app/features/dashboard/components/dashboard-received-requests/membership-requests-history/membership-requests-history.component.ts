import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MembershipRequestsHistoryService, CommitteeMembershipRequestHistoryItem } from "./membership-requests-history.service";

interface ExpandedRowState {
  loading: boolean;
  history: CommitteeMembershipRequestHistoryItem[];
}

type ExpandedKey = string;

function expandedKey(userId: number, committeeId: number): ExpandedKey {
  return `${userId}-${committeeId}`;
}

@Component({
  selector: "app-membership-requests-history",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: "./membership-requests-history.component.html",
  styleUrls: ["./membership-requests-history.component.scss", "../../dashboard-received-requests/dashboard-received-requests.scss"],
})
export class MembershipRequestsHistoryComponent {
  private readonly service = inject(MembershipRequestsHistoryService);

  isLoading = signal(false);
  history = signal<CommitteeMembershipRequestHistoryItem[]>([]);
  sortActive = signal('');
  sortDirection = signal<'asc' | 'desc'>('desc');
  expandedRows = signal<Set<number>>(new Set());
  expandedRowDetails = signal<Map<ExpandedKey, ExpandedRowState>>(new Map());

  readonly sortedHistory = computed<CommitteeMembershipRequestHistoryItem[]>(() => {
    const items = this.history();
    const active = this.sortActive();
    const dir = this.sortDirection();

    if (!active) {
      return items;
    }

    return [...items].sort((a, b) => {
      let valA = '';
      let valB = '';
      switch (active) {
        case 'committee':
          valA = a.committeeName ?? '';
          valB = b.committeeName ?? '';
          break;
        case 'user':
          valA = a.userDetails?.name ?? '';
          valB = b.userDetails?.name ?? '';
          break;
        case 'requestRole':
          valA = a.requestRole ?? '';
          valB = b.requestRole ?? '';
          break;
        case 'sentOn':
          valA = a.requestSentTime ?? '';
          valB = b.requestSentTime ?? '';
          break;
        case 'resolvedOn':
          valA = a.resolvedAtTime ?? '';
          valB = b.resolvedAtTime ?? '';
          break;
        case 'status':
          valA = a.status ?? '';
          valB = b.status ?? '';
          break;
        default:
          break;
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
    this.service.getReceivedRequestsHistory().subscribe({
      next: (data) => this.history.set(data || []),
      error: (err: any) => console.error("Failed to load requests history:", err),
      complete: () => this.isLoading.set(false)
    });
  }

  setSort(column: string): void {
    if (this.sortActive() === column) {
      this.sortDirection.update(dir => dir === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortActive.set(column);
      this.sortDirection.set('desc');
    }
  }

  getInitials(name: string): string {
    return (name || "N")
      .split(" ")
      .map((n) => n.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  isExpanded(index: number): boolean {
    return this.expandedRows().has(index);
  }

  toggleExpand(index: number): void {
    const current = new Set(this.expandedRows());
    const item = this.sortedHistory()[index];

    if (current.has(index)) {
      current.delete(index);
      this.expandedRows.set(current);
      return;
    }

    current.add(index);
    this.expandedRows.set(current);

    if (!item) {
      return;
    }

    const userId = item.userDetails.userId;
    const committeeId = item.committeeId;
    const key = expandedKey(userId, committeeId);
    const detailsMap = new Map(this.expandedRowDetails());
    const existing = detailsMap.get(key);

    if (existing && existing.history.length > 0) {
      return;
    }

    detailsMap.set(key, { loading: true, history: [] });
    this.expandedRowDetails.set(detailsMap);

    this.service.getReceivedRequestsHistoryByUserId(userId, committeeId).subscribe({
      next: (data) => {
        const map = new Map(this.expandedRowDetails());
        map.set(key, { loading: false, history: data || [] });
        this.expandedRowDetails.set(map);
      },
      error: (err: any) => {
        console.error("Failed to load expanded history:", err);
        const map = new Map(this.expandedRowDetails());
        map.set(key, { loading: false, history: [] });
        this.expandedRowDetails.set(map);
      }
    });
  }

  getExpandedState(userId: number, committeeId: number): ExpandedRowState {
    const key = expandedKey(userId, committeeId);
    return this.expandedRowDetails().get(key) || { loading: false, history: [] };
  }

  trackByIndex(_index: number, _item: any): number {
    return _index;
  }
}
