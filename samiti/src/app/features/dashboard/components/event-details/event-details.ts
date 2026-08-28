import { Component, inject, effect, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { EventVotingService } from './event-voting/event-voting.service';
import { EventVotingPayload } from './event-voting/event-voting.models';
import { EventDetailsOverviewService } from './event-details-overview.service';
import { EventOverviewService } from './event-overview/event-overview.service';
import { EventOverviewPayload } from './event-overview/event-overview.models';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { EventDetailsStateService } from './event-details-state.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { CreateEventDialogComponent } from '../../../../components/dialog/create-event/create-event.component';
import { ImageAssetService } from '../../../../core/services/image-asset.service';
import { ImageCropperDialogComponent } from '../../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterOutlet,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatFormFieldModule,
    FormsModule
  ],
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss'
})
export class EventDetailsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notifier = inject(NotifierService);
  private readonly votingService = inject(EventVotingService);
  private readonly stateService = inject(EventDetailsStateService);
  private readonly overviewService = inject(EventDetailsOverviewService);
  private readonly overviewEventService = inject(EventOverviewService);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly imageAssetService = inject(ImageAssetService);

  public readonly isLoadingOverview = signal<boolean>(false);
  public readonly isUploadingEventLogo = signal<boolean>(false);
  private overviewSub?: Subscription;

  // Tracks the last event whose default tab was already resolved, so the
  // auto-default only runs once per distinct event open (not on every data
  // refresh). Reopening a different event re-evaluates the default tab.
  private lastResolvedEventId: number | null = null;

  public ngOnInit(): void {
    this.overviewSub = this.route.params.subscribe((params) => {
      const id = params['id'];
      if (id) {
        this.loadOverview(String(id));
      }
    });
  }

  public ngOnDestroy(): void {
    this.overviewSub?.unsubscribe();
  }

  constructor() {
    // For events already in "Results Declared" (phase >= 6), the default tab
    // should be Overview instead of Voting. Once event data is loaded and the
    // user is on the default Voting tab, route them to Overview.
    // Only auto-route when ALL roles have a winner AND no unresolved ties exist.
    effect(() => {
      const data = this.stateService.eventData();
      const results = this.stateService.eventResults();
      if (!data) return;
      const eventId = Number(data.eventId);
      if (!eventId) return;

      // Skip re-evaluation when the same event's data merely refreshes
      // (e.g. declaring results), but re-run when a different event is opened.
      if (eventId === this.lastResolvedEventId) return;

      const phase = Number(data.votingPhaseState || 0);
      if (phase < 6) return;

      const mappedRoles = data.mappedVotingRoles || [];
      const allHaveWinner = mappedRoles.length > 0 && mappedRoles.every((role) => {
        const winnerId = Number(role.winnerUserId);
        return Number.isInteger(winnerId) && winnerId > 0;
      });

      const noUnresolvedTies = mappedRoles.every((role) => {
        const roleId = Number(role.roleId);
        const roleResult = results?.roles?.find((r) => Number(r.roleId) === roleId);
        if (!roleResult?.candidates?.length) return false;
        const winners = roleResult.candidates.filter((c) => c.isWinner);
        return winners.length === 1;
      });

      if (!allHaveWinner || !noUnresolvedTies) return;

      this.lastResolvedEventId = eventId;

      const url = this.router.url;
      const baseEventUrl = `/dashboard/event/${eventId}`;
      const isDefaultVoting =
        url.endsWith('/voting') || url === baseEventUrl || url.endsWith(`/event/${eventId}`);

      if (isDefaultVoting) {
        this.router.navigate(['/dashboard', 'event', eventId, 'overview']);
      }
    });
  }

  public get eventData(): EventVotingPayload | null {
    return this.stateService.eventData();
  }

  public get currentTab(): string {
    const url = this.router.url;
    if (url.includes('/voting')) return 'voting';
    if (url.includes('/overview')) return 'overview';
    if (url.includes('/programs')) return 'programs';
    if (url.includes('/people')) return 'people';
    return 'voting';
  }

  public get isMasterAdmin(): boolean {
    return String(this.eventData?.committeeRole || 'NONE').toUpperCase() === 'COMMITTEE_MASTER_ADMIN';
  }

   public get currentVotingMode(): 'VOTING' | 'DIRECT' | null {
     return (this.eventData?.votingMode as 'VOTING' | 'DIRECT' | undefined) || 'VOTING';
  }

  public get votingPhaseState(): number {
    return Number(this.eventData?.votingPhaseState || 0);
  }

  public get isResultsDeclared(): boolean {
    return this.votingPhaseState >= 6;
  }

  public get allWinnersResolved(): boolean {
    if (!this.isResultsDeclared) return false;
    const mappedRoles = this.eventData?.mappedVotingRoles || [];
    if (mappedRoles.length === 0) return false;
    const rolesWithWinner = mappedRoles.filter((role) => {
      const winnerId = Number(role.winnerUserId);
      return Number.isInteger(winnerId) && winnerId > 0;
    });
    if (rolesWithWinner.length !== mappedRoles.length) return false;
    const results = this.stateService.eventResults();
    if (!results?.roles?.length) return false;
    return mappedRoles.every((role) => {
      const roleId = Number(role.roleId);
      const roleResult = results.roles.find((r) => Number(r.roleId) === roleId);
      if (!roleResult?.candidates?.length) return false;
      const winners = roleResult.candidates.filter((c) => c.isWinner);
      if (winners.length !== 1) return false;
      return true;
    });
  }

  public get tabsEnabled(): boolean {
    return this.allWinnersResolved;
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
    if (this.votingPhaseState >= 5) return 'event_busy';
    if (this.votingPhaseState >= 4) return 'how_to_vote';
    if (this.votingPhaseState >= 3) return 'pause_circle';
    if (this.votingPhaseState >= 2) return 'schedule';
    if (this.votingPhaseState >= 1) return 'hourglass_top';
    return 'hourglass_bottom';
  }

  public navigateToTab(tab: string): void {
    if (tab !== 'voting' && !this.allWinnersResolved) {
      return;
    }

    const eventId = this.eventData?.eventId ?? this.route.snapshot.params['id'];
    if (!eventId) return;
    const target = tab === 'voting' || this.isResultsDeclared ? tab : 'voting';
    this.router.navigate(['/dashboard', 'event', eventId, target]);
  }

   public onVotingModeChange(mode: 'VOTING' | 'DIRECT'): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId || !mode) return;
    this.votingService.updateEventVotingMode(currentEvent.eventId, mode).subscribe({
      next: () => {
        this.stateService.eventData.update((prev) => prev ? { ...prev, votingMode: mode } : prev);
        this.notifier.success(`Mode changed to ${mode === 'VOTING' ? 'Voting' : 'Direct Assign'} successfully.`);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to update voting mode.');
      }
    });
  }

  /* ===================== EVENT OVERVIEW HEADER ===================== */
  public get overviewData(): EventOverviewPayload | null {
    return this.stateService.eventOverview();
  }

  public get userEventRole(): string {
    return String(this.overviewData?.committeeRole || 'NONE').toUpperCase();
  }

  public get userEventRoleLabel(): string {
    if (this.overviewData?.myDesignation?.name) return this.overviewData.myDesignation.name;
    return 'MEMBER';
  }

  public get designationColor(): string {
    const designation = this.overviewData?.myDesignation;
    if (designation?.name && designation.color) {
      const normalized = designation.name.trim().toLowerCase();
      if (normalized !== 'member' && normalized !== '') {
        return designation.color;
      }
    }
    return '#cbd5e1';
  }

  public get designationIcon(): string | null {
    const designation = this.overviewData?.myDesignation;
    if (designation?.name && designation.icon) {
      const normalized = designation.name.trim().toLowerCase();
      if (normalized !== 'member' && normalized !== '') {
        return designation.icon;
      }
    }
    return null;
  }

  public get isEventMasterAdmin(): boolean {
    return this.userEventRole === 'COMMITTEE_MASTER_ADMIN';
  }

  public get isEventAdmin(): boolean {
    return this.userEventRole === 'COMMITTEE_ADMIN';
  }

  public get isEventMember(): boolean {
    return this.userEventRole === 'COMMITTEE_MEMBER';
  }

  public get hasEventRole(): boolean {
    return Boolean(this.overviewData?.myDesignation?.roleId);
  }

  public get canManageEvent(): boolean {
    return this.hasEventRole || this.isEventMasterAdmin;
  }

  public get fallbackInitial(): string {
    const name = this.overviewData?.eventDisplayName || this.overviewData?.eventName || '';
    return name ? name.charAt(0).toUpperCase() : 'E';
  }

  private loadOverview(id: string): void {
    this.isLoadingOverview.set(true);
    this.overviewService.getEventOverview(id).subscribe({
      next: (data) => {
        this.stateService.eventOverview.set(data ?? null);
        this.isLoadingOverview.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load event overview.');
        this.stateService.eventOverview.set(null);
        this.isLoadingOverview.set(false);
      }
    });
  }

  private refreshOverview(): void {
    const currentEvent = this.overviewData;
    if (currentEvent?.eventId) {
      this.overviewService.getEventOverview(String(currentEvent.eventId)).subscribe({
        next: (data) => this.stateService.eventOverview.set(data ?? null)
      });
    }
  }

  public onEditEvent(): void {
    const currentEvent = this.overviewData;
    if (!currentEvent?.eventId || !currentEvent?.committeeId) {
      this.notifier.error('No event available for editing');
      return;
    }
    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateEventDialogComponent, {
      position: { right: '0', top: '0' }, height: '100%', width: '50%',
      autoFocus: true, disableClose: true, hasBackdrop: true, panelClass: 'slide-in-dialog',
      data: {
        eventId: currentEvent.eventId, committeeId: currentEvent.committeeId,
        address: currentEvent.committeeAddress || '', eventType: currentEvent.type === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
        visibility: currentEvent.visibility, eventName: currentEvent.eventName,
        eventDisplayName: currentEvent.eventDisplayName, status: currentEvent.status,
        category: currentEvent.category, startDate: currentEvent.startDate,
        endDate: currentEvent.endDate, latitude: currentEvent.latitude, longitude: currentEvent.longitude
      }
    });
    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (!result) return;
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.refreshOverview();
    });
  }

  public onDeleteEvent(): void {
    const currentEvent = this.overviewData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for deletion'); return; }
    const dialogData: ConfirmDialogData = {
      title: 'Delete Event', message: 'Are you sure you want to delete this event? This action will also remove linked members, media, programs, and tasks.',
      confirmText: 'Delete', cancelText: 'Cancel', highlightText: currentEvent.eventName
    };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.overviewEventService.deleteEvent(currentEvent.eventId).subscribe({
        next: () => {
          this.hierarchyTreeService.triggerHierarchyTreeRefresh();
          this.notifier.success(`**${this.toTitleCase(currentEvent.eventName)}** has been deleted successfully`);
          if (currentEvent.committeeId) { this.router.navigate(['/dashboard', 'group', currentEvent.committeeId]); return; }
          this.router.navigate(['/dashboard', 'home']);
        },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to delete event.'); }
      });
    });
  }

  public onEventVisibilityChange(isVisible: boolean): void {
    const currentEvent = this.overviewData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for visibility update'); return; }
    const visibility: 'VISIBLE' | 'HIDDEN' = isVisible ? 'VISIBLE' : 'HIDDEN';
    if (currentEvent.visibility === visibility) return;
    const previousVisibility = currentEvent.visibility;
    this.stateService.eventOverview.set({ ...currentEvent, visibility });
    this.overviewEventService.updateEventVisibility(currentEvent.eventId, visibility).subscribe({
      next: () => {
        const formattedEventName = this.toTitleCase(currentEvent.eventName || 'Event');
        this.notifier.success(visibility === 'VISIBLE' ? `**${formattedEventName}** is now visible to all the public` : `**${formattedEventName}** is now hidden to all the public`);
      },
      error: (err: HttpErrorResponse) => {
        this.stateService.eventOverview.set({ ...currentEvent, visibility: previousVisibility });
        this.notifier.error(err?.error?.message || 'Failed to update event visibility.');
      }
    });
  }

  public async onEventLogoSelected(event: Event): Promise<void> {
    event.stopPropagation();
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] || null;
    inputElement.value = '';

    if (!selectedFile) return;

    const currentEvent = this.overviewData;
    if (!currentEvent?.eventId || !currentEvent?.committeeId) {
      this.notifier.error('Event reference is missing. Please reload the workspace.');
      return;
    }

    const selectedOrCroppedFile = await this.openEventLogoCropDialog(selectedFile);
    if (!selectedOrCroppedFile) return;

    this.isUploadingEventLogo.set(true);

    try {
      const uploadedMetadata = await firstValueFrom(
        this.imageAssetService.uploadSingleImageForCommitteeLogo(selectedOrCroppedFile, `event-logo-${currentEvent.eventId}`)
      );

      const updated = await firstValueFrom(
        this.overviewEventService.updateEventLogo(currentEvent.eventId, currentEvent.committeeId, uploadedMetadata.publicAbsoluteUrl)
      );

      this.stateService.eventOverview.set({ ...currentEvent, eventLogo: updated.eventLogo || uploadedMetadata.publicAbsoluteUrl });
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.notifier.success('Event logo updated successfully.');
    } catch (error: any) {
      this.notifier.error(error?.message || 'Failed to update event logo.');
    } finally {
      this.isUploadingEventLogo.set(false);
    }
  }

  public onEventLogoLoadError(): void {
    if (this.overviewData) {
      this.stateService.eventOverview.set({ ...this.overviewData, eventLogo: null });
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

  private toTitleCase(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\b\w/g, (char) => char.toUpperCase());
  }
}