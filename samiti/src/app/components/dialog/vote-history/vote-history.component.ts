import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbar } from '@angular/material/toolbar';
import { EventVoteHistory } from '../../../features/dashboard/components/event-details/event-details.service';

export interface VoteHistoryDialogData {
  history: EventVoteHistory;
  eventLogo?: string | null;
}

@Component({
  selector: 'app-vote-history-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatToolbar
  ],
  templateUrl: './vote-history.component.html',
  styleUrl: './vote-history.component.scss'
})
export class VoteHistoryDialogComponent {
  public readonly dialogData: VoteHistoryDialogData = inject(MAT_DIALOG_DATA);
  public readonly data: EventVoteHistory = this.dialogData.history;

  public sortColumn: 'name' | 'role' | 'status' = 'name';
  public sortDirection: 'asc' | 'desc' = 'asc';

  constructor(
    public dialogRef: MatDialogRef<VoteHistoryDialogComponent>
  ) { }

  public onClose(): void {
    this.dialogRef.close();
  }

  public roleLabel(committeeRole: string): string {
    const role = String(committeeRole || '').toUpperCase();
    if (role === 'COMMITTEE_MASTER_ADMIN') {
      return 'MASTER';
    }
    if (role === 'COMMITTEE_ADMIN') {
      return 'ADMIN';
    }
    return 'MEMBER';
  }

  public roleClass(committeeRole: string): string {
    const role = String(committeeRole || '').toUpperCase();
    if (role === 'COMMITTEE_MASTER_ADMIN') {
      return 'role-master';
    }
    if (role === 'COMMITTEE_ADMIN') {
      return 'role-admin';
    }
    return 'role-member';
  }

  public titleCaseName(name: string): string {
    return String(name || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  public votePercent(): number {
    const total = this.data.totalMembers || 0;
    if (total === 0) {
      return 0;
    }
    return Math.round((this.data.votedCount / total) * 100);
  }

  public onSort(column: 'name' | 'role' | 'status'): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
  }

  public get sortedMembers(): EventVoteHistory['members'] {
    const list = [...this.data.members];
    const direction = this.sortDirection === 'asc' ? 1 : -1;

    return list.sort((a, b) => {
      if (this.sortColumn === 'name') {
        const aVal = String(a.name || '').toLowerCase();
        const bVal = String(b.name || '').toLowerCase();
        return direction * aVal.localeCompare(bVal);
      }

      if (this.sortColumn === 'role') {
        const aVal = String(a.committeeRole || '').toUpperCase();
        const bVal = String(b.committeeRole || '').toUpperCase();
        const order: Record<string, number> = {
          COMMITTEE_MASTER_ADMIN: 0,
          COMMITTEE_ADMIN: 1,
          COMMITTEE_MEMBER: 2,
        };
        const aIdx = order[aVal] ?? 3;
        const bIdx = order[bVal] ?? 3;
        return direction * (aIdx - bIdx);
      }

      if (this.sortColumn === 'status') {
        const aVal = a.hasVoted ? 1 : 0;
        const bVal = b.hasVoted ? 1 : 0;
        return direction * (aVal - bVal);
      }

      return 0;
    });
  }
}
