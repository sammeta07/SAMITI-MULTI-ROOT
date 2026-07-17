import { Component, inject, OnInit, signal, computed, HostListener } from '@angular/core';
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
import { firstValueFrom } from 'rxjs';
import { GroupDetailsService } from './group-details.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { CancelCommitteeMembershipRequestPayload, CommitteeEventListItem, CommitteeProfileMeta, CommitteeRosterMember, CommitteeDetailsPayload, SubmitCommitteeMembershipRequestPayload } from './group-details.models';
import { EventAvailableRole, EventMappedVotingRole } from '../event-details/event-details.models';
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
import { ImageAssetService } from '../../../../core/services/image-asset.service';
import { ImageCropperDialogComponent } from '../../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';

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
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.openRolesDropdownEventId() !== null) {
      const target = event.target as HTMLElement;
      if (!target.closest('.roles-dropdown-trigger-wrapper')) {
        this.closeRolesDropdown();
      }
    }
  }
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
  private readonly imageAssetService = inject(ImageAssetService);

  public readonly isLoading = signal<boolean>(false);
  public readonly copiedCommitteeId = signal<string | null>(null);
  public readonly isUploadingCommitteeLogo = signal<boolean>(false);
  public readonly isUploadingEventLogo = signal<boolean>(false);
  
  // 🚀 ERROR 1 FIX: Expanded type allowance bracket including 'REJECTED' literals matches securely
  public readonly userRequestStatus = signal<'ACCEPTED' | 'PENDING' | 'REJECTED' | null>(null);
  public readonly userRequestRole = signal<'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' | 'COMMITTEE_MASTER_ADMIN' | null>(null);
  public readonly userCommitteeRole = signal<'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' | 'COMMITTEE_MASTER_ADMIN' | null>(null);
  public readonly groupData = signal<CommitteeProfileMeta | null>(null);
  public readonly committeeEvents = signal<CommitteeEventListItem[]>([]);
  public readonly availableRoles = signal<EventAvailableRole[]>([]);
  public readonly openRolesDropdownEventId = signal<number | null>(null);
  public readonly savingRolesEventId = signal<number | null>(null);
  public readonly isLockingVotingRoles = signal<boolean>(false);
  public readonly isUpdatingVotingPhase = signal<boolean>(false);
  public readonly rolesSnapshot = signal<{ eventId: number; roles: EventMappedVotingRole[] } | null>(null);
  
  public readonly masterAdminsList = signal<CommitteeRosterMember[]>([]);
  public readonly adminsList = signal<CommitteeRosterMember[]>([]);
  public readonly membersList = signal<CommitteeRosterMember[]>([]);

  public readonly skeletonRows = [1, 2, 3];
  public readonly skeletonRows2 = [1, 2];
  public readonly skeletonRows3 = [1, 2, 3];
  public readonly skeletonRows6 = [1, 2, 3, 4, 5, 6];
  public readonly skeletonRosterRows = [1, 2, 3, 4, 5, 6];

  // 🔐 Computed role checks tracking operations variables
  public readonly isCurrentUserMasterAdmin = computed(() => {
    return this.userCommitteeRole() === 'COMMITTEE_MASTER_ADMIN';
  });

  public readonly isCurrentUserAdmin = computed(() => {
    const role = this.userCommitteeRole();
    return role === 'COMMITTEE_ADMIN';
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

  public async onCommitteeLogoSelected(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] || null;
    inputElement.value = '';

    if (!selectedFile) {
      return;
    }

    if (!this.isCurrentUserMasterAdmin()) {
      this.notifier.warn('Only committee master admins can update the committee logo');
      return;
    }

    const committee = this.groupData();
    if (!committee?.committeeId) {
      this.notifier.error('Committee reference is missing. Please reload the workspace.');
      return;
    }

    const selectedOrCroppedFile = await this.openCommitteeLogoCropDialog(selectedFile);
    if (!selectedOrCroppedFile) {
      return;
    }

    this.isUploadingCommitteeLogo.set(true);

    try {
      const uploadedLogoMetadata = await firstValueFrom(
        this.imageAssetService.uploadSingleImageForCommitteeLogo(selectedOrCroppedFile)
      );

      const updatedCommittee = await firstValueFrom(
        this.groupDetailsService.updateCommitteeLogo(committee, uploadedLogoMetadata.publicAbsoluteUrl)
      );

      const resolvedLogo = updatedCommittee?.logo || uploadedLogoMetadata.publicAbsoluteUrl;
      this.groupData.update((currentValue) => {
        if (!currentValue) return currentValue;
        return { ...currentValue, logo: resolvedLogo };
      });

      const displayGroupName = this.toTitleCase(committee.committeeName || 'Committee');
      this.notifier.success(`Committee logo for **${displayGroupName}** has been updated successfully.`);
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
    } catch (error: any) {
      this.notifier.error(error?.message || 'Failed to update committee logo.');
    } finally {
      this.isUploadingCommitteeLogo.set(false);
      this.cdr.detectChanges();
    }
  }

  private async openCommitteeLogoCropDialog(file: File): Promise<File | null> {
    return firstValueFrom(
      this.dialog.open(ImageCropperDialogComponent, {
        width: 'min(92vw, 920px)',
        data: {
          file,
          title: 'Crop Committee Logo',
          maintainAspectRatio: true,
          aspectRatio: 1
        }
      }).afterClosed()
    );
  }

  /* ======= EVENT DESIGNATION PHOTO UPLOAD (client-side preview only) ======= */
  public readonly defaultDesignationSlots = [
    { role: 'ADHYAKSHA', label: 'Adhyaksha' },
    { role: 'UPADHYAKSHA', label: 'Upadhyaksh' },
    { role: 'CASHIER', label: 'Cashier' }
  ];

  private readonly designationPhotos = signal<Record<string, string>>({});

  public getDesignationPhoto(eventId: number, role: number | string): string | undefined {
    return this.designationPhotos()[`${eventId}:${role}`];
  }

  public onDesignationPhotoSlotClicked(eventId: number, role: number | string, event: Event): void {
    event.stopPropagation();
    const host = (event.currentTarget as HTMLElement).querySelector('input[type="file"]') as HTMLInputElement | null;
    host?.click();
  }

  public async onDesignationPhotoSelected(eventId: number, role: number | string, event: Event): Promise<void> {
    event.stopPropagation();
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] || null;
    inputElement.value = '';

    if (!selectedFile) {
      return;
    }

    const selectedOrCroppedFile = await this.openDesignationPhotoCropDialog(selectedFile);
    if (!selectedOrCroppedFile) {
      return;
    }

    try {
      const uploadedMetadata = await firstValueFrom(
        this.imageAssetService.uploadSingleImageForCommitteeLogo(selectedOrCroppedFile)
      );

      const key = `${eventId}:${role}`;
      this.designationPhotos.update((current) => ({ ...current, [key]: uploadedMetadata.publicAbsoluteUrl }));
      this.notifier.success(`**${role}** photo updated for this event.`);
    } catch (error: any) {
      this.notifier.error(error?.message || 'Failed to upload designation photo.');
    }
  }

  private async openDesignationPhotoCropDialog(file: File): Promise<File | null> {
    return firstValueFrom(
      this.dialog.open(ImageCropperDialogComponent, {
        width: 'min(92vw, 920px)',
        data: {
          file,
          title: 'Crop Designation Photo',
          maintainAspectRatio: true,
          aspectRatio: 1
        }
      }).afterClosed()
    );
  }

  /* ======= EVENT LOGO UPLOAD (persisted via updateEventLogo) ======= */
  public onEventLogoCircleClicked(eventItem: CommitteeEventListItem, event: Event): void {
    if (!(this.isCurrentUserMasterAdmin() || this.isCurrentUserAdmin())) {
      return;
    }
    event.stopPropagation();
    const host = (event.currentTarget as HTMLElement).querySelector('input[type="file"]') as HTMLInputElement | null;
    host?.click();
  }

  public async onEventLogoSelected(eventItem: CommitteeEventListItem, event: Event): Promise<void> {
    if (!(this.isCurrentUserMasterAdmin() || this.isCurrentUserAdmin())) {
      return;
    }
    event.stopPropagation();
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] || null;
    inputElement.value = '';

    if (!selectedFile) {
      return;
    }

    const committeeId = this.groupData()?.committeeId;
    if (!committeeId || !eventItem?.eventId) {
      this.notifier.error('Event reference is missing. Please reload the workspace.');
      return;
    }

    const selectedOrCroppedFile = await this.openEventLogoCropDialog(selectedFile);
    if (!selectedOrCroppedFile) {
      return;
    }

    this.isUploadingEventLogo.set(true);

    try {
      const uploadedMetadata = await firstValueFrom(
        this.imageAssetService.uploadSingleImageForCommitteeLogo(selectedOrCroppedFile)
      );

      const updated = await firstValueFrom(
        this.groupDetailsService.updateEventLogo(eventItem.eventId, committeeId, uploadedMetadata.publicAbsoluteUrl)
      );

      const resolvedLogo = updated?.eventLogo || uploadedMetadata.publicAbsoluteUrl;
      this.committeeEvents.update((currentEvents) =>
        currentEvents.map((currentEvent) =>
          currentEvent.eventId === eventItem.eventId ? { ...currentEvent, eventLogo: resolvedLogo } : currentEvent
        )
      );

      const formattedEventName = this.toTitleCase(eventItem.eventName || 'Event');
      this.notifier.success(`Logo for **${formattedEventName}** has been updated successfully.`);
    } catch (error: any) {
      this.notifier.error(error?.message || 'Failed to update event logo.');
    } finally {
      this.isUploadingEventLogo.set(false);
    }
  }

  private async openEventLogoCropDialog(file: File): Promise<File | null> {
    return firstValueFrom(
      this.dialog.open(ImageCropperDialogComponent, {
        width: 'min(92vw, 920px)',
        data: {
          file,
          title: 'Crop Event Logo',
          maintainAspectRatio: true,
          aspectRatio: 1
        }
      }).afterClosed()
    );
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

  // public openEventDetails(eventId: number): void {
  //   if (!eventId) return;
  //   this.router.navigate(['/dashboard/event', eventId]);
  // }

  public onEventVisibilityChange(eventItem: CommitteeEventListItem, isVisible: boolean): void {
    if (!this.isCurrentUserMasterAdmin()) {
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

  public getSelectedRoleIds(event: CommitteeEventListItem): number[] {
    return (event.mappedVotingRoles || []).map((r) => r.roleId);
  }

  public isRoleSelected(event: CommitteeEventListItem, roleId: number | null | undefined): boolean {
    if (!roleId) return false;
    return (event.mappedVotingRoles || []).some((r) => r.roleId === roleId);
  }

  public onRolesLabelClick(eventItem: CommitteeEventListItem, $event: Event): void {
    $event.stopPropagation();
    if (this.savingRolesEventId() === eventItem.eventId) return;
    if (this.openRolesDropdownEventId() === eventItem.eventId) {
      this.saveRolesForEvent(eventItem);
    } else {
      this.toggleRolesDropdown(eventItem.eventId, $event);
    }
  }

  public toggleRolesDropdown(eventId: number, $event: Event): void {
    $event.stopPropagation();
    const isOpening = this.openRolesDropdownEventId() !== eventId;
    this.openRolesDropdownEventId.update((current) => current === eventId ? null : eventId);
    if (isOpening) {
      const eventItem = this.committeeEvents().find((e) => e.eventId === eventId);
      this.rolesSnapshot.set({
        eventId,
        roles: (eventItem?.mappedVotingRoles || []).map((r) => ({ ...r, nominees: [...r.nominees] }))
      });
    }
  }

  public async saveRolesForEvent(eventItem: CommitteeEventListItem): Promise<void> {
    const changed = this.hasRolesChanged(eventItem);
    if (!changed) {
      this.openRolesDropdownEventId.set(null);
      this.rolesSnapshot.set(null);
      return;
    }
    const selectedRoleIds = (eventItem.mappedVotingRoles || []).map((r) => r.roleId);
    this.savingRolesEventId.set(eventItem.eventId);
    try {
      await firstValueFrom(
        this.groupDetailsService.updateEventVotingRoles(eventItem.eventId, selectedRoleIds)
      );
      this.openRolesDropdownEventId.set(null);
      this.rolesSnapshot.set(null);
    } catch (err) {
      this.notifier.error(err instanceof Error ? err.message : 'Failed to save roles');
    } finally {
      this.savingRolesEventId.set(null);
    }
  }

  public hasRolesChanged(eventItem: CommitteeEventListItem): boolean {
    const snapshot = this.rolesSnapshot();
    if (!snapshot || snapshot.eventId !== eventItem.eventId) return false;
    const currentIds = (eventItem.mappedVotingRoles || []).map((r) => r.roleId).sort((a, b) => a - b);
    const originalIds = snapshot.roles.map((r) => r.roleId).sort((a, b) => a - b);
    if (currentIds.length !== originalIds.length) return true;
    return currentIds.some((id, idx) => id !== originalIds[idx]);
  }

  public closeRolesDropdown(): void {
    const snapshot = this.rolesSnapshot();
    if (snapshot) {
      this.committeeEvents.update((currentEvents) =>
        currentEvents.map((ev) => {
          if (ev.eventId !== snapshot.eventId) return ev;
          return { ...ev, mappedVotingRoles: snapshot.roles.map((r) => ({ ...r, nominees: [...r.nominees] })) };
        })
      );
    }
    this.openRolesDropdownEventId.set(null);
    this.rolesSnapshot.set(null);
  }

  public onRoleCheckboxChange(eventItem: CommitteeEventListItem, roleId: number | null | undefined, checked: boolean): void {
    if (!roleId || this.savingRolesEventId() === eventItem.eventId) return;
    const availableRole = this.availableRoles().find((r) => r.roleId === roleId);
    const newRole = {
      roleId,
      roleName: availableRole?.roleName || '',
      hindiName: availableRole?.hindiName || null,
      englishName: availableRole?.englishName || null,
      sortOrder: 0,
      nominationCount: 0,
      isNominatedByCurrentUser: false,
      nominees: []
    };
    this.committeeEvents.update((currentEvents) =>
      currentEvents.map((ev) => {
        if (ev.eventId !== eventItem.eventId) return ev;
        const currentRoles = ev.mappedVotingRoles || [];
        const updatedRoles = checked
          ? [...currentRoles, newRole]
          : currentRoles.filter((r) => r.roleId !== roleId);
        return { ...ev, mappedVotingRoles: updatedRoles };
      })
    );
  }

  public getEventDropdownLabel(eventId: number): string {
    if (this.savingRolesEventId() === eventId) return 'Saving Changes...';
    return this.openRolesDropdownEventId() === eventId ? 'Save Changes' : 'Please Select Roles';
  }

  public getRoleDisplayName(role: EventAvailableRole | EventMappedVotingRole): string {
    const english = this.toTitleCase((role.englishName || role.roleName || '').replace(/_/g, ' '));
    const hindi = role.hindiName ? this.toTitleCase(role.hindiName.replace(/_/g, ' ')) : null;
    return hindi ? `${hindi} / ${english}` : english;
  }

  public toTitleCase(value: string): string {
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
            latitude: data.latitude,
            longitude: data.longitude,
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

          this.availableRoles.set(data.availableRoles || []);

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

  public onLockEventRoles(eventItem: CommitteeEventListItem): void {
    if (!eventItem?.eventId) {
      this.notifier.error('No event available for role locking');
      return;
    }

    if (!(this.isCurrentUserMasterAdmin() || this.isCurrentUserAdmin())) {
      this.notifier.error('Only committee admin can lock event voting roles');
      return;
    }

    const mappedRoleCount = eventItem.mappedVotingRoles?.length ?? 0;
    if (mappedRoleCount === 0) {
      this.notifier.warn('Select and save at least one role before locking voting role selection.');
      return;
    }

    if (this.savingRolesEventId() === eventItem.eventId || this.isLockingVotingRoles()) {
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Lock Voting Role Selection',
      message: `Are you sure you want to lock role selection for "${eventItem?.eventName || 'this event'}"? After locking, even committee admin cannot change mapped voting roles.`,
      confirmText: 'Lock Roles',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

      this.isLockingVotingRoles.set(true);
      this.groupDetailsService.lockEventVotingRoles(eventItem.eventId).subscribe({
        next: () => {
          this.committeeEvents.update((currentEvents) =>
            currentEvents.map((ev) =>
              ev.eventId === eventItem.eventId ? { ...ev, votingRolesLocked: 1 } : ev
            )
          );
          this.notifier.success('Voting role selection has been locked for this event.');
          this.isLockingVotingRoles.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to lock voting role selection.');
          this.isLockingVotingRoles.set(false);
        }
      });
    });
  }

  public onStartNominations(eventItem: CommitteeEventListItem): void {
    if (!eventItem?.eventId) {
      this.notifier.error('No event available for starting nominations');
      return;
    }

    if (!(this.isCurrentUserMasterAdmin() || this.isCurrentUserAdmin())) {
      this.notifier.error('Only committee admin can start nominations');
      return;
    }

    if (Number(eventItem.votingRolesLocked) !== 1) {
      this.notifier.warn('Lock voting roles before starting nominations');
      return;
    }

    if (Number(eventItem.votingPhaseState) !== 0) {
      this.notifier.warn('Nominations have already been started for this event');
      return;
    }

    if (this.isUpdatingVotingPhase() || this.isLockingVotingRoles()) {
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Start Nominations',
      message: 'Are you sure you want to start nominations? Members will be able to nominate and withdraw until nominations are stopped.',
      confirmText: 'Start Nominations',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

      this.isUpdatingVotingPhase.set(true);
      this.groupDetailsService.startEventNominations(eventItem.eventId).subscribe({
        next: () => {
          this.committeeEvents.update((currentEvents) =>
            currentEvents.map((ev) =>
              ev.eventId === eventItem.eventId ? { ...ev, votingPhaseState: 1 } : ev
            )
          );
          this.notifier.success('Nominations have been started successfully.');
          this.isUpdatingVotingPhase.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to start nominations.');
          this.isUpdatingVotingPhase.set(false);
        }
      });
    });
  }

  public onStopNominations(eventItem: CommitteeEventListItem): void {
    if (!eventItem?.eventId) {
      this.notifier.error('No event available for stopping nominations');
      return;
    }

    if (!(this.isCurrentUserMasterAdmin() || this.isCurrentUserAdmin())) {
      this.notifier.error('Only committee admin can stop nominations');
      return;
    }

    if (Number(eventItem.votingPhaseState) !== 1) {
      this.notifier.warn('Nominations have not been started for this event');
      return;
    }

    if (this.isUpdatingVotingPhase() || this.isLockingVotingRoles()) {
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Stop Nominations',
      message: 'Are you sure you want to stop nominations? Members will no longer be able to nominate or withdraw after this.',
      confirmText: 'Stop Nominations',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

      this.isUpdatingVotingPhase.set(true);
      this.groupDetailsService.stopEventNominations(eventItem.eventId).subscribe({
        next: () => {
          this.committeeEvents.update((currentEvents) =>
            currentEvents.map((ev) =>
              ev.eventId === eventItem.eventId ? { ...ev, votingPhaseState: 2 } : ev
            )
          );
          this.notifier.success('Nominations have been stopped successfully.');
          this.isUpdatingVotingPhase.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to stop nominations.');
          this.isUpdatingVotingPhase.set(false);
        }
      });
    });
  }

  public onStartVoting(eventItem: CommitteeEventListItem): void {
    if (!eventItem?.eventId) {
      this.notifier.error('No event available for starting voting');
      return;
    }

    if (!(this.isCurrentUserMasterAdmin() || this.isCurrentUserAdmin())) {
      this.notifier.error('Only committee admin can start voting');
      return;
    }

    if (Number(eventItem.votingPhaseState) !== 2) {
      this.notifier.warn('Stop nominations before starting voting');
      return;
    }

    if (this.isUpdatingVotingPhase() || this.isLockingVotingRoles()) {
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Start Voting',
      message: 'Are you sure you want to start voting now? Nominations will stay closed and all members including admins will be able to vote.',
      confirmText: 'Start Voting',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

      this.isUpdatingVotingPhase.set(true);
      this.groupDetailsService.allowEventVoting(eventItem.eventId).subscribe({
        next: () => {
          this.committeeEvents.update((currentEvents) =>
            currentEvents.map((ev) =>
              ev.eventId === eventItem.eventId ? { ...ev, votingPhaseState: 3, votingEnabled: 1 } : ev
            )
          );
          this.notifier.success('Voting has been started successfully.');
          this.isUpdatingVotingPhase.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to enable voting.');
          this.isUpdatingVotingPhase.set(false);
        }
      });
    });
  }

  public onStopVoting(eventItem: CommitteeEventListItem): void {
    if (!eventItem?.eventId) {
      this.notifier.error('No event available for stopping voting');
      return;
    }

    if (!(this.isCurrentUserMasterAdmin() || this.isCurrentUserAdmin())) {
      this.notifier.error('Only committee admin can stop voting');
      return;
    }

    if (Number(eventItem.votingPhaseState) !== 3) {
      this.notifier.warn('Voting has not been started for this event');
      return;
    }

    if (this.isUpdatingVotingPhase() || this.isLockingVotingRoles()) {
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Stop Voting',
      message: 'Are you sure you want to stop voting? After this, voting will be closed and nomination actions will stay disabled.',
      confirmText: 'Stop Voting',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

      this.isUpdatingVotingPhase.set(true);
      this.groupDetailsService.stopEventVoting(eventItem.eventId).subscribe({
        next: () => {
          this.committeeEvents.update((currentEvents) =>
            currentEvents.map((ev) =>
              ev.eventId === eventItem.eventId ? { ...ev, votingPhaseState: 4, votingClosed: 1 } : ev
            )
          );
          this.notifier.success('Voting has been closed successfully.');
          this.isUpdatingVotingPhase.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to stop voting.');
          this.isUpdatingVotingPhase.set(false);
        }
      });
    });
  }

  public onDeclareResults(eventItem: CommitteeEventListItem): void {
    if (!eventItem?.eventId) {
      this.notifier.error('No event available for declaring results');
      return;
    }

    if (!(this.isCurrentUserMasterAdmin() || this.isCurrentUserAdmin())) {
      this.notifier.error('Only committee admin can declare results');
      return;
    }

    if (Number(eventItem.votingPhaseState) !== 4) {
      this.notifier.warn('Voting must be closed before declaring results');
      return;
    }

    if (this.isUpdatingVotingPhase() || this.isLockingVotingRoles()) {
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Declare Results',
      message: 'Are you sure you want to declare and publish the results for this event? This will finalize the election outcome.',
      confirmText: 'Declare Results',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

      this.isUpdatingVotingPhase.set(true);
      this.groupDetailsService.declareEventResults(eventItem.eventId).subscribe({
        next: () => {
          this.committeeEvents.update((currentEvents) =>
            currentEvents.map((ev) =>
              ev.eventId === eventItem.eventId ? { ...ev, votingPhaseState: 5 } : ev
            )
          );
          this.notifier.success('Results have been declared successfully.');
          this.isUpdatingVotingPhase.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to declare results.');
          this.isUpdatingVotingPhase.set(false);
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

    if (!this.isCurrentUserMasterAdmin() && !this.isCurrentUserAdmin()) {
      this.notifier.warn('Only Administrators can execute promotion workflows');
      return;
    }

    if (this.isCurrentUserAdmin() && String(member.committeeRole || '').toUpperCase() !== 'COMMITTEE_MEMBER') {
      this.notifier.warn('Admins can only promote members');
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

    if (!this.isCurrentUserMasterAdmin() && !this.isCurrentUserAdmin()) {
      this.notifier.warn('Only Administrators can eliminate accounts from workspaces');
      return;
    }

    if (this.isCurrentUserAdmin() && String(member.committeeRole || '').toUpperCase() !== 'COMMITTEE_MEMBER') {
      this.notifier.warn('Admins can only remove members');
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
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
        this.fetchCommitteeDetailsPayload(String(committee.committeeId));
      }
    });
  }

public onDeleteCommitteeWorkspace(): void {
    if (!this.isCurrentUserMasterAdmin()) return;
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