import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EventDetailsService } from './event-details.service';
import { EventVoteHistory, EventResultsPayload, EventResultCandidate } from './event-details.service';
import { EventDetailsPayload, EventMappedVotingRole, EventPerson } from './event-details.models';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { CreateProgramDialogComponent } from '../../../../components/dialog/create-program/create-program.component';
import { CreateEventDialogComponent } from '../../../../components/dialog/create-event/create-event.component';
import { VoteHistoryDialogComponent } from '../../../../components/dialog/vote-history/vote-history.component';
import { ImageAssetService } from '../../../../core/services/image-asset.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatTooltipModule,
    MatCardModule
  ],
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss'
})
export class EventDetailsComponent implements OnInit {
  @ViewChild('bannerFileInput') private readonly bannerFileInput?: ElementRef<HTMLInputElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly eventDetailsService = inject(EventDetailsService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly authService = inject(AuthService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);

  // public readonly isLoading = signal<boolean>(false);
  public readonly isBannerUploading = signal<boolean>(false);
  public readonly isVisibilityUpdating = signal<boolean>(false);
  public readonly eventData = signal<EventDetailsPayload | null>(null);
  public readonly eventAdmins = signal<EventPerson[]>([]);
  public readonly eventMembers = signal<EventPerson[]>([]);
  public readonly selectedVotingRoleIds = signal<number[]>([]);
  public readonly isSavingVotingRoles = signal<boolean>(false);
  public readonly isLockingVotingRoles = signal<boolean>(false);
  public readonly isUnlockingVotingRoles = signal<boolean>(false);
  public readonly isUpdatingVotingPhase = signal<boolean>(false);
  public readonly myInterestRoleIds = signal<number[]>([]);
  public readonly myInterestStatuses = signal<Array<{ roleId: number; status: string }>>([]);
  public readonly isExpressingInterest = signal<boolean>(false);
  public readonly interestReviewList = signal<Array<{
    id: number;
    eventId: number;
    roleId: number;
    roleName?: string | null;
    userId: number;
    userName: string;
    userEmail: string;
    userPhoto?: string | null;
    status: string;
  }>>([]);
  public readonly myVotes = signal<Record<number, number>>({});
  public readonly eventResults = signal<EventResultsPayload | null>(null);

  public readonly MAX_BANNERS = 5;

  public get programsCount(): number {
    return this.eventData()?.programs?.length ?? 0;
  }

  public get canManageVotingRoles(): boolean {
    return this.eventData()?.canManageVotingRoles ?? false;
  }

  public get isVotingRolesLocked(): boolean {
    return this.votingPhaseState >= 1;
  }

  public get votingPhaseState(): number {
    return Number(this.eventData()?.votingPhaseState || 0);
  }

  public get isLockControlEnabled(): boolean {
    return this.votingPhaseState === 0 && this.currentEventMappedRoleCount > 0;
  }

  public get isStartNominationsEnabled(): boolean {
    return this.votingPhaseState === 1;
  }

  public get isStopNominationsEnabled(): boolean {
    return this.votingPhaseState === 2;
  }

  public get isStartVotingEnabled(): boolean {
    return this.votingPhaseState === 3;
  }

  public get isStopVotingEnabled(): boolean {
    return this.votingPhaseState === 4;
  }

  public get isDeclareResultsEnabled(): boolean {
    return this.votingPhaseState === 5;
  }

  public get canEditVotingRoles(): boolean {
    return this.canManageVotingRoles && !this.isVotingRolesLocked && this.votingPhaseState === 0;
  }

  public get canStartNominations(): boolean {
    return this.canManageVotingRoles && this.isVotingRolesLocked && this.votingPhaseState === 0;
  }

  public get canLockVotingRoles(): boolean {
    return this.canManageVotingRoles && !this.isVotingRolesLocked && this.votingPhaseState === 0 && this.currentEventMappedRoleCount > 0;
  }

  public get isVotingEnabled(): boolean {
    return this.votingPhaseState === 4;
  }

  public get isVotingClosed(): boolean {
    return this.votingPhaseState >= 5;
  }

  public get isNominationsStarted(): boolean {
    return this.votingPhaseState >= 1;
  }

  public get isNominationsStopped(): boolean {
    return this.votingPhaseState >= 2;
  }

  public get isNominationsInProgress(): boolean {
    return this.votingPhaseState >= 1 && this.votingPhaseState <= 3;
  }

  // Compact card layout: master admin during phases 2-5 (review + voting mode),
  // and admin/members during phases 2-5 once the read-only list is shown.
  // Phase 1 shows the big-circle card for everyone.
  public get isCompactVotingCard(): boolean {
    return this.votingPhaseState === 2 || this.votingPhaseState === 3 || this.votingPhaseState === 4 || this.votingPhaseState === 5;
  }

  public get canStopNominations(): boolean {
    return this.canManageVotingRoles && this.votingPhaseState === 1;
  }

  public get canStartVoting(): boolean {
    return this.canManageVotingRoles && this.votingPhaseState === 2;
  }

  public get votingPhaseLabel(): string {
    switch (this.votingPhaseState) {
      case 6:
        return 'Results Declared';
      case 5:
        return 'Voting Stopped';
      case 4:
        return 'Voting Started';
      case 3:
        return 'Nominations Stopped';
      case 2:
        return 'Nominations Started';
      case 1:
        return 'Roles Locked';
      default:
        return '';
    }
  }

  public get votingPhaseIcon(): string {
    if (this.votingPhaseState >= 6) {
      return 'emoji_events';
    }

    if (this.isVotingClosed) {
      return 'event_busy';
    }

    if (this.isVotingEnabled) {
      return 'how_to_vote';
    }

    if (this.isNominationsStopped) {
      return 'pause_circle';
    }

    if (this.isNominationsStarted) {
      return 'schedule';
    }

    return 'hourglass_top';
  }

  public get canStopVoting(): boolean {
    return this.canManageVotingRoles && this.votingPhaseState === 3;
  }

  public get currentEventMappedRoleCount(): number {
    return this.eventData()?.mappedVotingRoles?.length ?? 0;
  }

  public get currentEventDisplayTitle(): string {
    const rawName = String(this.eventData()?.eventName || '').trim();
    if (!rawName) {
      return 'Event';
    }

    return rawName
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  public get votingGridLayoutClass(): string {
    if (this.currentEventMappedRoleCount <= 1) {
      return 'voting-nomination-grid-single';
    }

    if (this.currentEventMappedRoleCount === 2) {
      return 'voting-nomination-grid-double';
    }

    return 'voting-nomination-grid-multi';
  }

  public get votingDisplayCards(): Array<{ slot: number; role: EventMappedVotingRole }> {
    const mappedRoles = this.eventData()?.mappedVotingRoles ?? [];
    const presidentRole = mappedRoles.find((role) => this.isPresidentRole(role)) || null;
    const remainingRoles = mappedRoles.filter((role) => role !== presidentRole);
    const orderedRoles = presidentRole ? [presidentRole, ...remainingRoles] : mappedRoles;

    return orderedRoles.map((role, index) => ({
      slot: index + 1,
      role
    }));
  }

  public get currentCommitteeRoleLabel(): string {
    const role = String(this.eventData()?.currentCommitteeRole || 'NONE').toUpperCase();
    if (role === 'COMMITTEE_ADMIN' || role === 'COMMITTEE_MASTER_ADMIN') {
      return 'Group Admin';
    }

    if (role === 'COMMITTEE_MEMBER') {
      return 'Group Member';
    }

    return 'No Group Role';
  }

  public get isAllDesignationsVisible(): boolean {
    if (this.votingPhaseState >= 1) {
      return false;
    }
    return String(this.eventData()?.currentCommitteeRole || 'NONE').toUpperCase() !== 'COMMITTEE_MEMBER';
  }

  public get isCommitteeMember(): boolean {
    return String(this.eventData()?.currentCommitteeRole || 'NONE').toUpperCase() === 'COMMITTEE_MEMBER';
  }

  public get isMasterAdmin(): boolean {
    return String(this.eventData()?.currentCommitteeRole || 'NONE').toUpperCase() === 'COMMITTEE_MASTER_ADMIN';
  }

  public get canReviewInterest(): boolean {
    return this.eventData()?.canReviewInterest ?? false;
  }

  // Load pending interests as soon as the event is available so the list
  // shows without waiting on a second conditional pass.
  private get shouldLoadPendingInterests(): boolean {
    return !!this.eventData()?.eventId && (this.canReviewInterest || this.votingPhaseState >= 1);
  }

  public get pendingInterestCount(): number {
    return this.interestReviewList().length;
  }

  public approvedPeopleForRole(roleId: number): Array<{ userId: number; name: string; email: string; photo?: string | null }> {
    const list = this.eventData()?.interestApprovedPeople ?? [];
    const match = list.find((info) => Number(info.roleId) === Number(roleId));
    return match?.approvedPeople ?? [];
  }

  public pendingInterestForRole(roleId: number): Array<{
    id: number;
    eventId: number;
    roleId: number;
    userId: number;
    userName: string;
    userEmail: string;
    userPhoto?: string | null;
    status: string;
  }> {
    const roleIdNum = Number(roleId);
    let allForRole = this.interestReviewList().filter((item) => Number(item.roleId) === roleIdNum);

    // During the finalized selection phase (voting started), non-master-admins
    // (ADMIN / MEMBER) must only see the rows the master admin approved.
    if (!this.isMasterAdmin && this.votingPhaseState >= 4) {
      allForRole = allForRole.filter((item) => String(item.status).toUpperCase() === 'APPROVED');
    }

    if (this.votingPhaseState === 4 || this.votingPhaseState === 5) {
      allForRole = allForRole.sort((a, b) => {
        const aApproved = String(a.status).toUpperCase() === 'APPROVED' ? 0 : 1;
        const bApproved = String(b.status).toUpperCase() === 'APPROVED' ? 0 : 1;
        return aApproved - bApproved;
      });
    }

    return allForRole;
  }

  public pendingInterestCountsForRole(roleId: number): { total: number; approved: number } {
    const list = this.pendingInterestForRole(roleId);
    const total = list.length;
    const approved = list.filter((item) => String(item.status).toUpperCase() === 'APPROVED').length;
    return { total, approved };
  }

  public isApprovedOnlyView(roleId: number): boolean {
    return this.isVotingEnabled && !this.isMasterAdmin;
  }

  public onCastVote(roleId: number, candidate?: { userId: number; userName: string }): void {
    const event = this.eventData();
    if (!this.isVotingEnabled || !event?.eventId || !candidate) {
      return;
    }
    const roleName = this.getRoleDisplayName(roleId);
    this.eventDetailsService.castEventVote(Number(event.eventId), Number(roleId), Number(candidate.userId)).subscribe({
      next: (payload) => {
        if (payload?.voted) {
          this.myVotes.update(current => ({ ...current, [Number(roleId)]: Number(candidate.userId) }));
          this.notifier.success(`Your vote for **${candidate.userName}** (${roleName}) has been recorded.`);
        } else {
          this.notifier.error('Failed to record your vote.');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to record your vote.');
      }
    });
  }

  public hasVotedFor(roleId: number, candidateId: number): boolean {
    const votes = this.myVotes();
    const myCandidateId = votes[Number(roleId)];
    return Number(myCandidateId) === Number(candidateId);
  }

  public getMyVoteForRole(roleId: number): number | null {
    const votes = this.myVotes();
    const candidateId = votes[Number(roleId)];
    return candidateId ? Number(candidateId) : null;
  }

  public getWinnerForRole(roleId: number): EventResultCandidate | null {
    const results = this.eventResults();
    if (!results?.roles?.length) {
      return null;
    }
    const roleResult = results.roles.find((r) => Number(r.roleId) === Number(roleId));
    if (!roleResult?.candidates?.length) {
      return null;
    }
    const maxVotes = Math.max(...roleResult.candidates.map((c) => Number(c.voteCount || 0)));
    if (maxVotes <= 0) {
      return null;
    }
    return roleResult.candidates.find((c) => Number(c.voteCount || 0) === maxVotes) || null;
  }

  public getVoteCountForRole(roleId: number): number {
    const results = this.eventResults();
    if (!results?.roles?.length) {
      return 0;
    }
    const roleResult = results.roles.find((r) => Number(r.roleId) === Number(roleId));
    return Number(roleResult?.totalVotes || 0);
  }

  public getCandidatesForRole(roleId: number): EventResultCandidate[] {
    const results = this.eventResults();
    if (!results?.roles?.length) {
      return [];
    }
    const roleResult = results.roles.find((r) => Number(r.roleId) === Number(roleId));
    if (!roleResult?.candidates?.length) {
      return [];
    }
    return [...roleResult.candidates].sort((a, b) => Number(b.voteCount || 0) - Number(a.voteCount || 0));
  }

  public openVoteHistory(): void {
    const event = this.eventData();
    if (!event?.eventId) {
      return;
    }

    const eventId = Number(event.eventId);

    this.eventDetailsService.getEventVoteHistory(eventId).subscribe({
      next: (history) => {
        this.openVoteHistoryDialog(history);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load vote history.');
      }
    });
  }

  private openVoteHistoryDialog(history: EventVoteHistory): void {
    const event = this.eventData();
    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(VoteHistoryDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog',
      data: {
        history,
        eventLogo: event?.eventBanner || event?.bannerImages?.[0] || null
      }
    });

    dialogRef.afterClosed().subscribe(() => {
      document.body.classList.remove('dialog-open');
    });
  }


  public isInterestedInRole(roleId: number): boolean {
    return this.myInterestRoleIds().includes(Number(roleId));
  }

  public getMyInterestStatus(roleId: number): string {
    const match = this.myInterestStatuses().find((item) => Number(item.roleId) === Number(roleId));
    return match ? String(match.status).toUpperCase() : 'NONE';
  }

  public getRoleDisplayName(roleId: number): string {
    const role = (this.eventData()?.mappedVotingRoles || []).find((r) => Number(r.roleId) === Number(roleId));
    const raw = role?.englishName || role?.roleName || role?.hindiName || '';
    return String(raw)
      .split(/[_\s]+/)
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  public get nominationWaitMessage(): string {
    if (this.currentCommitteeRoleLabel === 'Group Member') {
      return 'Wait for your admin to start nominations';
    }

    return 'Nominations not started';
  }

  public get currentLoggedInUserId(): number {
    return Number(this.authService.getStoredUserData()?.id || 0);
  }

  public get bannerCount(): number {
    return this.eventData()?.bannerImages?.length ?? 0;
  }

  public get canUploadMoreBanners(): boolean {
    return this.bannerCount < this.MAX_BANNERS;
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const eventId = params['id'];
      if (eventId) {
        this.fetchEventDetails(eventId);
      }
    });
  }

  private fetchEventDetails(id: string): void {
    // this.isLoading.set(true);
    this.eventData.set(null);
    this.eventAdmins.set([]);
    this.eventMembers.set([]);
    this.selectedVotingRoleIds.set([]);
    this.isUpdatingVotingPhase.set(false);
    this.myVotes.set({});
    this.eventResults.set(null);

    this.eventDetailsService.getEventDetails(id).subscribe({
      next: (data: EventDetailsPayload) => {
        this.eventData.set(data ?? null);
        this.populateEventPeople(data ?? null);
        this.selectedVotingRoleIds.set(
          (data?.mappedVotingRoles || [])
            .map((role) => Number(role.roleId))
            .filter((roleId) => Number.isInteger(roleId) && roleId > 0)
        );
        this.myInterestRoleIds.set(
          (data?.myInterestRoleIds || []).map((id) => Number(id))
        );
        this.myInterestStatuses.set(
          (data?.myInterestStatuses || []).map((item) => ({ roleId: Number(item.roleId), status: String(item.status || 'PENDING') }))
        );
        this.interestReviewList.set([]);
        this.loadPendingInterests();
        this.loadMyVotes(Number(id));
        if (Number(data?.votingPhaseState || 0) === 6) {
          this.loadEventResults(Number(id));
        }
        this.isUpdatingVotingPhase.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load event details.');
        this.eventData.set(null);
        this.eventAdmins.set([]);
        this.eventMembers.set([]);
        this.selectedVotingRoleIds.set([]);
        this.isUpdatingVotingPhase.set(false);
        this.eventResults.set(null);
        // this.isLoading.set(false);
      }
    });
  }

  private loadMyVotes(eventId: number): void {
    this.eventDetailsService.getMyEventVotes(eventId).subscribe({
      next: (payload) => {
        const votes: Record<number, number> = {};
        (payload?.votes || []).forEach((vote) => {
          votes[Number(vote.roleId)] = Number(vote.candidateId);
        });
        this.myVotes.set(votes);
      },
      error: () => {
        this.myVotes.set({});
      }
    });
  }

  private loadEventResults(eventId: number): void {
    this.eventDetailsService.getEventResults(eventId).subscribe({
      next: (payload) => {
        this.eventResults.set(payload ?? null);
      },
      error: () => {
        this.eventResults.set(null);
      }
    });
  }

  public isPresidentRole(role?: EventMappedVotingRole | null): boolean {
    const normalizedRoleName = `${role?.roleName || ''} ${role?.englishName || ''} ${role?.hindiName || ''}`.toUpperCase();
    return normalizedRoleName.includes('ADHYAKSHA') || normalizedRoleName.includes('ADHYAKSH') || normalizedRoleName.includes('PRESIDENT');
  }

  public getVotingRoleIcon(role?: EventMappedVotingRole | null): string {
    const normalizedRoleName = `${role?.roleName || ''} ${role?.englishName || ''} ${role?.hindiName || ''}`.toUpperCase();

    if (normalizedRoleName.includes('ADHYAKSHA') || normalizedRoleName.includes('PRESIDENT')) {
      return 'military_tech';
    }

    if (normalizedRoleName.includes('UPADHYAKSHA') || normalizedRoleName.includes('VICE')) {
      return 'workspace_premium';
    }

    if (normalizedRoleName.includes('SECRETARY') || normalizedRoleName.includes('SACHIV')) {
      return 'assignment_ind';
    }

    if (normalizedRoleName.includes('CASHIER') || normalizedRoleName.includes('TREASURER')) {
      return 'account_balance_wallet';
    }

    return 'how_to_vote';
  }

  public isRoleMapped(roleId?: number | null): boolean {
    const normalizedRoleId = Number(roleId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) {
      return false;
    }

    return this.selectedVotingRoleIds().includes(normalizedRoleId);
  }

  public onToggleVotingRole(roleId: number, checked: boolean): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for role mapping');
      return;
    }

