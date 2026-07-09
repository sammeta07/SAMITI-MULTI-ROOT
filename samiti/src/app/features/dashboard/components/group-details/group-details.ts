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
import { MatTooltipModule } from '@angular/material/tooltip';
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

  public readonly isLoading = signal<boolean>(false);
  public readonly isSubmittingAdminRoleRequest = signal<boolean>(false);
  public readonly isCancellingAdminRoleRequest = signal<boolean>(false);
  public readonly loggedInUserAdminRequestStatus = signal<'ACCEPTED' | 'PENDING' | 'REJECTED' | null>(null);
  public readonly loggedInUserAdminStatusActionBy = signal<number | null>(null);
  public readonly loggedInUserAdminStatusActionAt = signal<string | null>(null);
  public readonly groupData = signal<CommitteeProfileMeta | null>(null);
  public readonly isAdmin = signal<boolean>(false);
  public readonly isEventsLoading = signal<boolean>(false);
  public readonly committeeEvents = signal<CommitteeEventListItem[]>([]);
  
  // Lists holding structured members segment arrays securely typed
  public readonly adminsList = signal<CommitteeRosterMember[]>([]);
  public readonly membersList = signal<CommitteeRosterMember[]>([]);

  // Placeholder rows used to render skeleton loaders while data loads
  public readonly skeletonRows = [1, 2, 3];

