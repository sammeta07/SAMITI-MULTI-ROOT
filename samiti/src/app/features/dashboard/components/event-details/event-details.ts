import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { filter } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';

import { EventVotingService } from './event-voting/event-voting.service';
import { EventVotingPayload } from './event-voting/event-voting.models';
import { EventDetailsOverviewService } from './event-details-overview.service';
import { EventOverviewService } from './event-overview/event-overview.service';
import { EventOverviewPayload } from './event-overview/event-overview.models';
import { EventDetailsHeaderPayload } from './event-overview/event-overview.models';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { EventDetailsStateService } from './event-details-state.service';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { CreateEventDialogComponent } from '../../../../components/dialog/create-event/create-event.component';
import { CreateProgramDialogComponent } from '../../../../components/dialog/create-program/create-program.component';
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
    MatTabsModule,
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

  private currentEventId: number | null = null;
  public selectedTabIndex = 0;
  private routeSub?: Subscription;

  public ngOnInit(): void {
    this.syncTabIndexFromUrl();

    this.overviewSub = this.route.params.subscribe((params) => {
      const id = params['id'];
      if (id) {
        const eventId = Number(id);
        if (eventId !== this.currentEventId) {
          this.currentEventId = eventId;
          this.stateService.reset();
        }
        this.loadHeaderDetails(String(id));
        this.loadVotingDetails(String(id));
      }
    });

    this.routeSub = this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError)
    ).subscribe(() => {
      this.syncTabIndexFromUrl();
    });
  }

  public ngOnDestroy(): void {
    this.overviewSub?.unsubscribe();
    this.routeSub?.unsubscribe();
  }

  private syncTabIndexFromUrl(): void {
    const url = this.router.url;
    if (url.includes('/overview')) this.selectedTabIndex = 1;
    else if (url.includes('/programs')) this.selectedTabIndex = 2;
    else if (url.includes('/people')) this.selectedTabIndex = 3;
    else this.selectedTabIndex = 0;
  }

  public onTabChange(index: number): void {
    const tabs: Array<'voting' | 'overview' | 'programs' | 'people'> = ['voting', 'overview', 'programs', 'people'];
    const tab = tabs[index];
    const eventId = this.eventData?.eventId ?? this.route.snapshot.params['id'];
    if (!eventId) return;
    this.router.navigate(['/dashboard', 'event', eventId, tab]);
  }

  public get eventData(): EventVotingPayload | null {
    return this.stateService.eventData();
  }

  public get headerData(): EventDetailsHeaderPayload | null {
    return this.stateService.headerData();
  }

  public get eventYear(): number | null | undefined {
    return this.headerData?.eventYear ?? null;
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

  public get currentVotingMode(): 'VOTING' | 'DIRECT' {
    return (this.eventData?.votingMode as 'VOTING' | 'DIRECT') || 'VOTING';
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
      return winners.length === 1;
    });
  }

  public get tabsEnabled(): boolean {
    return this.allWinnersResolved;
  }

  public get canCreateProgram(): boolean {
    const role = String(this.headerData?.committeeRole || 'NONE').toUpperCase();
    if (role === 'COMMITTEE_MASTER_ADMIN' || role === 'COMMITTEE_ADMIN') {
      return true;
    }
    const designation = this.userEventRoleLabel;
    const normalized = (designation || '').toLowerCase();
    return normalized === 'adhyaksha' || normalized === 'upadhyaksha';
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

  public onCreateProgram(): void {
    const currentEvent = this.headerData;
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for program creation');
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
      data: { eventId: currentEvent.eventId, address: currentEvent.committeeAddress || '' }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (result) {
        this.notifier.success(`Program "${result.programName}" created successfully!`);
        if (result.programId) {
          this.router.navigate(['/dashboard', 'event', currentEvent.eventId, 'overview']);
        }
      }
    });
  }

  public onVotingModeChange(mode: 'VOTING' | 'DIRECT'): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId || !mode) return;

    this.votingService.updateEventVotingMode(currentEvent.eventId, mode).subscribe({
      next: () => {
        this.stateService.eventData.update((prev) => {
          if (!prev) return prev;
          if (mode !== 'DIRECT') return { ...prev, votingMode: mode };

          return {
            ...prev,
            votingMode: mode,
            mappedVotingRoles: (prev.mappedVotingRoles || []).map((role) => ({
              ...role,
              winnerUserId: null,
              winnerName: null,
              winnerPhoto: null,
              winnerVoteCount: null,
              winnerWonBy: null
            }))
          };
        });
        this.notifier.success(`Mode changed to ${mode === 'VOTING' ? 'Voting' : 'Direct Assign'} successfully.`);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to update voting mode.');
      }
    });
  }

  public get userEventRole(): string {
    return String(this.headerData?.committeeRole || 'NONE').toUpperCase();
  }

  public get userEventRoleLabel(): string {
    const designation = this.headerData?.myDesignation;
    return designation?.roleId && designation.name ? designation.name : '';
  }

  public get designationColor(): string {
    const designation = this.headerData?.myDesignation;
    if (designation?.name && designation.color) {
      const normalized = designation.name.trim().toLowerCase();
      if (normalized !== 'member' && normalized !== '') {
        return designation.color;
      }
    }
    return '#64748b';
  }

  public get designationIcon(): string | null {
    const designation = this.headerData?.myDesignation;
    if (designation?.name && designation.icon) {
      const normalized = designation.name.trim().toLowerCase();
      if (normalized !== 'member' && normalized !== '') {
        return designation.icon;
      }
    }
    return null;
  }

  public get calculatedEventStatus(): 'started' | 'upcoming' | 'completed' {
    const now = new Date();
    const startDate = this.headerData?.startDate ? new Date(this.headerData.startDate) : null;
    const endDate = this.headerData?.endDate ? new Date(this.headerData.endDate) : null;

    if (!startDate) return 'completed';

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) : null;

    if (today < start) return 'upcoming';
    if (end && today > end) return 'completed';
    return 'started';
  }

  public formatEventYear(year: number | null | undefined): string {
    if (!year || year < 1) return '';
    const suffix = this.getOrdinalSuffix(year);
    return `${year}${suffix} Year`;
  }

  public formatEventDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
    const startMatch = (startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const endMatch = (endDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!startMatch) {
      return '';
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
      return `${startDay} - ${endDay}-${endMonth}-${endYear.slice(-2)}`;
    }

    return `${startDay}-${startMonth}-${startYear.slice(-2)} to ${endDay}-${endMonth}-${endYear.slice(-2)}`;
  }

  private getOrdinalSuffix(year: number): string {
    const absYear = Math.abs(year);
    if (absYear % 100 >= 11 && absYear % 100 <= 13) {
      return 'th';
    }
    switch (absYear % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  public get isEventMasterAdmin(): boolean {
    return this.userEventRole === 'COMMITTEE_MASTER_ADMIN';
  }

  public get hasEventRole(): boolean {
    return Boolean(this.headerData?.myDesignation?.roleId);
  }

  public get canManageEvent(): boolean {
    return this.hasEventRole || this.isEventMasterAdmin;
  }

  public get fallbackInitial(): string {
    const name = this.headerData?.eventDisplayName || this.headerData?.eventName || '';
    return name ? name.charAt(0).toUpperCase() : 'E';
  }

  private loadHeaderDetails(id: string): void {
    const requestedEventId = Number(id);
    this.isLoadingOverview.set(true);

    this.overviewService.getEventDetailsHeader(id).subscribe({
      next: (data) => {
        if (requestedEventId !== this.currentEventId) return;
        this.stateService.headerData.set(data ?? null);
        this.isLoadingOverview.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (requestedEventId !== this.currentEventId) return;
        this.notifier.error(err?.error?.message || 'Failed to load event header.');
        this.stateService.headerData.set(null);
        this.isLoadingOverview.set(false);
      }
    });
  }

  private loadVotingDetails(id: string): void {
    this.votingService.getEventVotingDetails(id).subscribe({
      next: (data) => {
        if (Number(data?.eventId) !== Number(id)) return;
        this.stateService.eventData.set(data ?? null);
        if (data?.eventId && Number(data.votingPhaseState || 0) === 6 && !this.stateService.eventResults()) {
          this.loadEventResults(Number(data.eventId));
        }
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load event details.');
        this.stateService.eventData.set(null);
      }
    });
  }

  private loadEventResults(eventId: number): void {
    this.votingService.getEventResults(eventId).subscribe({
      next: (payload) => {
        this.stateService.eventResults.set(payload ?? null);
      },
      error: () => {
        this.stateService.eventResults.set(null);
      }
    });
  }

  private refreshHeader(): void {
    const currentEvent = this.headerData;
    if (currentEvent?.eventId) {
      const requestedEventId = Number(currentEvent.eventId);
      this.overviewService.getEventDetailsHeader(String(currentEvent.eventId)).subscribe({
        next: (data) => {
          if (requestedEventId === this.currentEventId) {
            this.stateService.headerData.set(data ?? null);
          }
        }
      });
    }
  }

  public onEditEvent(): void {
    const currentEvent = this.headerData;
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
        eventName: currentEvent.eventName,
        eventDisplayName: currentEvent.eventDisplayName,
        category: currentEvent.category,
        eventYear: currentEvent.eventYear,
        startDate: currentEvent.startDate,
        endDate: currentEvent.endDate,
        latitude: currentEvent.latitude,
        longitude: currentEvent.longitude
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (!result) return;
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.refreshHeader();
    });
  }

  public onDeleteEvent(): void {
    const currentEvent = this.headerData;
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for deletion');
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Delete Event',
      message: 'Are you sure you want to delete this event? This action will also remove linked members, media, programs, and tasks.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      highlightText: currentEvent.eventName
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.overviewEventService.deleteEvent(currentEvent.eventId).subscribe({
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

  public async onEventLogoSelected(event: Event): Promise<void> {
    event.stopPropagation();
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] || null;
    inputElement.value = '';

    if (!selectedFile) return;

    const currentEvent = this.headerData;
    if (!currentEvent?.eventId || !currentEvent?.committeeId) {
      this.notifier.error('Event reference is missing. Please reload the workspace.');
      return;
    }

    const croppedFile = await this.openEventLogoCropDialog(selectedFile);
    if (!croppedFile) return;

    this.isUploadingEventLogo.set(true);

    try {
      const uploadedMetadata = await firstValueFrom(
        this.imageAssetService.uploadSingleImageForCommitteeLogo(croppedFile, `event-logo-${currentEvent.eventId}`)
      );

      const updated = await firstValueFrom(
        this.overviewEventService.updateEventLogo(currentEvent.eventId, currentEvent.committeeId, uploadedMetadata.publicAbsoluteUrl)
      );

      this.stateService.headerData.set({
        ...currentEvent,
        eventLogo: updated.eventLogo || uploadedMetadata.publicAbsoluteUrl
      });
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.notifier.success('Event logo updated successfully.');
    } catch (error: any) {
      this.notifier.error(error?.message || 'Failed to update event logo.');
    } finally {
      this.isUploadingEventLogo.set(false);
    }
  }

  public onEventLogoLoadError(): void {
    if (this.headerData) {
      this.stateService.headerData.set({ ...this.headerData, eventLogo: null });
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