import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule, MatTooltip } from '@angular/material/tooltip';
import { ChangeDetectorRef } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { GroupDetailsService } from './group-details.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { CancelCommitteeMembershipRequestPayload, CommitteeEventListItem, CommitteeProfileMeta, CommitteeRosterMember, CommitteeDetailsPayload, SubmitCommitteeMembershipRequestPayload } from './group-details.models';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { CreateEventDialogComponent } from '../../../../components/dialog/create-event/create-event.component';
import { ViewUserDialogComponent } from '../../../../components/dialog/view-user/view-user.component';
import { CreateCommitteeDialogComponent } from '../../../../components/dialog/create-committee/create-committee.component';
import { PromoteMemberDialogService } from '../../../../components/dialog/promote-member/promote-member.service';
import { DemoteMemberDialogService } from '../../../../components/dialog/demote-member/demote-member.service';
import { RemoveMemberDialogService } from '../../../../components/dialog/remove-member/remove-member.service';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { TextFormatPipe } from '../../../../shared/pipe/text-format-pipe.pipe';

@Component({
  selector: 'app-group-details',
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
    MatExpansionModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TextFormatPipe,
  ],
  templateUrl: './group-details.html',
  styleUrl: './group-details.scss'
})
export class GroupDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notifier = inject(NotifierService);
  private readonly groupDetailsService = inject(GroupDetailsService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly dialog = inject(MatDialog);
  private readonly promoteMemberDialog = inject(PromoteMemberDialogService);
  private readonly demoteMemberDialog = inject(DemoteMemberDialogService);
  private readonly removeMemberDialog = inject(RemoveMemberDialogService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly cdr = inject(ChangeDetectorRef);

  public readonly isLoading = signal<boolean>(false);
  public readonly copiedCommitteeId = signal<string | null>(null);
  
  // 🚀 ERROR 1 FIX: Expanded type allowance bracket including 'REJECTED' literals matches securely
  public readonly userRequestStatus = signal<'ACCEPTED' | 'PENDING' | 'REJECTED' | null>(null);
  public readonly userRequestRole = signal<'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' | 'COMMITTEE_MASTER_ADMIN' | null>(null);
  public readonly userCommitteeRole = signal<'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' | 'COMMITTEE_MASTER_ADMIN' | null>(null);
  public readonly groupData = signal<CommitteeProfileMeta | null>(null);
  public readonly committeeEvents = signal<CommitteeEventListItem[]>([]);
  
  public readonly masterAdminsList = signal<CommitteeRosterMember[]>([]);
  public readonly adminsList = signal<CommitteeRosterMember[]>([]);
  public readonly membersList = signal<CommitteeRosterMember[]>([]);

  public readonly skeletonRows = [1, 2, 3];

  // 🔐 Computed role checks tracking operations variables
  public readonly isCurrentUserMasterAdmin = computed(() => {
    return this.userCommitteeRole() === 'COMMITTEE_MASTER_ADMIN';
  });

  public readonly isCurrentUserAdmin = computed(() => {
    const role = this.userCommitteeRole();
    return role === 'COMMITTEE_ADMIN' || role === 'COMMITTEE_MASTER_ADMIN';
  });

  public readonly isCurrentUserMember = computed(() => {
    return this.userCommitteeRole() === 'COMMITTEE_MEMBER';
  });

  public readonly isCurrentUserPending = computed(() => {
    return this.userRequestStatus() === 'PENDING';
  });

  public readonly currentUserRoleLabel = computed(() => {
    if (this.isCurrentUserMasterAdmin()) return 'Master Admin';
    if (this.userCommitteeRole() === 'COMMITTEE_ADMIN') return 'Admin';
    if (this.isCurrentUserMember()) return 'Member';
    if (this.isCurrentUserPending()) return 'Pending Verification';
    return 'Guest User';
  });

  public readonly currentUserRoleBadgeClass = computed(() => {
    if (this.isCurrentUserMasterAdmin()) return 'badge-master-admin';
    if (this.userCommitteeRole() === 'COMMITTEE_ADMIN') return 'badge-admin';
    if (this.isCurrentUserMember()) return 'badge-member';
    if (this.isCurrentUserPending()) return 'badge-pending';
    return 'badge-guest';
  });

  public readonly searchQuery = signal<string>('');
  public readonly isSearchFocused = signal<boolean>(false);

  public readonly committeeIdString = computed(() => this.groupData()?.committeeId?.toString() ?? '');

  public onSearchFocus(): void { this.isSearchFocused.set(true); }
  public onSearchBlur(): void { this.isSearchFocused.set(false); }
  public clearSearch(): void { this.searchQuery.set(''); }

  public clearGroupLogo(): void {
    this.groupData.update((currentValue) => {
      if (!currentValue) return currentValue;
      return { ...currentValue, logo: null };
    });
  }

  public readonly filteredMembersList = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.membersList();
    return this.membersList().filter(
      (member: CommitteeRosterMember) =>
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)
    );
  });

  public getLoggedInUserId(): number {
    const userDataStr = localStorage.getItem('userData');
    if (userDataStr) {
      try {
        const userData = JSON.parse(userDataStr);
        return userData.id || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const committeeId = params['id'];
      if (committeeId) {
        this.fetchCommitteeDetailsPayload(committeeId);
      }
    });
  }

  public openEventDetails(eventId: number): void {
    if (!eventId) return;
    this.router.navigate(['/dashboard/event', eventId]);
  }

  public onEventVisibilityChange(eventItem: CommitteeEventListItem, isVisible: boolean): void {
    if (!this.isCurrentUserAdmin()) {
      this.notifier.warn('Only committee admins can update event visibility');
      return;
    }

    const visibility: 'VISIBLE' | 'HIDDEN' = isVisible ? 'VISIBLE' : 'HIDDEN';
    if (!eventItem?.eventId || eventItem.visibility === visibility) return;

    const previousVisibility = eventItem.visibility;
    this.committeeEvents.update((currentEvents) =>
      currentEvents.map((currentEvent) =>
        currentEvent.eventId === eventItem.eventId ? { ...currentEvent, visibility } : currentEvent
      )
    );

    this.groupDetailsService.updateEventVisibility(eventItem.eventId, visibility).subscribe({
      next: () => {
        const formattedEventName = this.toTitleCase(eventItem.eventName || 'Event');
        const visibilityMessage = visibility === 'VISIBLE'
          ? `**${formattedEventName}** is now visible to all the public`
          : `**${formattedEventName}** is now hidden to all the public`;
        this.notifier.success(visibilityMessage);
      },
      error: (err: HttpErrorResponse) => {
        this.committeeEvents.update((currentEvents) =>
          currentEvents.map((currentEvent) =>
            currentEvent.eventId === eventItem.eventId ? { ...currentEvent, visibility: previousVisibility } : currentEvent
          )
        );
        this.notifier.error(err?.error?.message || 'Failed to update event visibility.');
      }
    });
  }

  public onEditEvent(eventItem: CommitteeEventListItem): void {
    this.notifier.warn(`Edit event flow is not available yet for "${eventItem.eventName}".`);
  }

  private toTitleCase(value: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private fetchCommitteeDetailsPayload(id: string): void {
    this.isLoading.set(true);
    
    this.groupDetailsService.getCommitteeDetails(id).subscribe({
      next: (data: CommitteeDetailsPayload) => {
        if (data && data.committeeId) {
          const committeeInfo: CommitteeProfileMeta = {
            id: data.id,
            committeeId: data.committeeId,
            committeeName: data.committeeName,
            address: data.address,
            establishYear: data.establishYear,
            logo: data.logo,
            contactNumbers: data.contactNumbers,
            createdBy: data.createdBy,
            createdAt: data.createdAt
          };

          this.groupData.set(committeeInfo);
          this.userCommitteeRole.set(data.committeeRole ?? null);
          this.userRequestStatus.set(data.userRequestStatus ?? null);
          this.userRequestRole.set(data.userRequestRole ?? null);
          
          const membersPool = data.members || [];
          
          this.masterAdminsList.set(
            membersPool.filter((m: CommitteeRosterMember) => String(m.committeeRole || '').toUpperCase() === 'COMMITTEE_MASTER_ADMIN')
          );
          
          this.adminsList.set(
            membersPool.filter((m: CommitteeRosterMember) => String(m.committeeRole || '').toUpperCase() === 'COMMITTEE_ADMIN')
          );
          
          this.membersList.set(
            membersPool.filter((m: CommitteeRosterMember) => String(m.committeeRole || '').toUpperCase() === 'COMMITTEE_MEMBER')
          );
          
          // 🚀 ERROR 2 & 3 FIX: Forces mapping layout with strict type validation defaults inside tracking loop variables setup
          if (data.events) {
            const safeEvents = data.events.map((event: CommitteeEventListItem) => ({
              ...event,
              id: event.id || Number(event.eventId || 0)
            }));
            this.committeeEvents.set(safeEvents);
          } else {
            this.committeeEvents.set([]);
          }

        } else {
          this.notifier.error('Failed to parse committee details.');
        }
        this.isLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Transaction error loading group rows.');
        this.isLoading.set(false);
      }
    });
  }

  public onRequestAdminRole(): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;
    
    const dialogData: ConfirmDialogData = {
      title: 'Request Admin Role',
      message: `Are you sure you want to request admin role for "${committee.committeeName}"?`,
      confirmText: 'Send Request',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

      this.groupDetailsService.requestCommitteeAdminRole(Number(committee.committeeId), 'COMMITTEE_ADMIN').subscribe({
        next: () => {
          this.notifier.success('Admin role request submitted successfully');
          this.fetchCommitteeDetailsPayload(String(committee.committeeId));
        },
        error: (error: any) => {
          this.notifier.error(error?.error?.message || 'Failed to submit admin role request');
        }
      });
    });
  }

  public onCancelAdminRoleRequest(): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;

    const dialogData: ConfirmDialogData = {
      title: 'Cancel Admin Role Request',
      message: `Are you sure you want to cancel your admin role request for "${committee.committeeName}"?`,
      confirmText: 'Cancel Request',
      cancelText: 'Keep Request'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

      this.groupDetailsService.cancelCommitteeMembershipRequest(Number(committee.committeeId)).subscribe({
        next: () => {
          this.notifier.success('Admin role request cancelled successfully');
          this.fetchCommitteeDetailsPayload(String(committee.committeeId));
        },
        error: (error: any) => {
          this.notifier.error(error?.error?.message || 'Failed to cancel admin role request');
        }
      });
    });
  }

  public onViewMember(userId: number): void {
    const committee = this.groupData();
    if (!committee) return;

    const member = this.membersList().find(m => m.id === userId) || 
                   this.adminsList().find(m => m.id === userId) ||
                   this.masterAdminsList().find(m => m.id === userId);
    if (!member) return;

    const checkAdmin = String(member.committeeRole || '').toUpperCase();
    const isAdmin = checkAdmin === 'COMMITTEE_ADMIN' || checkAdmin === 'COMMITTEE_MASTER_ADMIN';

    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(ViewUserDialogComponent, {
      width: '1000px',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      position: { right: '0', top: '0' },
      height: '100%',
      panelClass: 'slide-in-dialog',
      data: {
        userId: userId.toString(),
        committeeId: committee.committeeId?.toString() || '',
        userName: member.name,
        userEmail: member.email,
        isAdmin: isAdmin,
        committeeName: committee.committeeName || ''
      }
    });

    dialogRef.afterClosed().subscribe(() => {
      document.body.classList.remove('dialog-open');
    });
  }

  public onOpenFullRosterDialog(): void {
    this.notifier.success('Compiling heavy matrix buffer records into full high-density modal dialogue shell...');
  }

  public onPromoteMember(member: CommitteeRosterMember): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;

    if (!this.isCurrentUserMasterAdmin()) {
      this.notifier.warn('Only Master Administrators can execute promotion workflows');
      return;
    }

    const dialogRef = this.promoteMemberDialog.open({
      userId: String(member.id),
      committeeId: String(committee.committeeId),
      userName: member.name,
      currentRole: 'member',
      committeeName: committee.committeeName
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.confirmed) {
        this.fetchCommitteeDetailsPayload(String(committee.committeeId));
      }
    });
  }

  public onDemoteAdmin(admin: CommitteeRosterMember): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;

    if (!this.isCurrentUserMasterAdmin()) {
      this.notifier.warn('Only Master Administrators hold demotion access control tokens');
      return;
    }

    const dialogRef = this.demoteMemberDialog.open({
      userId: String(admin.id),
      committeeId: String(committee.committeeId),
      userName: admin.name,
      currentRole: 'admin',
      committeeName: committee.committeeName
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.confirmed) {
        this.fetchCommitteeDetailsPayload(String(committee.committeeId));
      }
    });
  }

  public onRemoveCommitteeMember(member: CommitteeRosterMember): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;

    if (!this.isCurrentUserMasterAdmin()) {
      this.notifier.warn('Only Master Administrators can eliminate accounts from workspaces');
      return;
    }

    const dialogRef = this.removeMemberDialog.open({
      userId: String(member.id),
      committeeId: String(committee.committeeId),
      userName: member.name,
      committeeName: committee.committeeName
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.confirmed) {
        this.fetchCommitteeDetailsPayload(String(committee.committeeId));
      }
    });
  }

  public onCreateEvent(eventType: 'PUBLIC' | 'PRIVATE'): void {
    const committee = this.groupData();
    if (!committee) return;

    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateEventDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog',
      data: {
        committeeId: committee.committeeId,
        committeeName: committee.committeeName || '',
        address: committee.address || '',
        eventType
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (result && committee.committeeId) {
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
        this.fetchCommitteeDetailsPayload(String(committee.committeeId));
      }
    });
  }

  public onEditCommitteeProfile(): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;

    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateCommitteeDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog',
      data: { committee }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (result) {
        this.fetchCommitteeDetailsPayload(String(committee.committeeId));
      }
    });
  }

public onDeleteCommitteeWorkspace(): void {
    if (!this.isCurrentUserAdmin()) return;
    this.notifier.warn('Delete committee flow will be enabled after committee delete GraphQL API is restored.');
  }

  async copyCommitteeId(committeeId: string, event: Event, tooltip: MatTooltip): Promise<void> {
    event.stopPropagation();
    try {
      this.copiedCommitteeId.set(committeeId);
      this.cdr.detectChanges();
      await navigator.clipboard.writeText(committeeId);

      const originalMessage = tooltip.message;
      tooltip.message = `Committee Id copied - ${committeeId}`;
      tooltip.show();

      setTimeout(() => {
        this.copiedCommitteeId.set(null);
        this.cdr.detectChanges();
      }, 2000);

      setTimeout(() => {
        tooltip.hide();
        setTimeout(() => tooltip.message = originalMessage, 500);
      }, 2000);
    } catch (err) {
      this.notifier.error('Failed to copy Committee Id');
      this.copiedCommitteeId.set(null);
      this.cdr.detectChanges();
    }
  }
}