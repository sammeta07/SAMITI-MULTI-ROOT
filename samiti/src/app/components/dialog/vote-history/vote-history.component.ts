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

  public get sortedMembers(): EventVoteHistory['members'] {
    return [...this.data.members].sort((a, b) =>
      String(a.name || '').toLowerCase().localeCompare(String(b.name || '').toLowerCase())
    );
  }
}
