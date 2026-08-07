import { Component, inject, OnInit, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { EventVotingService } from './event-voting.service';
import { EventVotingPayload, EventMappedVotingRole, EventVoteHistory, EventResultsPayload, EventResultCandidate, VacateVotingRolePayload, AssignWinningRolePayload, EventDirectAssignMember } from './event-voting.models';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { ConfirmDialogService } from '../../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../../components/dialog/confirm/confirm-dialog.models';
import { AuthService } from '../../../../../core/services/auth.service';
import { VoteHistoryDialogComponent } from '../../../../../components/dialog/vote-history/vote-history.component';
import { EventDetailsStateService } from '../event-details-state.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-event-voting',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatTooltipModule,
    FormsModule
  ],
  templateUrl: './event-voting.html',
  styleUrl: './event-voting.scss'
})
export class EventVotingComponent implements OnInit, OnDestroy{
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly votingService = inject(EventVotingService);
  private readonly authService = inject(AuthService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly stateService = inject(EventDetailsStateService);

  private paramSub?: Subscription;
  public readonly isBannerUploading = signal<boolean>(false);
  public readonly isVisibilityUpdating = signal<boolean>(false);
  public readonly selectedVotingRoleIds = signal<number[]>([]);
  public readonly isSavingVotingRoles = signal<boolean>(false);
  public readonly isLockingVotingRoles = signal<boolean>(false);
  public readonly isUnlockingVotingRoles = signal<boolean>(false);
  public readonly isVacatingVotingRole = signal<boolean>(false);
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
  public readonly eventResults = signal<EventResultsPayload | null>(null);
  public readonly directAssignMembers = signal<EventDirectAssignMember[]>([]);
  public readonly selectedReassignMemberId = signal<number | null>(null);
  public readonly openReassignForRoleId = signal<number | null>(null);
  public readonly reassignApprovedList = signal<Array<{ userId: number; name: string; email: string; photo?: string | null }>>([]);
  public readonly myVotes = signal<Record<number, number>>({});
  public readonly isUpdatingVotingMode = signal<boolean>(false);
  public readonly memberSearchQuery = signal<string>('');
  public readonly directAssignSelected = signal<Record<number, number | null>>({});
  public readonly isDirectAssignLoading = signal<Record<number, boolean>>({});
  public directAssignInputText: Record<number, string> = {};

  public get eventData(): EventVotingPayload | null {
    return this.stateService.eventData();
  }

  public get votingMode(): 'VOTING' | 'DIRECT_ASSIGN' | null {
    return (this.eventData?.votingMode as 'VOTING' | 'DIRECT_ASSIGN' | undefined) || 'VOTING';
  }

  public get canManageVotingRoles(): boolean {
    return this.eventData?.canManageVotingRoles ?? false;
  }

  public get isVotingMode(): boolean {
    return this.votingMode === 'VOTING';
  }

  public get currentVotingMode(): 'VOTING' | 'DIRECT_ASSIGN' | null {
    return this.votingMode;
  }

  public get isVotingRolesLocked(): boolean {
    return this.votingPhaseState >= 1;
  }

  public get votingPhaseState(): number {
    return Number(this.eventData?.votingPhaseState || 0);
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
    if (this.votingPhaseState !== 3) return false;
    const mappedRoles = this.eventData?.mappedVotingRoles ?? [];
    const approvedPeople = this.eventData?.interestApprovedPeople ?? [];
    const approvedRoleIds = new Set(approvedPeople.filter((info) => (info.approvedPeople ?? []).length > 0).map((info) => Number(info.roleId)));
    return mappedRoles.every((role) => approvedRoleIds.has(Number(role.roleId)));
  }

  public get startVotingDisabledReason(): string {
    if (this.votingPhaseState !== 3) return '';
    const mappedRoles = this.eventData?.mappedVotingRoles ?? [];
    const approvedPeople = this.eventData?.interestApprovedPeople ?? [];
    const approvedRoleIds = new Set(approvedPeople.filter((info) => (info.approvedPeople ?? []).length > 0).map((info) => Number(info.roleId)));
    const missing = mappedRoles.filter((role) => !approvedRoleIds.has(Number(role.roleId)));
    if (missing.length === 0) return '';
    const names = missing.map((role) => ((role.englishName || role.roleName || '').split('_').join(' ')).replace(/\b\w/g, (c) => c.toUpperCase())).join(', ');
    return `At least one approved candidate is required for: ${names}`;
  }

  public get isStopVotingEnabled(): boolean {
    return this.votingPhaseState === 4;
  }

  public get isDeclareResultsEnabled(): boolean {
    if (this.votingPhaseState >= 6) return false;
    if (this.isVotingMode) return this.votingPhaseState === 5;
    const mappedRoles = this.eventData?.mappedVotingRoles || [];
    if (!mappedRoles.length) return false;
    return mappedRoles.every((role) => {
      const rid = Number(role.roleId);
      if (!Number.isInteger(rid) || rid <= 0) return false;
      const selected = this.directAssignSelected()[rid];
      if (selected && Number.isInteger(selected) && selected > 0) return true;
      const winnerId = Number(role.winnerUserId);
      return Number.isInteger(winnerId) && winnerId > 0;
    });
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

  public get isCompactVotingCard(): boolean {
    return this.votingPhaseState === 2 || this.votingPhaseState === 3 || this.votingPhaseState === 4 || this.votingPhaseState === 5;
  }

  public get canStopNominations(): boolean {
    return this.canManageVotingRoles && this.votingPhaseState === 1;
  }

  public get canVacateRole(): boolean {
    return this.isMasterAdmin && this.votingPhaseState >= 1 && this.votingPhaseState <= 5;
  }

  public get canStartVoting(): boolean {
    return this.canManageVotingRoles && this.votingPhaseState === 2;
  }

  public get votingPhaseLabel(): string {
    switch (this.votingPhaseState) {
      case 6: return 'Results Declared';
      case 5: return 'Voting Stopped';
      case 4: return 'Voting Started';
      case 3: return 'Nominations Stopped';
      case 2: return 'Nominations Started';
      case 1: return 'Roles Locked';
      default: return '';
    }
  }

  public get votingPhaseIcon(): string {
    if (this.votingPhaseState >= 6) return 'emoji_events';
    if (this.isVotingClosed) return 'event_busy';
    if (this.isVotingEnabled) return 'how_to_vote';
    if (this.isNominationsStopped) return 'pause_circle';
    if (this.isNominationsStarted) return 'schedule';
    return 'hourglass_top';
  }

  public get canStopVoting(): boolean {
    return this.canManageVotingRoles && this.votingPhaseState === 3;
  }

  public get currentEventMappedRoleCount(): number {
    return this.eventData?.mappedVotingRoles?.length ?? 0;
  }

  public get votingGridLayoutClass(): string {
    if (this.currentEventMappedRoleCount <= 1) return 'voting-nomination-grid-single';
    if (this.currentEventMappedRoleCount === 2) return 'voting-nomination-grid-double';
    return 'voting-nomination-grid-multi';
  }

  public get votingDisplayCards(): Array<{ slot: number; role: EventMappedVotingRole }> {
    const mappedRoles = this.eventData?.mappedVotingRoles ?? [];
    const presidentRole = mappedRoles.find((role) => this.isPresidentRole(role)) || null;
    const remainingRoles = mappedRoles.filter((role) => role !== presidentRole);
    const orderedRoles = presidentRole ? [presidentRole, ...remainingRoles] : mappedRoles;
    return orderedRoles.map((role, index) => ({ slot: index + 1, role }));
  }

  public get isAllDesignationsVisible(): boolean {
    if (this.votingPhaseState >= 1) return false;
    return String(this.eventData?.currentCommitteeRole || 'NONE').toUpperCase() !== 'COMMITTEE_MEMBER';
  }

  public get isCommitteeMember(): boolean {
    return String(this.eventData?.currentCommitteeRole || 'NONE').toUpperCase() === 'COMMITTEE_MEMBER';
  }

  public get isMasterAdmin(): boolean {
    return String(this.eventData?.currentCommitteeRole || 'NONE').toUpperCase() === 'COMMITTEE_MASTER_ADMIN';
  }

  public get canReviewInterest(): boolean {
    return this.eventData?.canReviewInterest ?? false;
  }

  public get currentLoggedInUserId(): number {
    return Number(this.authService.getStoredUserData()?.id || 0);
  }

  public get pendingInterestCount(): number {
    return this.interestReviewList().length;
  }

  constructor() {
    effect(() => {
      const data = this.stateService.eventData();
      if (!data?.eventId) return;
      const mapped = data.mappedVotingRoles || [];
      this.selectedVotingRoleIds.set(
        mapped.map((role) => Number(role.roleId)).filter((roleId) => Number.isInteger(roleId) && roleId > 0)
      );
      this.directAssignSelected.set(
        mapped.reduce((acc: Record<number, number | null>, role: EventMappedVotingRole) => {
          const rid = Number(role.roleId);
          if (Number.isInteger(rid) && rid > 0) {
            acc[rid] = role.winnerUserId ?? null;
          }
          return acc;
        }, {} as Record<number, number | null>)
      );
      this.directAssignInputText = mapped.reduce((acc: Record<number, string>, role: EventMappedVotingRole) => {
        const rid = Number(role.roleId);
        if (Number.isInteger(rid) && rid > 0) {
          const raw = role.winnerName || '';
          acc[rid] = raw.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
        }
        return acc;
      }, {} as Record<number, string>);
    });
  }

  ngOnInit(): void {
    const parentParams$ = this.route.parent?.params;
    if (!parentParams$) return;

    // Purani subscription clean karke naye ko assign karein
    this.paramSub = parentParams$.subscribe(params => {
      const eventId = params['id'];
      if (!eventId) return;
      this.loadEventVotingDetails(String(eventId));
    });
  }

  private loadEventVotingDetails(id: string): void {
    this.votingService.getEventVotingDetails(id).subscribe({
      next: (data) => {
        this.stateService.eventData.set(data ?? null);
        if (data?.eventId) {
          this.initializeVotingState(Number(data.eventId));
          const pending = data.pendingEventInterests?.pending || [];
          this.interestReviewList.set(pending.map((item) => ({
            id: Number(item.id),
            eventId: Number(item.eventId),
            roleId: Number(item.roleId),
            roleName: item.roleName,
            userId: Number(item.userId),
            userName: item.userName,
            userEmail: item.userEmail,
            userPhoto: item.userPhoto,
            status: String(item.status || 'PENDING').toUpperCase()
          })));
          this.refreshInterestApprovedPeopleFromReviewList();
          const myVotes: Record<number, number> = {};
          (data.myVotes || []).forEach((vote) => { myVotes[Number(vote.roleId)] = Number(vote.candidateId); });
          this.myVotes.set(myVotes);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load event details.');
        this.stateService.eventData.set(null);
      }
    });
  }

  private initializeVotingState(eventId: number): void {
    const data = this.stateService.eventData();
    if (!data) return;
    this.selectedVotingRoleIds.set(
      (data.mappedVotingRoles || []).map((role) => Number(role.roleId)).filter((roleId) => Number.isInteger(roleId) && roleId > 0)
    );
    this.myInterestRoleIds.set((data.myInterestRoleIds || []).map((id) => Number(id)));
    this.myInterestStatuses.set(
      (data.myInterestStatuses || []).map((item) => ({ roleId: Number(item.roleId), status: String(item.status || 'PENDING') }))
    );
    this.interestReviewList.set([]);
    this.directAssignSelected.set(
      (data.mappedVotingRoles || []).reduce((acc: Record<number, number | null>, role: EventMappedVotingRole) => {
        const rid = Number(role.roleId);
        if (Number.isInteger(rid) && rid > 0) {
          acc[rid] = role.winnerUserId ?? null;
        }
        return acc;
      }, {} as Record<number, number | null>)
    );
    this.directAssignInputText = (data.mappedVotingRoles || []).reduce((acc: Record<number, string>, role: EventMappedVotingRole) => {
      const rid = Number(role.roleId);
      if (Number.isInteger(rid) && rid > 0) {
        const member = (role.winnerUserId ? this.directAssignMembers().find((m) => m.userId === role.winnerUserId) : null);
        acc[rid] = member ? member.name : (role.winnerName || '');
      }
      return acc;
    }, {} as Record<number, string>);
    const initialMembers: EventDirectAssignMember[] = (data.mappedVotingRoles || [])
      .filter((role) => role.winnerUserId)
      .map((role) => ({
        userId: role.winnerUserId as number,
        name: role.winnerName || `User ${role.winnerUserId}`,
        email: '',
        photo: role.winnerPhoto || null,
        committeeRole: '',
        isWinner: true,
      }));
    this.directAssignMembers.set(initialMembers);
    this.loadDirectAssignMembers(eventId);
    if (Number(data.votingPhaseState || 0) === 6) {
      this.loadEventResults(eventId);
    }
  }

  private loadEventResults(eventId: number): void {
    this.votingService.getEventResults(eventId).subscribe({
      next: (payload) => this.eventResults.set(payload ?? null),
      error: () => this.eventResults.set(null)
    });
  }

  public isPresidentRole(role?: EventMappedVotingRole | null): boolean {
    const normalizedRoleName = `${role?.roleName || ''} ${role?.englishName || ''} ${role?.hindiName || ''}`.toUpperCase();
    return normalizedRoleName.includes('ADHYAKSHA') || normalizedRoleName.includes('ADHYAKSH') || normalizedRoleName.includes('PRESIDENT');
  }

  public getVotingRoleIcon(role?: EventMappedVotingRole | null): string {
    return 'person_outline';
  }

  public isRoleMapped(roleId?: number | null): boolean {
    const normalizedRoleId = Number(roleId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) return false;
    return this.selectedVotingRoleIds().includes(normalizedRoleId);
  }

  public onToggleVotingRole(roleId: number, checked: boolean): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for role mapping'); return; }
    if (!this.canEditVotingRoles) return;
    const normalizedRoleId = Number(roleId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) return;
    const currentIds = this.selectedVotingRoleIds();
    const optimisticIds = checked
      ? (currentIds.includes(normalizedRoleId) ? currentIds : [...currentIds, normalizedRoleId])
      : currentIds.filter((id) => id !== normalizedRoleId);
    this.selectedVotingRoleIds.set(optimisticIds);
    this.votingService.toggleEventVotingRole(currentEvent.eventId, normalizedRoleId, checked).subscribe({
      next: () => { this.notifier.success(checked ? 'Role added for voting.' : 'Role removed from voting.'); this.refreshVoting(); },
      error: (err: HttpErrorResponse) => { this.selectedVotingRoleIds.set(currentIds); this.notifier.error(err?.error?.message || 'Failed to update voting role.'); }
    });
  }

  public onLockVotingRoles(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for role locking'); return; }
    if (this.currentEventMappedRoleCount === 0) { this.notifier.warn('Select at least one role before locking voting role selection.'); return; }
    const dialogData: ConfirmDialogData = { title: 'Lock Voting Role Selection', message: 'Are you sure you want to lock role selection for this event? This will start the voting lifecycle (phase 1) and after locking, even committee admin cannot change mapped voting roles.', confirmText: 'Lock Roles', cancelText: 'Cancel' };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.isLockingVotingRoles.set(true);
      this.votingService.lockEventVotingRoles(currentEvent.eventId).subscribe({
        next: () => { this.notifier.success('Voting role selection has been locked and the voting lifecycle has started.'); this.isLockingVotingRoles.set(false); this.refreshVoting(); },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to lock voting role selection.'); this.isLockingVotingRoles.set(false); }
      });
    });
  }

