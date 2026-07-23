import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTableModule } from "@angular/material/table";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSortModule, Sort } from "@angular/material/sort";
import { SentRequestsHistoryService, SentRequestsHistoryItem } from "./sent-requests-history.service";

@Component({
  selector: "app-sent-requests-history",
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSortModule,
  ],
  templateUrl: "./sent-requests-history.component.html",
  styleUrls: ["../../dashboard-sent-requests/dashboard-sent-requests.scss"],
})
export class SentRequestsHistoryComponent {
  private readonly service = inject(SentRequestsHistoryService);

  isLoading = signal(false);
  history = signal<SentRequestsHistoryItem[]>([]);

  sort = signal<Sort>({ active: '', direction: '' });
  sortedHistory = computed(() => this.applySort(this.history(), this.sort()));
  columns = ["index", "committee", "year", "type", "sentOn", "resolvedOn", "status"];

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.service.getSentRequestsHistory().subscribe({
      next: (data) => this.history.set(data || []),
      error: (err: any) => console.error("Failed to load sent requests history:", err),
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

  private applySort(items: SentRequestsHistoryItem[], sort: Sort): SentRequestsHistoryItem[] {
    if (!sort.active || !sort.direction) return items;
    return [...items].sort((a, b) => {
      let valA = '';
      let valB = '';
      switch (sort.active) {
        case 'committee':   valA = a.committeeName ?? '';                            valB = b.committeeName ?? ''; break;
        case 'year':        valA = a.establishYear ? String(a.establishYear) : '';  valB = b.establishYear ? String(b.establishYear) : ''; break;
        case 'type':        valA = a.requestType ?? '';                              valB = b.requestType ?? ''; break;
        case 'sentOn':      valA = a.requestSentTime ?? '';                          valB = b.requestSentTime ?? ''; break;
        case 'resolvedOn':  valA = a.resolvedAtTime ?? '';                           valB = b.resolvedAtTime ?? ''; break;
        case 'status':      valA = a.status ?? '';                                   valB = b.status ?? ''; break;
      }
      const cmp = valA.localeCompare(valB);
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }
}
