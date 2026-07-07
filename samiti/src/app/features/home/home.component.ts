import { Component, inject, effect, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule, MatTooltip } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HomeService } from './home.service';
import { HeaderService } from '../../components/header/header.service';
import { NotifierService } from '../../shared/notifier/notifier.service';
import { AuthService } from '../../core/services/auth.service';
import { CreateCommitteeDialogComponent } from '../../components/dialog/create-committee/create-committee.component';
import { ConfirmDialogService } from '../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../components/dialog/confirm/confirm-dialog.models';
import { CommitteeListResponseGuestUser, CommitteeListRequestBackend, CommitteeAuthItem, CommitteesList, CommitteeEvent, JoinCommitteeRequestBody, JoinCommitteeApiResponse, ToggleCommitteeFavouriteResponse, CancelRequestApiResponse } from './home.models';
import { TextFormatPipe } from '../../shared/pipe/text-format-pipe.pipe';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatExpansionModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDialogModule,
    TextFormatPipe,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnDestroy {
private readonly headerService = inject(HeaderService);
  private readonly homeService = inject(HomeService);
  private readonly notifier = inject(NotifierService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService); // Injecting core centralized state signal
  private readonly dialog = inject(MatDialog); // Injecting MatDialog to open dialogs
  private readonly confirmDialog = inject(ConfirmDialogService); // Injecting ConfirmDialogService

  private nearbyExpandedCommitteeIds = new Set<number>();
  private favouriteExpandedCommitteeIds = new Set<number>();
  private readonly carouselIndices = new Map<number, number>();
  private carouselTimer: ReturnType<typeof setInterval> | null = null;
  private readonly CAROUSEL_INTERVAL_MS = 3500;

  userLocationCords = this.headerService.userLocationCords;
  radiusOptions: number[] = [1, 5, 10, 25, 100, 1000];
  selectedCommitteeRadius: number = 5;
  selectedProgramRadius: number = 5;
  selectedTabIndex: number = 0;
  committeeList: CommitteesList[] = [];
  copiedCommitteeId: string | null = null;
  isCommitteeListLoading: boolean = true;

  // 🛠️ Reactive Computed Getter: Sync changes natively across header operations
  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  // Show committees where logged-in user is not yet an accepted member/admin and not in favourites
  get nearbyGroups(): CommitteesList[] {
    if (!this.isLoggedIn) return this.committeeList;
    return this.committeeList.filter(c =>
      this.isAuthItem(c) &&
      c.isCommitteeMember !== 1 &&
      c.isCommitteeAdmin !== 1 &&
      !c.isFavourite
    );
  }

  get favouriteGroups(): CommitteesList[] {
    if (!this.isLoggedIn) return [];
    return this.committeeList.filter(c => this.isAuthItem(c) && c.isFavourite === 1);
  }

  // ─── Event year tabs helpers ──────────────────────────────
  readonly currentYear: number = new Date().getFullYear();

  private extractEventYear(event: CommitteeEvent): number | null {
    if (!event.startDate) return null;
    const year = new Date(event.startDate).getFullYear();
    return Number.isNaN(year) ? null : year;
  }

  getCommitteeEventYears(committee: CommitteesList): number[] {
    const years = new Set<number>([this.currentYear]);
    for (const event of committee.events) {
      const year = this.extractEventYear(event);
      if (year) years.add(year);
    }
    const collected = Array.from(years);
    const maxYear = Math.max(...collected);
    const minYear = Math.min(...collected);
    const continuousYears: number[] = [];
    for (let year = maxYear; year >= minYear; year--) {
      continuousYears.push(year);
    }
    return continuousYears;
  }

  getEventsByYear(committee: CommitteesList, year: number): CommitteeEvent[] {
    return committee.events.filter((event) => this.extractEventYear(event) === year);
  }

  getDefaultYearTabIndex(committee: CommitteesList): number {
    const years = this.getCommitteeEventYears(committee);
    const index = years.indexOf(this.currentYear);
    return index >= 0 ? index : 0;
  }

  // ─── Open committee location in Google Maps for navigation ─────────
  openCommitteeInMaps(committee: CommitteesList, event: Event): void {
    event.stopPropagation();
    const address = (committee.address || '').trim();
    if (!address) {
      this.notifier.warn('No address available for navigation');
      return;
    }
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  }

  openEventDetails(eventId: number, event: Event): void {
    event.stopPropagation();
    if (!eventId) {
      return;
    }

    this.router.navigate(['/dashboard/event', eventId]);
  }

  // ─── Banner carousel helpers ───────────────────────────────────────
  getBannerIndex(eventId: number): number {
    return this.carouselIndices.get(eventId) ?? 0;
  }

  nextBanner(eventId: number, count: number, e: Event): void {
    e.stopPropagation();
    const current = this.getBannerIndex(eventId);
    this.carouselIndices.set(eventId, (current + 1) % count);
  }

  prevBanner(eventId: number, count: number, e: Event): void {
    e.stopPropagation();
    const current = this.getBannerIndex(eventId);
    this.carouselIndices.set(eventId, (current - 1 + count) % count);
  }

  private startCarouselAutoPlay(): void {
    this.stopCarouselAutoPlay();
    this.carouselTimer = setInterval(() => {
      for (const committee of this.committeeList) {
        for (const event of committee.events) {
          if ((event.bannerImages?.length ?? 0) > 1) {
            const current = this.carouselIndices.get(event.eventId) ?? 0;
            this.carouselIndices.set(event.eventId, (current + 1) % event.bannerImages.length);
          }
        }
      }
      this.cdr.detectChanges();
    }, this.CAROUSEL_INTERVAL_MS);
  }

  private stopCarouselAutoPlay(): void {
    if (this.carouselTimer !== null) {
      clearInterval(this.carouselTimer);
      this.carouselTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.stopCarouselAutoPlay();
  }

constructor() {
    // Effect to watch location coordinates
    effect(() => {
      const coords = this.userLocationCords();
      if (coords) {
        this.getCommitteeListByRange();
      }
    });

    // Effect to watch refresh signal from other components (e.g., DashboardComponent)
    effect(() => {
      const refreshTrigger = this.homeService.refreshCommitteeList();
      if (refreshTrigger > 0) {
        this.getCommitteeListByRange();
      }
    });
  }

  onRadiusChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.selectedCommitteeRadius = Number(target.value);
    this.getCommitteeListByRange();
  }

  getCommitteeListByRange() {
    const locationCoords = this.userLocationCords();
    if (!locationCoords) return;

    const body: CommitteeListRequestBackend = {
      latitude: locationCoords.lat,
      longitude: locationCoords.long,
      distanceKm: this.selectedCommitteeRadius,
    };

    const fetch$ = this.isLoggedIn
      ? this.homeService.getCommitteesListAuthUserByDistanceKm(body)
      : this.homeService.getCommitteesListGuestByDistanceKm(body);

    fetch$.subscribe({
      next: (res) => {
        this.committeeList = Array.isArray(res) ? res : [res];
        this.isCommitteeListLoading = false;
        this.syncExpandedPanelState();
        this.startCarouselAutoPlay();
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isCommitteeListLoading = false;
        this.notifier.error(error?.message || error?.error || 'Failed to fetch committees');
        this.cdr.detectChanges();
      }
    });
  }

  // Type guard: only CommitteeAuthItem has auth-specific fields
  private isAuthItem(c: CommitteesList): c is CommitteeAuthItem {
    return 'pendingRequestRole' in c;
  }

// 🛡️ Action: Send Request to join Selected operational matrix unit
  onRequestMemberRole(id: number, event: Event): void {
    event.stopPropagation(); // Avoid panel toggle conflict during interaction

    // Find the committee details for confirmation message
    const committee = this.committeeList.find(c => c.id === id);
    if (!committee) {
      this.notifier.error('Committee not found');
      return;
    }

    // Open confirmation dialog using Material Dialog
    const dialogData: ConfirmDialogData = {
      title: 'Join Committee',
        message: `Are you sure you want to join "${committee.committeeName}"?`,
    };

    const dialogRef = this.confirmDialog.open(dialogData);

    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return; // User cancelled the join request
      }

      const body:JoinCommitteeRequestBody={
        committeeId: committee.id,
        role: 'COMMITTEE_MEMBER'
      }
      // Proceed with join request API call
      this.homeService.requestCommitteeMembershipRole(body).subscribe({
        next: (response: JoinCommitteeApiResponse | undefined) => {
          this.notifier.success('Join request sent successfully!');
          if (committee && this.isAuthItem(committee)) {
            committee.pendingRequestRole = 'COMMITTEE_MEMBER';
            this.cdr.detectChanges();
          }
        },
        error: (err) => {
          this.notifier.error(err?.message || 'Failed to join committee');
        }
      });
    });
  }