// 🔐 Computed signals for role-based button visibility
  public readonly isCurrentUserAdmin = computed(() => this.isAdmin());
  public readonly isCurrentUserMember = computed(() => !this.isAdmin());
  public readonly canShowRequestAdminRoleButton = computed(
    () => this.isCurrentUserMember() && this.loggedInUserAdminRequestStatus() !== 'PENDING' && this.loggedInUserAdminRequestStatus() !== 'ACCEPTED'
  );
  public readonly canShowCancelAdminRoleRequestButton = computed(
    () => this.isCurrentUserMember() && this.loggedInUserAdminRequestStatus() === 'PENDING'
  );
  public readonly shouldShowAdminRequestStatusBadge = computed(() => {
    const status = this.loggedInUserAdminRequestStatus();
    return status === 'PENDING';
  });

  // Search filter functionality for members list
  public readonly searchQuery = signal<string>('');
  public readonly isSearchFocused = signal<boolean>(false);

  public onSearchFocus(): void {
    this.isSearchFocused.set(true);
  }

  public onSearchBlur(): void {
    this.isSearchFocused.set(false);
  }

  public clearSearch(): void {
    this.searchQuery.set('');
  }

  public clearGroupLogo(): void {
    this.groupData.update((currentValue) => {
      if (!currentValue) {
        return currentValue;
      }

      return {
        ...currentValue,
        logo: null
      };
    });
  }

  // Computed filtered members list based on search query
  public readonly filteredMembersList = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.membersList();
    }
    return this.membersList().filter(
      (member: CommitteeRosterMember) =>
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)
    );
  });

  // Track logged-in user's ID for conditional button rendering
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
    // 🚀 ROUTE PARAM LISTENER: Watches matrix tree route id parameter changes seamlessly!
    this.route.params.subscribe(params => {
      const committeeId = params['id'];
      if (committeeId) {
        this.fetchCommitteeDetailsPayload(committeeId);
      }
    });
  }

  public openEventDetails(eventId: number): void {
    if (!eventId) {
      return;
    }

    this.router.navigate(['/dashboard/event', eventId]);
  }

  public onEventVisibilityChange(eventItem: CommitteeEventListItem, isVisible: boolean): void {
    if (!this.isCurrentUserAdmin()) {
      this.notifier.warn('Only committee admins can update event visibility');
      return;
    }

    const visibility: 'VISIBLE' | 'HIDDEN' = isVisible ? 'VISIBLE' : 'HIDDEN';

    if (!eventItem?.eventId || eventItem.visibility === visibility) {
      return;
    }

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
          this.isAdmin.set(data.isLoggedUserAdmin || false);
          this.loggedInUserAdminRequestStatus.set(data.loggedInUserAdminStatus || null);
          this.loggedInUserAdminStatusActionBy.set(data.loggedInUserAdminStatusActionBy || null);
          this.loggedInUserAdminStatusActionAt.set(data.loggedInUserAdminStatusActionAt || null);
          
          // Split members into explicit buckets rows natively matching schema types
          const membersPool = data.members || [];
          this.adminsList.set(
            membersPool.filter((m: CommitteeRosterMember) => {
              const role = String(m.committeeRole || '').toUpperCase();
              return role === 'COMMITTEE_ADMIN' || role === 'COMMITTEE_MASTER_ADMIN' || Number(m.isCommitteeAdmin) === 1;
            })
          );
          this.membersList.set(
            membersPool.filter((m: CommitteeRosterMember) => String(m.committeeRole || '').toUpperCase() === 'COMMITTEE_MEMBER' || Number(m.isCommitteeAdmin) !== 1)
          );
          this.fetchCommitteeEvents(data.committeeId);
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

  private fetchCommitteeEvents(committeeId: number): void {
    if (!committeeId) {
      this.committeeEvents.set([]);
      return;
    }

    this.isEventsLoading.set(true);
    this.groupDetailsService.getEventsByCommittee(committeeId).subscribe({
      next: (events: CommitteeEventListItem[]) => {
        this.committeeEvents.set(events || []);
        this.isEventsLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.committeeEvents.set([]);
        this.isEventsLoading.set(false);
        this.notifier.error(err?.error?.message || 'Failed to load events list.');
      }
    });
  }

  public onRequestAdminRole(): void {
    const committee = this.groupData();
    if (!committee?.committeeId) {
      this.notifier.error('Committee not available for admin role request');
      return;
    }

    if (this.isCurrentUserAdmin()) {
      this.notifier.warn('You are already an admin in this committee');
      return;
    }

    if (!this.canShowRequestAdminRoleButton()) {
      this.notifier.warn('Admin role request cannot be submitted in current state');
      return;
    }

    const committeeId = committee.committeeId;

    const dialogData: ConfirmDialogData = {
      title: 'Request Admin Role',
      message: `Are you sure you want to request admin role for "${committee.committeeName}"?`,
      confirmText: 'Send Request',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);

    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.isSubmittingAdminRoleRequest.set(true);

        this.groupDetailsService.requestCommitteeAdminRole(committeeId, 'COMMITTEE_ADMIN').subscribe({
        next: (response: SubmitCommitteeMembershipRequestPayload) => {
          this.loggedInUserAdminRequestStatus.set('PENDING');
          this.loggedInUserAdminStatusActionBy.set(null);
          this.loggedInUserAdminStatusActionAt.set(null);
          this.notifier.success('Admin role request submitted successfully');
          this.fetchCommitteeDetailsPayload(String(committeeId));
        },
        error: (error: unknown) => {
          const err = error as { message?: string; error?: { message?: string } };
          this.notifier.error(err?.error?.message || err?.message || 'Failed to submit admin role request');
        },
        complete: () => {
          this.isSubmittingAdminRoleRequest.set(false);
        }
      });
    });
  }

  public onCancelAdminRoleRequest(): void {
    const committee = this.groupData();
    if (!committee?.committeeId) {
      this.notifier.error('Committee not available for request cancellation');
      return;
    }

    if (!this.canShowCancelAdminRoleRequestButton()) {
      this.notifier.warn('Only pending admin role requests can be cancelled');
      return;
    }

      const committeeId = committee.committeeId;

    const dialogData: ConfirmDialogData = {
      title: 'Cancel Admin Role Request',
      message: `Are you sure you want to cancel your admin role request for "${committee.committeeName}"?`,
      confirmText: 'Cancel Request',
      cancelText: 'Keep Request'
    };

    const dialogRef = this.confirmDialog.open(dialogData);

    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.isCancellingAdminRoleRequest.set(true);

        this.groupDetailsService.cancelCommitteeMembershipRequest(committeeId).subscribe({
        next: (response: CancelCommitteeMembershipRequestPayload) => {
          this.loggedInUserAdminRequestStatus.set(null);
          this.loggedInUserAdminStatusActionBy.set(null);
          this.loggedInUserAdminStatusActionAt.set(null);
          this.notifier.success('Admin role request cancelled successfully');
          this.fetchCommitteeDetailsPayload(String(committeeId));
        },
        error: (error: unknown) => {
          const err = error as { message?: string; error?: { message?: string } };
          this.notifier.error(err?.error?.message || err?.message || 'Failed to cancel admin role request');
        },
        complete: () => {
          this.isCancellingAdminRoleRequest.set(false);
        }
      });
    });
  }

  public getAdminRequestStatusLabel(): string {
    const status = this.loggedInUserAdminRequestStatus();
    return status || '';
  }

  // 👁 VIEW MEMBER DETAILS METHOD
  public onViewMember(userId: number): void {
    const committee = this.groupData();
    if (!committee) return;

    // Find the member - could be in either list (admin or member)
    const member = this.membersList().find(m => m.id === userId) || 
                  this.adminsList().find(m => m.id === userId);
    if (!member) return;

    const isAdmin = this.adminsList().some(m => m.id === userId);

    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(ViewUserDialogComponent, {
      width: '1000px',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      position: {
        right: '0',
        top: '0'
      },
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

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
    });
  }

  // 📑 EXPAND ROSTER FULL LIST OVERFLOW OVERLAY DIALOG (For 200+ Members)
  public onOpenFullRosterDialog(): void {
    this.notifier.success('Compiling heavy matrix buffer records into full high-density modal dialogue shell...');
    // Dialog launch sequence hooks here cleanly
  }

  public onPromoteMember(member: CommitteeRosterMember): void {
    const committee = this.groupData();
    if (!committee?.committeeId) {
      this.notifier.error('No committee selected');
      return;
    }

    if (!this.isCurrentUserAdmin()) {
      this.notifier.warn('Only committee admins can promote members');
      return;
    }

    if (member.id === this.getLoggedInUserId()) {
      this.notifier.warn('You cannot promote yourself from this screen');
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
    if (!committee?.committeeId) {
      this.notifier.error('No committee selected');
      return;
    }

    if (!this.isCurrentUserAdmin()) {
      this.notifier.warn('Only committee admins can demote admins');
      return;
    }

    if (admin.id === this.getLoggedInUserId()) {
      this.notifier.warn('You cannot demote yourself from this screen');
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
    if (!committee?.committeeId) {
      this.notifier.error('No committee selected');
      return;
    }

    if (!this.isCurrentUserAdmin()) {
      this.notifier.warn('Only committee admins can remove members');
      return;
    }

    if (member.id === this.getLoggedInUserId()) {
      this.notifier.warn('You cannot remove yourself from this screen');
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

  // 🎉 CREATE NEW EVENT DIALOG PIPELINE
  public onCreateEvent(eventType: 'PUBLIC' | 'PRIVATE'): void {
    const committee = this.groupData();
    if (!committee) {
      this.notifier.error('No committee selected');
      return;
    }

    // Check if user is committee admin - only admins can create events
    if (!this.isAdmin()) {
      this.notifier.warn('Only committee admins can create events');
      return;
    }

    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateEventDialogComponent, {
      position: {
        right: '0',
        top: '0'
      },
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
      if (result) {
        if (committee.committeeId) {
          this.hierarchyTreeService.triggerHierarchyTreeRefresh();
          this.fetchCommitteeEvents(committee.committeeId);
        }
      }
    });
  }

  public onEditCommitteeProfile(): void {
    const committee = this.groupData();
    if (!committee?.committeeId) {
      this.notifier.error('No committee selected');
      return;
    }

    if (!this.isCurrentUserAdmin()) {
      this.notifier.warn('Only committee admins can edit committee profile');
      return;
    }

    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateCommitteeDialogComponent, {
      position: {
        right: '0',
        top: '0'
      },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog',
      data: {
        committee
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (!result) {
        return;
      }

      this.fetchCommitteeDetailsPayload(String(committee.committeeId));
    });
  }

  public onDeleteCommitteeWorkspace(): void {
    const committee = this.groupData();
    if (!committee?.committeeId) {
      this.notifier.error('No committee selected');
      return;
    }

    if (!this.isCurrentUserAdmin()) {
      this.notifier.warn('Only committee admins can delete committee');
      return;
    }

    this.notifier.warn('Delete committee flow will be enabled after committee delete GraphQL API is restored.');
  }
}