    if (!this.canEditVotingRoles) {
      return;
    }

    const normalizedRoleId = Number(roleId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) {
      return;
    }

    const currentIds = this.selectedVotingRoleIds();
    const optimisticIds = checked
      ? (currentIds.includes(normalizedRoleId) ? currentIds : [...currentIds, normalizedRoleId])
      : currentIds.filter((id) => id !== normalizedRoleId);
    this.selectedVotingRoleIds.set(optimisticIds);

    this.eventDetailsService.toggleEventVotingRole(currentEvent.eventId, normalizedRoleId, checked).subscribe({
      next: () => {
        this.notifier.success(checked ? 'Role added for voting.' : 'Role removed from voting.');
        this.fetchEventDetails(String(currentEvent.eventId));
      },
      error: (err: HttpErrorResponse) => {
        this.selectedVotingRoleIds.set(currentIds);
        this.notifier.error(err?.error?.message || 'Failed to update voting role.');
      }
    });
  }

  public onLockVotingRoles(): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for role locking');
      return;
    }

    if (this.currentEventMappedRoleCount === 0) {
      this.notifier.warn('Select at least one role before locking voting role selection.');
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Lock Voting Role Selection',
      message: 'Are you sure you want to lock role selection for this event? This will start the voting lifecycle (phase 1) and after locking, even committee admin cannot change mapped voting roles.',
      confirmText: 'Lock Roles',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.isLockingVotingRoles.set(true);
      this.eventDetailsService.lockEventVotingRoles(currentEvent.eventId).subscribe({
        next: () => {
          this.notifier.success('Voting role selection has been locked and the voting lifecycle has started.');
          this.isLockingVotingRoles.set(false);
          this.fetchEventDetails(String(currentEvent.eventId));
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to lock voting role selection.');
          this.isLockingVotingRoles.set(false);
        }
      });
    });
  }

  public onStartNominations(): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for starting nominations');
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Start Nominations',
      message: 'Are you sure you want to start nominations? Members will be able to nominate and withdraw.',
      confirmText: 'Start Nominations',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.eventDetailsService.startEventNominations(currentEvent.eventId).subscribe({
        next: () => {
          this.notifier.success('Nominations have been started successfully.');
          this.fetchEventDetails(String(currentEvent.eventId));
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to start nominations.');
        }
      });
    });
  }

  public onStopNominations(): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for stopping nominations');
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Stop Nominations',
      message: 'Are you sure you want to stop nominations? Members will no longer be able to nominate or withdraw.',
      confirmText: 'Stop Nominations',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.eventDetailsService.stopEventNominations(currentEvent.eventId).subscribe({
        next: () => {
          this.notifier.success('Nominations have been stopped successfully.');
          this.fetchEventDetails(String(currentEvent.eventId));
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to stop nominations.');
        }
      });
    });
  }

  public onStartVoting(): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for starting voting');
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Start Voting',
      message: 'Are you sure you want to start voting? All members including admins will be able to vote.',
      confirmText: 'Start Voting',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.eventDetailsService.allowEventVoting(currentEvent.eventId).subscribe({
        next: () => {
          this.notifier.success('Voting has been started successfully.');
          this.fetchEventDetails(String(currentEvent.eventId));
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to start voting.');
        }
      });
    });
  }

  public onStopVoting(): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for stopping voting');
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Stop Voting',
      message: 'Are you sure you want to stop voting? After this, voting will be closed.',
      confirmText: 'Stop Voting',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.eventDetailsService.stopEventVoting(currentEvent.eventId).subscribe({
        next: () => {
          this.notifier.success('Voting has been stopped successfully.');
          this.fetchEventDetails(String(currentEvent.eventId));
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to stop voting.');
        }
      });
    });
  }

  public onDeclareResults(): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for declaring results');
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Declare Results',
      message: 'Are you sure you want to declare the results? Voting will be finalized and results will be published.',
      confirmText: 'Declare Results',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.eventDetailsService.declareEventResults(currentEvent.eventId).subscribe({
        next: () => {
          this.notifier.success('Results have been declared successfully.');
          this.fetchEventDetails(String(currentEvent.eventId));
          this.loadEventResults(Number(currentEvent.eventId));
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to declare results.');
        }
      });
    });
  }

  public onExpressInterest(roleId: number): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for expressing interest');
      return;
    }

    if (this.isExpressingInterest()) {
      return;
    }

    const normalizedRoleId = Number(roleId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) {
      return;
    }

    const wasInterested = this.isInterestedInRole(normalizedRoleId);
    const optimisticIds = wasInterested
      ? this.myInterestRoleIds().filter((id) => id !== normalizedRoleId)
      : [...this.myInterestRoleIds(), normalizedRoleId];
    const optimisticStatuses = wasInterested
      ? this.myInterestStatuses().filter((item) => item.roleId !== normalizedRoleId)
      : [...this.myInterestStatuses(), { roleId: normalizedRoleId, status: 'PENDING' }];

    const loggedInUser = this.authService.getStoredUserData();
    const previousReviewList = this.interestReviewList();
    const optimisticReviewList = wasInterested
      ? previousReviewList.filter(
          (entry) => !(entry.roleId === normalizedRoleId && entry.userId === this.currentLoggedInUserId)
        )
      : [
          ...previousReviewList,
          {
            id: -Date.now(),
            eventId: Number(currentEvent.eventId),
            roleId: normalizedRoleId,
            userId: this.currentLoggedInUserId,
            userName: loggedInUser?.name || 'You',
            userEmail: loggedInUser?.email || '',
            userPhoto: loggedInUser?.photo || null,
            status: 'PENDING'
          }
        ];

    this.myInterestRoleIds.set(optimisticIds);
    this.myInterestStatuses.set(optimisticStatuses);
    this.interestReviewList.set(optimisticReviewList);
    this.isExpressingInterest.set(true);

    const roleLabel = this.getRoleDisplayName(normalizedRoleId);

    this.eventDetailsService.expressEventInterest(currentEvent.eventId, normalizedRoleId).subscribe({
      next: (payload) => {
        this.myInterestRoleIds.set((payload.myInterestRoleIds || []).map((id) => Number(id)));
        this.myInterestStatuses.set(
          (payload.myInterestStatuses || []).map((item) => ({ roleId: Number(item.roleId), status: String(item.status || 'PENDING') }))
        );
        this.loadPendingInterests();
        this.isExpressingInterest.set(false);
        this.notifier.success(
          payload.expressed
            ? `Your interest has been submitted for **${roleLabel}**.`
            : `Interest withdrawn for **${roleLabel}**.`
        );
      },
      error: (err: HttpErrorResponse) => {
        this.myInterestRoleIds.set(optimisticIds);
        this.myInterestStatuses.set(optimisticStatuses);
        this.interestReviewList.set(previousReviewList);
        this.isExpressingInterest.set(false);
        this.notifier.error(err?.error?.message || 'Failed to update interest.');
      }
    });
  }

  private loadPendingInterests(): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      return;
    }

    this.eventDetailsService.getPendingInterests(currentEvent.eventId).subscribe({
      next: (summary) => {
        this.interestReviewList.set(
          (summary?.pending || []).map((item) => ({
            id: Number(item.id),
            eventId: Number(item.eventId),
            roleId: Number(item.roleId),
            roleName: item.roleName,
            userId: Number(item.userId),
            userName: item.userName,
            userEmail: item.userEmail,
            userPhoto: item.userPhoto,
            status: String(item.status || 'PENDING').toUpperCase()
          }))
        );
      },
      error: () => {
        this.interestReviewList.set([]);
      }
    });
  }

  public onReviewInterest(item: { eventId: number; roleId: number; userId: number; userName?: string }, status: 'APPROVED' | 'REJECTED'): void {
    if (!this.canReviewInterest) {
      return;
    }

    const normalizedRoleId = Number(item.roleId);
    const normalizedUserId = Number(item.userId);
    const normalizedEventId = Number(item.eventId);

    const previousList = this.interestReviewList();
    this.interestReviewList.update((list) =>
      list.map((entry) =>
        entry.roleId === normalizedRoleId && entry.userId === normalizedUserId
          ? { ...entry, status }
          : entry
      )
    );

    this.eventDetailsService.reviewEventInterest(normalizedEventId, normalizedRoleId, normalizedUserId, status).subscribe({
      next: (payload) => {
        if (status === 'APPROVED') {
          const designation = this.getRoleDisplayName(normalizedRoleId);
          if (payload?.autoRejectedOthers) {
            this.notifier.success(`You approved **${item.userName}** for **${designation}**. Their remaining requests in other designations have been auto-rejected.`);
          } else {
            this.notifier.success(`You approved **${item.userName}** for **${designation}**.`);
          }
        } else {
          this.notifier.success('Interest rejected.');
        }
        this.loadPendingInterests();
      },
      error: (err: HttpErrorResponse) => {
        this.interestReviewList.set(previousList);
        this.notifier.error(err?.error?.message || 'Failed to review interest.');
      }
    });
  }

  public getInterestStatusClass(status: string): string {
    const normalized = String(status || 'PENDING').toUpperCase();
    if (normalized === 'APPROVED') {
      return 'pending-row-approved';
    }
    if (normalized === 'REJECTED') {
      return 'pending-row-rejected';
    }
    return 'pending-row-pending';
  }

  private populateEventPeople(data: EventDetailsPayload | null): void {
    const participants = data?.eventParticipants ?? [];
    const admins: EventPerson[] = [];
    const members: EventPerson[] = [];

    for (const participant of participants) {
      const person: EventPerson = {
        id: Number(participant.userId),
        name: participant.name,
        email: participant.email,
        photo: participant.photo || null
      };

      if (participant.designation.includes('ADMIN')) {
        admins.push(person);
      } else {
        members.push(person);
      }
    }

    this.eventAdmins.set(admins);
    this.eventMembers.set(members);
  }

  public onEditEvent(): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId || !currentEvent?.committeeId) {
      this.notifier.error('No event available for editing');
      return;
    }

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
        eventId: currentEvent.eventId,
        committeeId: currentEvent.committeeId,
        address: currentEvent.committeeAddress || '',
        eventType: currentEvent.type === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
        visibility: currentEvent.visibility,
        eventName: currentEvent.eventName,
        eventDisplayName: currentEvent.eventDisplayName,
        status: currentEvent.status,
        category: currentEvent.category,
        startDate: currentEvent.startDate,
        endDate: currentEvent.endDate,
        latitude: currentEvent.latitude,
        longitude: currentEvent.longitude
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (!result) {
        return;
      }

      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.fetchEventDetails(String(currentEvent.eventId));
    });
  }

  public onAddBannerClick(): void {
    if (!this.bannerFileInput?.nativeElement) {
      this.notifier.error('File picker is not ready. Please try again.');
      return;
    }

    this.bannerFileInput.nativeElement.value = '';
    this.bannerFileInput.nativeElement.click();
  }

  public async onBannerFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const selectedFiles = Array.from(input.files || []);
    if (!selectedFiles.length) return;

    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) return;

    const slotsAvailable = this.MAX_BANNERS - this.bannerCount;
    if (slotsAvailable <= 0) {
      this.notifier.warn(`Maximum ${this.MAX_BANNERS} banner images allowed. Delete existing banners first.`);
      return;
    }

    const filesToUpload = selectedFiles.slice(0, slotsAvailable);
    if (selectedFiles.length > slotsAvailable) {
      this.notifier.warn(`Only ${slotsAvailable} slot(s) remaining. Uploading first ${slotsAvailable} image(s).`);
    }

    this.isBannerUploading.set(true);
    try {
      const uploadedAssets = await firstValueFrom(
        this.imageAssetService.uploadMultipleImagesForEventBanners(filesToUpload)
      );
      const urls = uploadedAssets.map((a) => a.publicAbsoluteUrl);

      const result = await firstValueFrom(
        this.eventDetailsService.uploadEventBannerImages(currentEvent.eventId, urls)
      );

      this.eventData.update((prev) => prev ? { ...prev, bannerImages: result.bannerImages, eventBanner: result.bannerImages[0] || prev.eventBanner } : prev);
      this.notifier.success(`${urls.length} banner image${urls.length > 1 ? 's' : ''} uploaded successfully.`);
    } catch (err: any) {
      this.notifier.error(err?.error?.message || err?.message || 'Failed to upload banner images.');
    } finally {
      this.isBannerUploading.set(false);
    }
  }

  public onDeleteBanner(imageUrl: string): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId || !imageUrl) return;

    const dialogData: ConfirmDialogData = {
      title: 'Delete Banner Image',
      message: 'Are you sure you want to delete this banner image? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

      this.eventDetailsService.deleteEventBannerImage(currentEvent.eventId, imageUrl).subscribe({
        next: (payload) => {
          this.eventData.update((prev) => prev ? { ...prev, bannerImages: payload.bannerImages, eventBanner: payload.bannerImages[0] || null } : prev);
          this.notifier.success('Banner image deleted successfully.');
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to delete banner image.');
        }
      });
    });
  }

  public onCreateProgram(): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available');
      return;
    }

    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateProgramDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog',
      data: {
        eventId: currentEvent.eventId,
        address: currentEvent.committeeAddress || ''
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (result) {
        this.notifier.success(`Program "${result.programName}" created successfully!`);
        if (result.programId) {
          this.router.navigate(['/dashboard', 'program', result.programId]);
        }
      }
    });
  }

  public onOpenProgram(programId: number): void {
    if (!Number.isInteger(programId) || programId <= 0) {
      return;
    }

    this.router.navigate(['/dashboard', 'program', programId]);
  }

  public onEventVisibilityChange(isVisible: boolean): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for visibility update');
      return;
    }

    if (this.isVisibilityUpdating()) {
      return;
    }

    const visibility: 'VISIBLE' | 'HIDDEN' = isVisible ? 'VISIBLE' : 'HIDDEN';
    if (currentEvent.visibility === visibility) {
      return;
    }

    const previousVisibility = currentEvent.visibility;
    this.isVisibilityUpdating.set(true);
    this.eventData.update((prev) => (prev ? { ...prev, visibility } : prev));

    this.eventDetailsService.updateEventVisibility(currentEvent.eventId, visibility).subscribe({
      next: () => {
        const formattedEventName = this.toTitleCase(currentEvent.eventName || 'Event');
        const visibilityMessage = visibility === 'VISIBLE'
          ? `**${formattedEventName}** is now visible to all the public`
          : `**${formattedEventName}** is now hidden to all the public`;
        this.notifier.success(visibilityMessage);
        this.isVisibilityUpdating.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.eventData.update((prev) => (prev ? { ...prev, visibility: previousVisibility } : prev));
        this.notifier.error(err?.error?.message || 'Failed to update event visibility.');
        this.isVisibilityUpdating.set(false);
      }
    });
  }

  public onDeleteEvent(): void {
    const currentEvent = this.eventData();
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for deletion');
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Delete Event',
      message: `Are you sure you want to delete "${currentEvent.eventName}"? This action will also remove linked members, media, programs, and tasks.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.eventDetailsService.deleteEvent(currentEvent.eventId).subscribe({
        next: () => {
          this.hierarchyTreeService.triggerHierarchyTreeRefresh();
          this.notifier.success(`**${this.toTitleCase(currentEvent.eventName)}** has been deleted successfully`);

          if (currentEvent.committeeId) {
            this.router.navigate(['/dashboard', 'group', currentEvent.committeeId]);
            return;
          }

          this.router.navigate(['/dashboard', 'home']);
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to delete event.');
        }
      });
    });
  }

  private toTitleCase(value: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}