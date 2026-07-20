import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbar } from '@angular/material/toolbar';
import { VoteHistoryDialogData } from './vote-history.models';

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
  public readonly data: VoteHistoryDialogData = inject(MAT_DIALOG_DATA);

  constructor(
    public dialogRef: MatDialogRef<VoteHistoryDialogComponent>
  ) { }

  public onClose(): void {
    this.dialogRef.close();
  }

  public votePercent(): number {
    const total = this.data.totalMembers || 0;
    if (total === 0) {
      return 0;
    }
    return Math.round((this.data.votedCount / total) * 100);
  }
}
