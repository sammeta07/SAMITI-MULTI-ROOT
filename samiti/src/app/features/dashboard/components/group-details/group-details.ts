import { Component, inject, OnInit, signal, computed, ViewChild, ElementRef, ChangeDetectorRef, effect } from '@angular/core';
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
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, finalize } from 'rxjs';

import { GroupDetailsService } from './group-details.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { 
  CommitteeEventListItem, 
  CommitteeProfileMeta, 
  CommitteeRosterMember, 
  CommitteeDetailsPayload 
} from './group-details.models';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { CreateEventDialogComponent } from '../../../../components/dialog/create-event/create-event.component';
import { ViewUserDialogComponent } from '../../../../components/dialog/view-user/view-user.component';
import { CreateCommitteeDialogComponent } from '../../../../components/dialog/create-committee/create-committee.component';
import { PromoteMemberDialogService } from '../../../../components/dialog/promote-member/promote-member.service';
import { DemoteMemberDialogService } from '../../../../components/dialog/demote-member/demote-member.service';
import { RemoveMemberDialogService } from '../../../../components/dialog/remove-member/remove-member.service';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { LoadingStateService } from '../../../../shared/services/loading-state.service';
import { TextFormatPipe } from '../../../../shared/pipe/text-format-pipe.pipe';
import { ImageAssetService } from '../../../../core/services/image-asset.service';
import { AuthService } from '../../../../core/services/auth.service';
import { getEventComputedStatus } from '../../../../shared/services/event-status.util';
import { ImageCropperDialogComponent } from '../../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';
import { SelectedYearService } from '../../../../shared/services/selected-year.service';

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
  private readonly loadingState = inject(LoadingStateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly authService = inject(AuthService);
  private readonly selectedYearService = inject(SelectedYearService);

  private readonly committeeIdForDetails = signal<string | null>(null);
  private detailsRequestSequence = 0;
  private readonly reloadDetailsForSelectedYear = effect(() => {
    const year = this.selectedYearService.selectedYear();
    const committeeId = this.committeeIdForDetails();
    if (committeeId) {
      this.fetchCommitteeDetailsPayload(committeeId, year);
    }
  });

  @ViewChild('eventsScrollContainer') eventsScrollContainer!: ElementRef<HTMLDivElement>;

  public readonly isLoading = signal<boolean>(false);
  public readonly copiedCommitteeId = signal<string | null>(null);
  public readonly isUploadingCommitteeLogo = signal<boolean>(false);
  public readonly isUploadingEventLogo = signal<boolean>(false);

  public readonly userRequestStatus = signal<'ACCEPTED' | 'PENDING' | 'REJECTED' | null>(null);
  public readonly userRequestRole = signal<'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' | 'COMMITTEE_MASTER_ADMIN' | null>(null);
  public readonly userCommitteeRole = signal<'COMMITTEE_MEMBER' | 'COMMITTEE_ADMIN' | 'COMMITTEE_MASTER_ADMIN' | null>(null);
  public readonly groupData = signal<CommitteeProfileMeta | null>(null);
  public readonly committeeEvents = signal<CommitteeEventListItem[]>([]);

  public readonly masterAdminsList = signal<CommitteeRosterMember[]>([]);
  public readonly adminsList = signal<CommitteeRosterMember[]>([]);
  public readonly membersList = signal<CommitteeRosterMember[]>([]);

  public readonly skeletonRows2 = [1, 2];
  public readonly skeletonRows6 = [1, 2, 3, 4, 5, 6];

  public readonly isCurrentUserMasterAdmin = computed(() => this.userCommitteeRole() === 'COMMITTEE_MASTER_ADMIN');
  public readonly isCurrentUserAdmin = computed(() => this.userCommitteeRole() === 'COMMITTEE_ADMIN');
  public readonly isCurrentUserMember = computed(() => this.userCommitteeRole() === 'COMMITTEE_MEMBER');
  public readonly isCurrentUserPending = computed(() => this.userRequestStatus() === 'PENDING');

  public readonly currentUserRoleLabel = computed(() => {
    if (this.isCurrentUserMasterAdmin()) return 'Master Admin';
    if (this.userCommitteeRole() === 'COMMITTEE_ADMIN') return 'Committee Admin';
    if (this.isCurrentUserMember()) return 'Committee Member';
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
  public readonly committeeIdString = computed(() => this.groupData()?.committeeId?.toString() ?? '');

  private readonly designationPhotos = signal<Record<string, string>>({});

  public readonly filteredMembersList = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.membersList();
    return this.membersList().filter(
      (member: CommitteeRosterMember) =>
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)
    );
  });

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const committeeId = params['id'];
      if (committeeId) {
        this.committeeIdForDetails.set(committeeId);
      }
    });
  }

  public getEventStatus(event: CommitteeEventListItem): string {
    return getEventComputedStatus(event.startDate, event.endDate);
  }

  public formatEventDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
    const startMatch = (startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const endMatch = (endDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!startMatch) {
      return 'N/A';
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const startMonth = months[Number(startMatch[2]) - 1] || startMatch[2];
    const startDay = startMatch[3];
    const startYear = startMatch[1];

    if (!endMatch) {
      return `${startDay}-${startMonth}-${startYear.slice(-2)}`;
    }

    const endMonth = months[Number(endMatch[2]) - 1] || endMatch[2];
    const endDay = endMatch[3];
    const endYear = endMatch[1];

    if (startYear === endYear && startMatch[2] === endMatch[2]) {
      return `${startDay} To ${endDay}-${endMonth}-${endYear.slice(-2)}`;
    }

    return `${startDay}-${startMonth}-${startYear.slice(-2)} To ${endDay}-${endMonth}-${endYear.slice(-2)}`;
  }

  public clearSearch(): void {
    this.searchQuery.set('');
  }

  public clearGroupLogo(): void {
    this.groupData.update((curr) => (curr ? { ...curr, logo: null } : curr));
  }

  public getDesignationPhoto(eventId: number, role: number | string): string | undefined {
    return this.designationPhotos()[`${eventId}:${role}`];
  }

  public getEventDesignationColor(eventId: number): string {
    const accountRoles = this.authService.getStoredUserData()?.accountRoles;
    if (!accountRoles?.committees) return '#64748b';
    for (const committee of accountRoles.committees) {
      const event = committee.events?.find((e: any) => e.eventId === eventId);
      if (event?.designation) {
        switch (event.designation.toUpperCase()) {
          case 'ADHYAKSHA': return '#d946ef';
          case 'UPADHYAKSHA': return '#8b5cf6';
          case 'KOSHADHYAKSHA': return '#f59e0b';
          case 'AANKSHAK': return '#0f172a';
          default: return '#64748b';
        }
      }
    }
    return '#64748b';
  }

  public getLoggedInUserId(): number {
    const userDataStr = localStorage.getItem('userData');
    if (userDataStr) {
      try {
        return JSON.parse(userDataStr).id || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  public async onCommitteeLogoSelected(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] || null;
    inputElement.value = '';

    if (!selectedFile || !this.isCurrentUserMasterAdmin()) return;

    const committee = this.groupData();
    if (!committee?.committeeId) {
      this.notifier.error('Committee reference is missing.');
      return;
    }

    const cropped = await this.openCropDialog(selectedFile, 'Crop Committee Logo');
    if (!cropped) return;

    this.isUploadingCommitteeLogo.set(true);

    try {
      const upload = await firstValueFrom(
        this.imageAssetService.uploadSingleImageForCommitteeLogo(cropped, `committee-logo-${committee.committeeId}`)
      );
      const updated = await firstValueFrom(
        this.groupDetailsService.updateCommitteeLogo(committee, upload.publicAbsoluteUrl)
      );

      const resolved = updated?.logo || upload.publicAbsoluteUrl;
      this.groupData.update((curr) => (curr ? { ...curr, logo: resolved } : curr));
      this.notifier.success(`Logo updated successfully.`);
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
    } catch (err: any) {
      this.notifier.error(err?.message || 'Failed to update logo.');
    } finally {
      this.isUploadingCommitteeLogo.set(false);
      this.cdr.detectChanges();
    }
  }

  public onEventLogoCircleClicked(eventItem: CommitteeEventListItem, event: Event): void {
    if (!this.isCurrentUserMasterAdmin() && !this.isCurrentUserAdmin()) return;
    event.stopPropagation();
    const host = (event.currentTarget as HTMLElement).querySelector('input[type="file"]') as HTMLInputElement | null;
    host?.click();
  }

  public async onEventLogoSelected(eventItem: CommitteeEventListItem, event: Event): Promise<void> {
    if (!this.isCurrentUserMasterAdmin() && !this.isCurrentUserAdmin()) return;
    event.stopPropagation();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const committeeId = this.groupData()?.committeeId;
    if (!committeeId || !eventItem?.eventId) return;

    const cropped = await this.openCropDialog(file, 'Crop Event Logo');
    if (!cropped) return;

    this.isUploadingEventLogo.set(true);
    try {
      const upload = await firstValueFrom(
        this.imageAssetService.uploadSingleImageForCommitteeLogo(cropped, `event-logo-${eventItem.eventId}`)
      );
      const updated = await firstValueFrom(
        this.groupDetailsService.updateEventLogo(eventItem.eventId, committeeId, upload.publicAbsoluteUrl)
      );
      const resolved = updated?.eventLogo || upload.publicAbsoluteUrl;
      this.committeeEvents.update((evts) =>
        evts.map((e) => (e.eventId === eventItem.eventId ? { ...e, eventLogo: resolved } : e))
      );
      this.notifier.success(`Event logo updated.`);
    } catch (err: any) {
      this.notifier.error(err?.message || 'Failed to update event logo.');
    } finally {
      this.isUploadingEventLogo.set(false);
    }
  }

  public onRequestAdminRole(): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;

    const dialogRef = this.confirmDialog.open({
      title: 'Request Admin Role',
      message: 'Are you sure you want to request admin role for this committee?',
      confirmText: 'Send Request',
      cancelText: 'Cancel',
      highlightText: committee.committeeName
    });

    dialogRef.afterClosed().subscribe((res) => {
      if (!res?.confirmed) return;
      this.groupDetailsService.requestCommitteeAdminRole(Number(committee.committeeId), 'COMMITTEE_ADMIN').subscribe({
        next: () => {
          this.notifier.success('Admin request submitted.');
          this.fetchCommitteeDetailsPayload(String(committee.committeeId));
        },
        error: (err: any) => this.notifier.error(err?.error?.message || 'Failed to request admin role.')
      });
    });
  }

  public onCancelAdminRoleRequest(): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;

    const dialogRef = this.confirmDialog.open({
      title: 'Cancel Admin Request',
      message: 'Are you sure you want to cancel your admin request?',
      confirmText: 'Cancel Request',
      cancelText: 'Keep Request',
      highlightText: committee.committeeName
    });

    dialogRef.afterClosed().subscribe((res) => {
      if (!res?.confirmed) return;
      this.groupDetailsService.cancelCommitteeMembershipRequest(Number(committee.committeeId)).subscribe({
        next: () => {
          this.notifier.success('Admin request cancelled.');
          this.fetchCommitteeDetailsPayload(String(committee.committeeId));
        },
        error: (err: any) => this.notifier.error(err?.error?.message || 'Failed to cancel request.')
      });
    });
  }

  public onViewMember(userId: number): void {
    const committee = this.groupData();
    if (!committee) return;
    const member = this.membersList().find((m) => m.id === userId) ||
                   this.adminsList().find((m) => m.id === userId) ||
                   this.masterAdminsList().find((m) => m.id === userId);
    if (!member) return;

    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(ViewUserDialogComponent, {
      width: '1000px',
      height: '100%',
      position: { right: '0', top: '0' },
      panelClass: 'slide-in-dialog',
      data: {
        userId: userId.toString(),
        committeeId: committee.committeeId?.toString() || '',
        userName: member.name,
        userEmail: member.email,
        isAdmin: member.committeeRole === 'COMMITTEE_ADMIN' || member.committeeRole === 'COMMITTEE_MASTER_ADMIN',
        committeeName: committee.committeeName || ''
      }
    });
    dialogRef.afterClosed().subscribe(() => document.body.classList.remove('dialog-open'));
  }

  public onPromoteMember(member: CommitteeRosterMember): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;

    const dialogRef = this.promoteMemberDialog.open({
      userId: String(member.id),
      committeeId: String(committee.committeeId),
      userName: member.name,
      currentRole: 'member',
      committeeName: committee.committeeName
    });

    dialogRef.afterClosed().subscribe((res) => {
      if (res?.confirmed) this.fetchCommitteeDetailsPayload(String(committee.committeeId));
    });
  }

  public onDemoteAdmin(admin: CommitteeRosterMember): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;

    const dialogRef = this.demoteMemberDialog.open({
      userId: String(admin.id),
      committeeId: String(committee.committeeId),
      userName: admin.name,
      currentRole: 'admin',
      committeeName: committee.committeeName
    });

    dialogRef.afterClosed().subscribe((res) => {
      if (res?.confirmed) this.fetchCommitteeDetailsPayload(String(committee.committeeId));
    });
  }

  public onRemoveCommitteeMember(member: CommitteeRosterMember): void {
    const committee = this.groupData();
    if (!committee?.committeeId) return;

    const dialogRef = this.removeMemberDialog.open({
      userId: String(member.id),
      committeeId: String(committee.committeeId),
      userName: member.name,
      committeeName: committee.committeeName
    });

    dialogRef.afterClosed().subscribe((res) => {
      if (res?.confirmed) this.fetchCommitteeDetailsPayload(String(committee.committeeId));
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
      panelClass: 'slide-in-dialog',
      data: {
        committeeId: committee.committeeId,
        committeeName: committee.committeeName || '',
        address: committee.address || '',
        eventType
      }
    });

    dialogRef.afterClosed().subscribe((res) => {
      document.body.classList.remove('dialog-open');
      if (res && committee.committeeId) {
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
      panelClass: 'slide-in-dialog',
      data: { committee }
    });

    dialogRef.afterClosed().subscribe((res) => {
      document.body.classList.remove('dialog-open');
      if (res) {
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
        this.fetchCommitteeDetailsPayload(String(committee.committeeId));
      }
    });
  }

  public onDeleteCommitteeWorkspace(): void {
    this.notifier.warn('Delete group capability will be available soon.');
  }

  public async copyCommitteeId(committeeId: string, event: Event, tooltip: MatTooltip): Promise<void> {
    event.stopPropagation();
    try {
      this.copiedCommitteeId.set(committeeId);
      await navigator.clipboard.writeText(committeeId);
      const original = tooltip.message;
      tooltip.message = `Copied ID: ${committeeId}`;
      tooltip.show();
      setTimeout(() => {
        this.copiedCommitteeId.set(null);
        tooltip.hide();
        setTimeout(() => tooltip.message = original, 300);
      }, 2000);
    } catch {
      this.notifier.error('Failed to copy ID');
      this.copiedCommitteeId.set(null);
    }
  }

  private fetchCommitteeDetailsPayload(id: string, year = this.selectedYearService.selectedYear()): void {
    const requestSequence = ++this.detailsRequestSequence;
    this.isLoading.set(true);
    this.loadingState.begin();

    this.groupDetailsService.getCommitteeDetails(id, year).pipe(
      finalize(() => {
        this.loadingState.end();
        if (requestSequence !== this.detailsRequestSequence) return;
        this.isLoading.set(false);
      })
    ).subscribe({
      next: (data: CommitteeDetailsPayload) => {
        if (requestSequence !== this.detailsRequestSequence) return;
        if (!data?.committeeId) {
          this.notifier.error('Failed to parse committee information.');
          return;
        }

        this.groupData.set({
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
        });

        this.userCommitteeRole.set(data.committeeRole ?? null);
        this.userRequestStatus.set(data.userRequestStatus ?? null);
        this.userRequestRole.set(data.userRequestRole ?? null);

        const pool = data.members || [];
        this.masterAdminsList.set(pool.filter((m) => String(m.committeeRole || '').toUpperCase() === 'COMMITTEE_MASTER_ADMIN'));
        this.adminsList.set(pool.filter((m) => String(m.committeeRole || '').toUpperCase() === 'COMMITTEE_ADMIN'));
        this.membersList.set(pool.filter((m) => String(m.committeeRole || '').toUpperCase() === 'COMMITTEE_MEMBER'));

        if (data.events?.length) {
          const safeEvents = data.events.map((e) => ({
            ...e,
            id: e.id || Number(e.eventId || 0)
          }));
          this.committeeEvents.set(this.sortEventsByTimeline(safeEvents));
          setTimeout(() => this.scrollToActiveEvent(), 100);
        } else {
          this.committeeEvents.set([]);
        }
      },
      error: (err: HttpErrorResponse) => {
        if (requestSequence !== this.detailsRequestSequence) return;
        this.notifier.error(err?.error?.message || 'Error loading group workspace.');
      }
    });
  }

  private sortEventsByTimeline(events: CommitteeEventListItem[]): CommitteeEventListItem[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getScore = (event: CommitteeEventListItem): number => {
      const start = event.startDate ? new Date(event.startDate) : null;
      const end = event.endDate ? new Date(event.endDate) : null;
      if (end && today > end) return 1; // Completed
      if (!start) return 3;
      if (today < start) return 3; // Upcoming
      return 2; // Started / Ongoing
    };

    return [...events].sort((a, b) => {
      const scoreDiff = getScore(a) - getScore(b);
      if (scoreDiff !== 0) return scoreDiff;
      const timeA = a.startDate ? new Date(a.startDate).getTime() : Infinity;
      const timeB = b.startDate ? new Date(b.startDate).getTime() : Infinity;
      return timeA - timeB;
    });
  }

  private scrollToActiveEvent(retries = 5): void {
    const container = this.eventsScrollContainer?.nativeElement;
    if (!container || retries === 0) return;

    const events = this.committeeEvents();
    if (!events.length) return;

    const targetIndex = events.findIndex((e) => {
      const status = this.getEventStatus(e).toLowerCase();
      return status === 'started' || status === 'ongoing' || status === 'upcoming';
    });

    if (targetIndex === -1) return;

    const eventElements = container.querySelectorAll('.event-aligned-row');
    const targetElement = eventElements[targetIndex] as HTMLElement;

    if (!targetElement) {
      setTimeout(() => this.scrollToActiveEvent(retries - 1), 50);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = targetElement.getBoundingClientRect();
    const targetTop = container.scrollTop + (elementRect.top - containerRect.top) - 8;
    container.scrollTo({ top: targetTop, behavior: 'smooth' });
  }

  private async openCropDialog(file: File, title: string): Promise<File | null> {
    return firstValueFrom(
      this.dialog.open(ImageCropperDialogComponent, {
        width: 'min(92vw, 860px)',
        data: {
          file,
          title,
          maintainAspectRatio: true,
          aspectRatio: 1
        }
      }).afterClosed()
    );
  }
}