cancelRequest(id: number, event: Event): void {
    event.stopPropagation(); // Avoid panel toggle conflict during interaction

    // Find the committee details for confirmation message
    const committee = this.committeeList.find(c => c.id === id);
    if (!committee) {
      this.notifier.error('Committee not found');
      return;
    }

    // Open confirmation dialog using Material Dialog
    const dialogData: ConfirmDialogData = {
      title: 'Cancel Join Request',
        message: `Are you sure you want to cancel your join request for "${committee.committeeName}"?`,
    };

    const dialogRef = this.confirmDialog.open(dialogData);

    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return; // User cancelled the action
      }

      // Proceed with cancel request API call
      this.homeService.cancelRequest(id).subscribe({
        next: (response: CancelRequestApiResponse | undefined) => {
          this.notifier.success('Join request cancelled successfully!');
          if (committee && this.isAuthItem(committee)) {
            committee.pendingRequestRole = null;
            this.cdr.detectChanges();
          }
          // Trigger refresh of committee list
          this.homeService.refreshCommitteeList.update(v => v + 1);
        },
        error: (err) => {
          this.notifier.error(err?.message || 'Failed to cancel request');
        }
      });
    });
  }

  toggleFavouriteCommittee(committeeId: number, event: Event): void {
    event.stopPropagation();
    const target = this.committeeList.find(g => g.id === committeeId);
    if (!target || !this.isAuthItem(target)) {
      return;
    }

    const nextFavouriteState = target.isFavourite ? 0 : 1;
    const targetTabIndex = nextFavouriteState === 1 ? 1 : 0;
    this.homeService.toggleCommitteeFavourite(committeeId, nextFavouriteState).subscribe({
      next: (response: ToggleCommitteeFavouriteResponse | undefined) => {
        if (!response) {
          this.notifier.error('Failed to update favourite status');
          return;
        }
        target.isFavourite = response.isFavourite;
        this.selectedTabIndex = targetTabIndex;
        this.cdr.detectChanges();
        this.scrollToCommittee(committeeId, targetTabIndex);
        // this.notifier.success(response.isFavourite ? 'Added to Favourites' : 'Removed from Favourites');
      },
      error: (err) => {
        this.notifier.error(err?.message || 'Failed to update favourite status');
      }
    });
  }

  expandNearby() {
    this.nearbyExpandedCommitteeIds = new Set(this.nearbyGroups.map(group => group.id));
  }

  collapseNearby() {
    this.nearbyExpandedCommitteeIds.clear();
  }

  expandFavourites() {
    this.favouriteExpandedCommitteeIds = new Set(this.favouriteGroups.map(group => group.id));
  }

  collapseFavourites() {
    this.favouriteExpandedCommitteeIds.clear();
  }

  isPanelExpanded(panelPrefix: 'nearby' | 'favourite', committeeId: number): boolean {
    return panelPrefix === 'nearby'
      ? this.nearbyExpandedCommitteeIds.has(committeeId)
      : this.favouriteExpandedCommitteeIds.has(committeeId);
  }

  updatePanelExpandedState(panelPrefix: 'nearby' | 'favourite', committeeId: number, expanded: boolean): void {
    const expandedSet = panelPrefix === 'nearby'
      ? this.nearbyExpandedCommitteeIds
      : this.favouriteExpandedCommitteeIds;

    if (expanded) {
      expandedSet.add(committeeId);
      return;
    }

    expandedSet.delete(committeeId);
  }

  private syncExpandedPanelState(): void {
    const nearbyIds = new Set(this.nearbyGroups.map(group => group.id));
    const favouriteIds = new Set(this.favouriteGroups.map(group => group.id));

    this.nearbyExpandedCommitteeIds = new Set(
      [...this.nearbyExpandedCommitteeIds].filter(id => nearbyIds.has(id))
    );

    this.favouriteExpandedCommitteeIds = new Set(
      [...this.favouriteExpandedCommitteeIds].filter(id => favouriteIds.has(id))
    );
  }

  getDistanceFromUser(committee: any): string {
    if (committee?.distance == null) return '';
    const distanceMeters = committee.distance;
    if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
    return `${Number((distanceMeters / 1000).toFixed(1))} km`;
  }

  private scrollToCommittee(committeeId: number, tabIndex: number): void {
    const panelId = tabIndex === 1 ? `favourite-committee-${committeeId}` : `nearby-committee-${committeeId}`;

    window.setTimeout(() => {
      const element = document.getElementById(panelId);
      if (!element) {
        return;
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }, 100);
  }
  
  async copyCommitteeId(committeeId: string, event: Event, tooltip: MatTooltip): Promise<void> {
    event.stopPropagation();
    try {
      this.copiedCommitteeId = committeeId;
      this.cdr.detectChanges();
      await navigator.clipboard.writeText(committeeId);

      const originalMessage = tooltip.message;
      tooltip.message = `Committee Id copied - ${committeeId}`;
      tooltip.show();

      setTimeout(() => {
        this.copiedCommitteeId = null;
        this.cdr.detectChanges();
      }, 2000);

      setTimeout(() => {
        tooltip.hide();
        setTimeout(() => tooltip.message = originalMessage, 500);
      }, 2000);
    } catch (err) {
      this.notifier.error('Failed to copy Committee Id');
      this.copiedCommitteeId = null;
      this.cdr.detectChanges();
    }
  }
}