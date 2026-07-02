import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HttpErrorResponse } from '@angular/common/http';
import { ViewUserDialogData, ViewUserDialogResponse, MemberDetailsResponse } from './view-user.models';
import { ViewUserDialogService } from './view-user.service';
import { MatToolbar } from '@angular/material/toolbar';

@Component({
  selector: 'app-view-user-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatToolbar
  ],
  templateUrl: './view-user.component.html',
  styleUrl: './view-user.component.scss'
})
export class ViewUserDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<ViewUserDialogComponent>);
  private readonly viewUserService = inject(ViewUserDialogService);
  public readonly data = inject<ViewUserDialogData>(MAT_DIALOG_DATA);

  public readonly isLoading = signal<boolean>(false);
  
  // 🚀 FIXED: Renamed to userData to bind cleanly and perfectly with your high-density HTML template selectors
  public readonly userData = signal<MemberDetailsResponse['data'] | null>(null);

  // Search filter signals for the template query framework overlay controls
  public readonly searchQuery = signal<string>('');
  public readonly isSearchFocused = signal<boolean>(false);

  // Computed signal filter mapping matching incoming user profile row logs dynamically
  public readonly filteredMembersList = computed(() => {
    const data = this.userData();
    if (!data) return [];
    const queryStr = this.searchQuery().toLowerCase().trim();
    const members = data.kpi_metrics?.tasks_summary?.listing || [];
    if (!queryStr) return members;
    return members.filter(m => m.task_title?.toLowerCase().includes(queryStr));
  });

  ngOnInit(): void {
    this.fetchMemberDetails();
  }

  private fetchMemberDetails(): void {
    this.isLoading.set(true);
    
    this.viewUserService.getMemberDetails(this.data.userId, this.data.committeeId).subscribe({
      next: (response: MemberDetailsResponse) => {
        if (response && response.statusCode === 200 && response.data) {
          // Injects the multi-relational data object cleanly matching model attributes
          this.userData.set(response.data);
        }
        this.isLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error compiling relational user analytics desk logs:', err);
        this.isLoading.set(false);
      }
    });
  }

  // 🚀 Search pill layout activation focus matrices tracking hooks
  public onSearchFocus(): void {
    this.isSearchFocused.set(true);
  }

  public onSearchBlur(): void {
    this.isSearchFocused.set(false);
  }

  public clearSearch(): void {
    this.searchQuery.set('');
  }

  // Placeholder actions deck handles matching child template event nodes
  public onViewMember(id: number): void {
    console.log('Cascade dynamic target drilldown tracking initiated for user id:', id);
  }

  public onDemoteAdmin(id: number): void {
    console.log('Demote operational execution hook processed for administrative id:', id);
  }

  public onPromoteMember(id: number): void {
    console.log('Promote rank elevation sequence triggered for member user node id:', id);
  }

  public onRemoveMember(id: number): void {
    console.log('Eviction pipeline cleanup matrix initialized for target user component reference id:', id);
  }

  public onClose(): void {
    this.dialogRef.close({ closed: true } as ViewUserDialogResponse);
  }
}