  public onVacateRole(roleId: number): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for vacating role'); return; }
    const normalizedRoleId = Number(roleId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) return;
    const approved = this.approvedPeopleForRole(normalizedRoleId);
    if (approved.length > 0) { this.notifier.warn('This role still has approved candidates and cannot be vacated.'); return; }
    const roleName = this.getRoleDisplayName(normalizedRoleId);
    const dialogData: ConfirmDialogData = { title: 'Vacate Role', message: `Are you sure you want to remove "${roleName}" from voting? This will allow voting to proceed for the remaining roles.`, confirmText: 'Vacate Role', cancelText: 'Cancel' };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.isVacatingVotingRole.set(true);
      this.votingService.vacateEventVotingRole(currentEvent.eventId, normalizedRoleId).subscribe({
        next: (payload: VacateVotingRolePayload) => {
          if (payload?.success) { this.notifier.success(`Role "${roleName}" has been vacated and removed from voting.`); this.refreshVoting(); }
          else { this.notifier.error('Failed to vacate role.'); }
          this.isVacatingVotingRole.set(false);
        },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to vacate role.'); this.isVacatingVotingRole.set(false); }
      });
    });
  }

  public onStartNominations(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for starting nominations'); return; }
    const dialogData: ConfirmDialogData = { title: 'Start Nominations', message: 'Are you sure you want to start nominations? Members will be able to nominate and withdraw.', confirmText: 'Start Nominations', cancelText: 'Cancel' };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.votingService.startEventNominations(currentEvent.eventId).subscribe({
        next: () => { this.notifier.success('Nominations have been started successfully.'); this.refreshVoting(); },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to start nominations.'); }
      });
    });
  }

  public onStopNominations(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for stopping nominations'); return; }
    const dialogData: ConfirmDialogData = { title: 'Stop Nominations', message: 'Are you sure you want to stop nominations? Members will no longer be able to nominate or withdraw.', confirmText: 'Stop Nominations', cancelText: 'Cancel' };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.votingService.stopEventNominations(currentEvent.eventId).subscribe({
        next: () => { this.notifier.success('Nominations have been stopped successfully.'); this.refreshVoting(); },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to stop nominations.'); }
      });
    });
  }

  public onStartVoting(): void {
    if (!this.isStartVotingEnabled) { this.notifier.warn(this.startVotingDisabledReason || 'Cannot start voting at this time.'); return; }
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for starting voting'); return; }
    const dialogData: ConfirmDialogData = { title: 'Start Voting', message: 'Are you sure you want to start voting? All members including admins will be able to vote.', confirmText: 'Start Voting', cancelText: 'Cancel' };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.votingService.allowEventVoting(currentEvent.eventId).subscribe({
        next: () => { this.notifier.success('Voting has been started successfully.'); this.refreshVoting(); },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to start voting.'); }
      });
    });
  }

  public onStopVoting(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for stopping voting'); return; }
    const dialogData: ConfirmDialogData = { title: 'Stop Voting', message: 'Are you sure you want to stop voting? After this, voting will be closed.', confirmText: 'Stop Voting', cancelText: 'Cancel' };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.votingService.stopEventVoting(currentEvent.eventId).subscribe({
        next: () => { this.notifier.success('Voting has been stopped successfully.'); this.refreshVoting(); },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to stop voting.'); }
      });
    });
  }

  public onDeclareResults(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for declaring results'); return; }
    const dialogData: ConfirmDialogData = { title: 'Declare Results', message: 'Are you sure you want to declare the results? Voting will be finalized and results will be published.', confirmText: 'Declare Results', cancelText: 'Cancel' };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.votingService.declareEventResults(currentEvent.eventId).subscribe({
        next: () => { this.notifier.success('Results have been declared successfully.'); this.refreshVoting(); this.loadEventResults(Number(currentEvent.eventId)); },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to declare results.'); }
      });
    });
  }

  public onExpressInterest(roleId: number): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for expressing interest'); return; }
    if (this.isExpressingInterest()) return;
    const normalizedRoleId = Number(roleId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) return;
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
      ? previousReviewList.filter((entry) => !(entry.roleId === normalizedRoleId && entry.userId === this.currentLoggedInUserId))
      : [...previousReviewList, { id: -Date.now(), eventId: Number(currentEvent.eventId), roleId: normalizedRoleId, userId: this.currentLoggedInUserId, userName: loggedInUser?.name || 'You', userEmail: loggedInUser?.email || '', userPhoto: loggedInUser?.photo || null, status: 'PENDING' }];
    this.myInterestRoleIds.set(optimisticIds);
    this.myInterestStatuses.set(optimisticStatuses);
    this.interestReviewList.set(optimisticReviewList);
    this.isExpressingInterest.set(true);
    const roleLabel = this.getRoleDisplayName(normalizedRoleId);
    this.votingService.expressEventInterest(currentEvent.eventId, normalizedRoleId).subscribe({
      next: (payload) => {
        this.myInterestRoleIds.set((payload.myInterestRoleIds || []).map((id) => Number(id)));
        this.myInterestStatuses.set((payload.myInterestStatuses || []).map((item) => ({ roleId: Number(item.roleId), status: String(item.status || 'PENDING') })));
        this.isExpressingInterest.set(false);
        this.notifier.success(payload.expressed ? `Your interest has been submitted for **${roleLabel}**.` : `Interest withdrawn for **${roleLabel}**.`);
      },
      error: (err: HttpErrorResponse) => { this.myInterestRoleIds.set(optimisticIds); this.myInterestStatuses.set(optimisticStatuses); this.interestReviewList.set(previousReviewList); this.isExpressingInterest.set(false); this.notifier.error(err?.error?.message || 'Failed to update interest.'); }
    });
  }

  private refreshInterestApprovedPeopleFromReviewList(): void {
    const prev = this.stateService.eventData();
    if (!prev) return;
    const approvedMap = new Map<number, Array<{ userId: number; name: string; email: string; photo?: string | null }>>();
    for (const item of this.interestReviewList()) {
      if (String(item.status).toUpperCase() === 'APPROVED') {
        const roleId = Number(item.roleId);
        if (!approvedMap.has(roleId)) approvedMap.set(roleId, []);
        approvedMap.get(roleId)!.push({ userId: item.userId, name: item.userName, email: item.userEmail, photo: item.userPhoto || null });
      }
    }
    const interestApprovedPeople = Array.from(approvedMap.entries()).map(([roleId, approvedPeople]) => ({ roleId, approvedPeople }));
    this.stateService.eventData.set({ ...prev, interestApprovedPeople });
  }

  public onReviewInterest(item: { eventId: number; roleId: number; userId: number; userName?: string }, status: 'APPROVED' | 'REJECTED'): void {
    if (!this.canReviewInterest) return;
    const normalizedRoleId = Number(item.roleId);
    const normalizedUserId = Number(item.userId);
    const normalizedEventId = Number(item.eventId);
    const previousList = this.interestReviewList();
    this.interestReviewList.update((list) => list.map((entry) => entry.roleId === normalizedRoleId && entry.userId === normalizedUserId ? { ...entry, status } : entry));
    this.votingService.reviewEventInterest(normalizedEventId, normalizedRoleId, normalizedUserId, status).subscribe({
      next: (payload) => {
        if (status === 'APPROVED' && payload?.autoRejectedOthers) {
          this.interestReviewList.update((list) => list.map((entry) => {
            if (entry.userId === normalizedUserId && entry.roleId === normalizedRoleId) return entry;
            if (entry.userId === normalizedUserId) return { ...entry, status: 'REJECTED' };
            return entry;
          }));
        }
        this.refreshInterestApprovedPeopleFromReviewList();
      },
      error: (err: HttpErrorResponse) => { this.interestReviewList.set(previousList); this.notifier.error(err?.error?.message || 'Failed to review interest.'); }
    });
  }

  public getInterestStatusClass(status: string): string {
    const normalized = String(status || 'PENDING').toUpperCase();
    if (normalized === 'APPROVED') return 'pending-row-approved';
    if (normalized === 'REJECTED') return 'pending-row-rejected';
    return 'pending-row-pending';
  }

  public getPendingInterestsGroupedForRole(roleId: number): Array<{ status: string; items: Array<{ id: number; eventId: number; roleId: number; userId: number; userName: string; userEmail: string; userPhoto?: string | null; status: string }> }> {
    const list = this.pendingInterestForRole(roleId);
    const groups = new Map<string, Array<any>>();
    const statusOrder = ['APPROVED', 'PENDING', 'REJECTED'];
    for (const item of list) {
      const status = String(item.status || 'PENDING').toUpperCase();
      if (!groups.has(status)) groups.set(status, []);
      groups.get(status)!.push(item);
    }
    return statusOrder.filter(s => groups.has(s)).map(status => ({ status, items: groups.get(status)! }));
  }

  public pendingInterestForRole(roleId: number): Array<{ id: number; eventId: number; roleId: number; userId: number; userName: string; userEmail: string; userPhoto?: string | null; status: string }> {
    const roleIdNum = Number(roleId);
    let allForRole = this.interestReviewList().filter((item) => Number(item.roleId) === roleIdNum);
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

  public approvedPeopleForRole(roleId: number): Array<{ userId: number; name: string; email: string; photo?: string | null }> {
    const list = this.eventData?.interestApprovedPeople ?? [];
    const match = list.find((info) => Number(info.roleId) === Number(roleId));
    return match?.approvedPeople ?? [];
  }

  public isInterestedInRole(roleId: number): boolean {
    return this.myInterestRoleIds().includes(Number(roleId));
  }

  public getRoleDisplayName(roleId: number): string {
    const role = (this.eventData?.mappedVotingRoles || []).find((r) => Number(r.roleId) === Number(roleId));
    const raw = role?.englishName || role?.roleName || role?.hindiName || '';
    return String(raw).split(/[_\s]+/).filter((part) => part.length > 0).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
  }

  public onCastVote(roleId: number, candidate?: { userId: number; userName: string }): void {
    const event = this.eventData;
    if (!this.isVotingEnabled || !event?.eventId || !candidate) return;
    const roleName = this.getRoleDisplayName(roleId);
    this.votingService.castEventVote(Number(event.eventId), Number(roleId), Number(candidate.userId)).subscribe({
      next: (payload) => {
        if (payload?.voted) { this.myVotes.update(current => ({ ...current, [Number(roleId)]: Number(candidate.userId) })); this.notifier.success(`Your vote for **${candidate.userName}** (${roleName}) has been recorded.`); }
        else { this.notifier.error('Failed to record your vote.'); }
      },
      error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to record your vote.'); }
    });
  }

  public hasVotedFor(roleId: number, candidateId: number): boolean {
    return Number(this.myVotes()[Number(roleId)]) === Number(candidateId);
  }

  public isSingleCandidateRole(roleId: number): boolean {
    const list = this.pendingInterestForRole(Number(roleId));
    const approved = list.filter((item) => String(item.status).toUpperCase() === 'APPROVED');
    return approved.length === 1;
  }

  public getWinnerForRole(roleId: number): EventResultCandidate | null {
    const results = this.eventResults();
    if (!results?.roles?.length) return null;
    const roleResult = results.roles.find((r) => Number(r.roleId) === Number(roleId));
    if (!roleResult?.candidates?.length) return null;
    const winner = roleResult.candidates.find((c) => c.isWinner);
    if (winner) return winner;
    const maxVotes = Math.max(...roleResult.candidates.map((c) => Number(c.voteCount || 0)));
    const hasSingleCandidate = roleResult.candidates.length === 1;
    if (maxVotes <= 0 && !hasSingleCandidate) return null;
    return roleResult.candidates.find((c) => Number(c.voteCount || 0) === maxVotes) || null;
  }

  public getMappedRoleWinner(roleId: number): { userId: number; name: string; photo: string | null } | null {
    const mappedRole = this.eventData?.mappedVotingRoles?.find((r) => Number(r.roleId) === Number(roleId));
    if (!mappedRole?.winnerUserId) return null;
    return {
      userId: mappedRole.winnerUserId,
      name: mappedRole.winnerName || `User ${mappedRole.winnerUserId}`,
      photo: mappedRole.winnerPhoto || null,
    };
  }

  public getCandidatesForRole(roleId: number): EventResultCandidate[] {
    const results = this.eventResults();
    if (!results?.roles?.length) return [];
    const roleResult = results.roles.find((r) => Number(r.roleId) === Number(roleId));
    if (!roleResult?.candidates?.length) return [];
    return [...roleResult.candidates].sort((a, b) => Number(b.voteCount || 0) - Number(a.voteCount || 0));
  }

  public isTieRole(roleId: number): boolean {
    const results = this.eventResults();
    if (!results?.roles?.length) return false;
    const roleResult = results.roles.find((r) => Number(r.roleId) === Number(roleId));
    if (!roleResult?.candidates?.length) return false;
    return roleResult.candidates.filter((c) => c.isWinner).length >= 2;
  }

  public getTiedCandidatesForRole(roleId: number): EventResultCandidate[] {
    const results = this.eventResults();
    if (!results?.roles?.length) return [];
    const roleResult = results.roles.find((r) => Number(r.roleId) === Number(roleId));
    if (!roleResult?.candidates?.length) return [];
    return roleResult.candidates.filter((c) => c.isWinner);
  }

  public onResolveTieBreaker(roleId: number, winnerCandidateId: number, winnerName?: string): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for resolving tie'); return; }
    const normalizedRoleId = Number(roleId);
    const normalizedWinnerId = Number(winnerCandidateId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) { this.notifier.error('Invalid role'); return; }
    if (!Number.isInteger(normalizedWinnerId) || normalizedWinnerId <= 0) { this.notifier.error('Invalid candidate'); return; }
    const dialogData: ConfirmDialogData = { title: 'Resolve Tie Breaker', message: 'Are you sure you want to declare this candidate as the winner?', confirmText: 'Declare Winner', cancelText: 'Cancel', iconType: 'warning', highlightText: winnerName ? String(winnerName) : '' };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.votingService.resolveTieBreaker(currentEvent.eventId, normalizedRoleId, normalizedWinnerId).subscribe({
        next: () => { this.notifier.success('Tie breaker resolved successfully'); this.loadEventResults(Number(currentEvent.eventId)); this.refreshVoting(); },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to resolve tie breaker'); }
      });
    });
  }

  public onAssignWinningRole(roleId: number): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available'); return; }
    const normalizedRoleId = Number(roleId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) { this.notifier.error('Invalid role'); return; }
    const approvedPeople = (currentEvent.interestApprovedPeople || []).find((entry) => entry.roleId === normalizedRoleId);
    const approvedList = approvedPeople?.approvedPeople || [];
    if (!approvedList.length) { this.notifier.error('No approved nominees available for this role'); return; }
    this.openReassignForRoleId.set(normalizedRoleId);
    this.selectedReassignMemberId.set(null);
    this.reassignApprovedList.set(approvedList);
  }

  public onReassignSelectionChange(memberId: number): void {
    this.selectedReassignMemberId.set(memberId);
  }

  public onConfirmReassign(roleId: number): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) return;
    const normalizedRoleId = Number(roleId);
    const newWinnerUserId = this.selectedReassignMemberId();
    if (!newWinnerUserId) return;
    const approvedList = this.reassignApprovedList();
    const selected = approvedList.find((p) => p.userId === newWinnerUserId);
    if (!selected) return;
    const dialogData: ConfirmDialogData = { title: 'Emergency Reassign Winner', message: `Are you sure you want to assign this role to ${selected.name}?`, confirmText: 'Reassign', cancelText: 'Cancel' };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.votingService.assignWinningRole(currentEvent.eventId, normalizedRoleId, newWinnerUserId, selected.name, selected.photo || null).subscribe({
        next: () => { this.notifier.success('Winner reassigned successfully'); this.openReassignForRoleId.set(null); this.selectedReassignMemberId.set(null); this.reassignApprovedList.set([]); this.refreshVoting(); this.loadEventResults(Number(currentEvent.eventId)); },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to reassign winner'); }
      });
    });
  }

  public cancelReassign(): void {
    this.openReassignForRoleId.set(null);
    this.selectedReassignMemberId.set(null);
    this.reassignApprovedList.set([]);
  }

  public openVoteHistory(): void {
    const event = this.eventData;
    if (!event?.eventId) return;
    const eventId = Number(event.eventId);
    this.votingService.getEventVoteHistory(eventId).subscribe({
      next: (history) => this.openVoteHistoryDialog(history),
      error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to load vote history.'); }
    });
  }

  private openVoteHistoryDialog(history: EventVoteHistory): void {
    const event = this.eventData;
    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(VoteHistoryDialogComponent, {
      position: { right: '0', top: '0' }, height: '100%', width: '50%', autoFocus: true, disableClose: true, hasBackdrop: true, panelClass: 'slide-in-dialog',
      data: { history, eventLogo: null }
    });
    dialogRef.afterClosed().subscribe(() => document.body.classList.remove('dialog-open'));
  }

  public onVotingModeChange(mode: 'VOTING' | 'DIRECT_ASSIGN'): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId || !mode) return;
    this.isUpdatingVotingMode.set(true);
    this.votingService.updateEventVotingMode(currentEvent.eventId, mode).subscribe({
      next: () => { this.notifier.success(`Mode changed to ${mode === 'VOTING' ? 'Voting' : 'Direct Assign'} successfully.`); this.isUpdatingVotingMode.set(false); },
      error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to update voting mode.'); this.isUpdatingVotingMode.set(false); }
    });
  }

  public onDirectAssignWinner(roleId: number, userId: number | null): void {
    console.log("*****");
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) return;

    if (userId !== null) {
      const member = this.directAssignMembers().find((m) => m.userId === userId);
      if (member?.committeeRole === 'COMMITTEE_MASTER_ADMIN') {
        this.notifier.warn('Master admin cannot be assigned to a role.');
        return;
      }
    }

    const previous = this.directAssignSelected()[roleId] 
      ?? currentEvent.mappedVotingRoles?.find((r: EventMappedVotingRole) => r.roleId === roleId)?.winnerUserId 
      ?? null;
    
    if (userId !== null) {
      this.directAssignSelected.update((s) => ({ ...s, [roleId]: userId }));
    }
    this.isDirectAssignLoading.update((s) => ({ ...s, [roleId]: true }));

    if (userId === null) {
      this.directAssignInputText[roleId] = '';
      this.votingService.vacateEventVotingRole(currentEvent.eventId, roleId).subscribe({
        next: (payload) => {
          if (payload?.success) {
            this.notifier.success('Winner removed successfully');
            this.refreshVoting();
          } else {
            this.directAssignSelected.update((s) => ({ ...s, [roleId]: previous }));
            this.notifier.error('Failed to remove winner.');
          }
        },
        error: (err: HttpErrorResponse) => {
          this.directAssignSelected.update((s) => ({ ...s, [roleId]: previous }));
          this.notifier.error(err?.error?.message || 'Failed to remove winner.');
        },
        complete: () => {
          this.isDirectAssignLoading.update((s) => ({ ...s, [roleId]: false }));
        }
      });
      return;
    }

    this.votingService.directAssignWinner(currentEvent.eventId, roleId, userId).subscribe({
      next: () => {
        this.notifier.success('Role assigned successfully');
        this.refreshVoting();
      },
      error: (err: HttpErrorResponse) => {
        this.directAssignSelected.update((s) => ({ ...s, [roleId]: previous }));
        this.notifier.error(err?.error?.message || 'Failed to assign role.');
      },
      complete: () => {
        this.isDirectAssignLoading.update((s) => ({ ...s, [roleId]: false }));
      }
    });
  }

  public onDropdownOpen(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) return;
    this.memberSearchQuery.set('');
    this.loadDirectAssignMembers(currentEvent.eventId);
  }

  public onMemberSearchInput(query: string): void {
    this.memberSearchQuery.set(query || '');
  }

  public getDirectAssignDisplayName(roleId: number): string {
    const selectedId = this.directAssignSelected()[roleId] ?? this.getMappedRoleWinner(roleId)?.userId ?? null;
    if (!selectedId) return '';
    const member = this.directAssignMembers().find((m) => m.userId === selectedId);
    const raw = member ? member.name : (this.getMappedRoleWinner(roleId)?.name ?? '');
    return raw.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  public onDirectAssignSearch(roleId: number, query: string): void {
    this.memberSearchQuery.set(query || '');
  }

  public onDirectAssignSelect(roleId: number, event: { option: { value: number | string } }): void {
    const userId = Number(event.option.value);
    this.memberSearchQuery.set('');
    const member = this.directAssignMembers().find((m) => m.userId === userId);
    this.directAssignInputText[roleId] = member ? (member.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())) : '';
    this.onDirectAssignWinner(roleId, userId);
  }

  public getAssignedMember(roleId: number): { userId: number; name: string; photo: string | null; committeeRole?: string | null } | null {
    const selectedId = this.directAssignSelected()[roleId] ?? null;
    const winner = this.getMappedRoleWinner(roleId);
    const id = selectedId ?? winner?.userId ?? null;
    if (!id) return null;
    const member = this.directAssignMembers().find((m) => m.userId === id);
    if (member) return { userId: member.userId, name: member.name, photo: member.photo ?? null, committeeRole: member.committeeRole ?? null };
    if (winner && winner.userId === id) return { userId: winner.userId, name: winner.name, photo: winner.photo, committeeRole: null };
    return null;
  }

  public getRoleColorClass(role?: string | null): string {
    switch ((role || '').toUpperCase()) {
      case 'COMMITTEE_MASTER_ADMIN': return 'role-master';
      case 'COMMITTEE_ADMIN': return 'role-admin';
      case 'COMMITTEE_MEMBER': return 'role-member';
      default: return 'role-default';
    }
  }

  public getAssignedRoleClass(roleId: number): string {
    return this.getRoleColorClass(this.getAssignedMember(roleId)?.committeeRole);
  }

  public getInitials(name: string | null | undefined): string {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }

  public readonly avatarLoadFailed = signal<Set<number>>(new Set<number>());

  public onAvatarError(userId: number): void {
    this.avatarLoadFailed.update((current) => new Set(current).add(userId));
  }

  public isUserAssignedToOtherRole(userId: number, currentRoleId: number): boolean {
    const normalizedUserId = Number(userId);
    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) return false;
    const normalizedCurrentRoleId = Number(currentRoleId);
    if (!Number.isInteger(normalizedCurrentRoleId) || normalizedCurrentRoleId <= 0) return false;

    for (const [roleId, assignedUserId] of Object.entries(this.directAssignSelected())) {
      if (Number(roleId) !== normalizedCurrentRoleId && Number(assignedUserId) === normalizedUserId) {
        return true;
      }
    }

    const currentEvent = this.eventData;
    if (currentEvent?.mappedVotingRoles) {
      for (const role of currentEvent.mappedVotingRoles) {
        if (Number(role.roleId) !== normalizedCurrentRoleId && Number(role.winnerUserId) === normalizedUserId) {
          return true;
        }
      }
    }

    return false;
  }

  public getDirectAssignOptions(roleId: number): EventDirectAssignMember[] {
    const list = this.filteredDirectAssignMembers;
    const currentAssignedId = this.directAssignSelected()[roleId] ?? this.getMappedRoleWinner(roleId)?.userId ?? null;

    const assignedUserIds = new Set<number>();
    for (const [rid, assignedUserId] of Object.entries(this.directAssignSelected())) {
      const userId = Number(assignedUserId);
      if (Number.isInteger(userId) && userId > 0) {
        assignedUserIds.add(userId);
      }
    }

    const currentEvent = this.eventData;
    if (currentEvent?.mappedVotingRoles) {
      for (const role of currentEvent.mappedVotingRoles) {
        const winnerId = Number(role.winnerUserId);
        if (Number.isInteger(winnerId) && winnerId > 0) {
          assignedUserIds.add(winnerId);
        }
      }
    }

    if (assignedUserIds.size === 0) return list;

    const assignedMembers: EventDirectAssignMember[] = [];
    const unassignedMembers: EventDirectAssignMember[] = [];

    for (const member of list) {
      if (assignedUserIds.has(member.userId)) {
        assignedMembers.push(member);
      } else {
        unassignedMembers.push(member);
      }
    }

    if (currentAssignedId) {
      const currentAssignedIndex = assignedMembers.findIndex((m) => m.userId === currentAssignedId);
      if (currentAssignedIndex > 0) {
        const [currentAssigned] = assignedMembers.splice(currentAssignedIndex, 1);
        assignedMembers.unshift(currentAssigned);
      }
    }

    return [...assignedMembers, ...unassignedMembers];
  }

  public get filteredDirectAssignMembers(): EventDirectAssignMember[] {
    const query = this.memberSearchQuery().toLowerCase().trim();
    const members = this.directAssignMembers();
    const filtered = query
      ? members.filter((m) => m.name.toLowerCase().includes(query) || m.email.toLowerCase().includes(query))
      : members;
    const rolePriority = (role: string): number => {
      if (role === 'COMMITTEE_MASTER_ADMIN') return 0;
      if (role === 'COMMITTEE_ADMIN') return 1;
      if (role === 'COMMITTEE_MEMBER') return 2;
      return 3;
    };
    return [...filtered].sort((a, b) => {
      const diff = rolePriority(a.committeeRole) - rolePriority(b.committeeRole);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }

  private loadDirectAssignMembers(eventId: number): void {
    const currentEvent = this.eventData;
    if (!currentEvent) return;
    if (String(currentEvent.votingMode).toUpperCase() !== 'DIRECT_ASSIGN') return;
    const phase = Number(currentEvent.votingPhaseState || 0);
    if (phase < 1 || phase >= 6) return;
    this.votingService.getDirectAssignMembers(eventId).subscribe({
      next: (members) => {
        const currentEvent = this.eventData;
        const mappedRoles = currentEvent?.mappedVotingRoles || [];
        const winnerRoleIds = new Set(mappedRoles.filter(r => r.winnerUserId).map(r => r.winnerUserId as number));
        const merged = members.map((m) => ({ ...m, isWinner: winnerRoleIds.has(m.userId) }));
        mappedRoles.forEach((role) => {
          const winnerId = role.winnerUserId;
          if (winnerId && !merged.some((m) => m.userId === winnerId)) {
            merged.push({
              userId: winnerId,
              name: role.winnerName || `User ${winnerId}`,
              email: '',
              photo: role.winnerPhoto || null,
              committeeRole: '',
              isWinner: true,
            });
          }
        });
        this.directAssignMembers.set(merged);
        const selected = this.directAssignSelected();
        const nextText: Record<number, string> = {};
        for (const [rid, userId] of Object.entries(selected)) {
          const roleId = Number(rid);
          const id = Number(userId);
          if (Number.isInteger(roleId) && roleId > 0 && Number.isInteger(id) && id > 0) {
            const member = merged.find((m) => m.userId === id);
            const raw = member ? member.name : '';
            nextText[roleId] = raw.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
          }
        }
        this.directAssignInputText = { ...this.directAssignInputText, ...nextText };
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load committee members.');
      }
    });
  }

  private refreshVoting(): void {
    const currentEvent = this.stateService.eventData();
    if (currentEvent?.eventId) {
      this.votingService.getEventVotingDetails(String(currentEvent.eventId)).subscribe({
        next: (data) => {
          this.stateService.eventData.set(data ?? null);
          this.initializeVotingState(Number(currentEvent.eventId));
          if (data?.pendingEventInterests?.pending) {
            this.interestReviewList.set(data.pendingEventInterests.pending.map((item) => ({
              id: Number(item.id),
              eventId: Number(item.eventId),
              roleId: Number(item.roleId),
              roleName: item.roleName,
              userId: Number(item.userId),
              userName: item.userName,
              userEmail: item.userEmail,
              userPhoto: item.userPhoto,
              status: String(item.status || 'PENDING').toUpperCase()
            })));
            this.refreshInterestApprovedPeopleFromReviewList();
          }
          const myVotes: Record<number, number> = {};
          (data.myVotes || []).forEach((vote) => { myVotes[Number(vote.roleId)] = Number(vote.candidateId); });
          this.myVotes.set(myVotes);
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }
}