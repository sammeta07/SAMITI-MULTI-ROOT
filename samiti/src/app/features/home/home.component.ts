import { Component, inject, effect, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatExpansionModule, MatAccordion } from '@angular/material/expansion';
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
import { CommitteeListResponseGuestUser, CommitteeListRequestBackend, CommitteeAuthItem, CommitteesList, JoinCommitteeRequestBody, JoinCommitteeApiResponse, ToggleCommitteeFavouriteResponse, CancelRequestApiResponse } from './home.models';

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
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements AfterViewInit {
private readonly headerService = inject(HeaderService);
  private readonly homeService = inject(HomeService);
  private readonly notifier = inject(NotifierService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly authService = inject(AuthService); // Injecting core centralized state signal
  private readonly dialog = inject(MatDialog); // Injecting MatDialog to open dialogs
  private readonly confirmDialog = inject(ConfirmDialogService); // Injecting ConfirmDialogService

  @ViewChild('nearbyAccordion') nearbyAccordion!: MatAccordion;
  @ViewChild('favouriteAccordion') favouriteAccordion!: MatAccordion;

  userLocationCords = this.headerService.userLocationCords;
  radiusOptions: number[] = [1, 5, 10, 25, 100, 1000];
  selectedCommitteeRadius: number = 5;
  selectedProgramRadius: number = 5;
  selectedTabIndex: number = 0;
  committeeList: CommitteesList[] = [];
  copiedCommitteeId: string | null = null;

  // 🛠️ Reactive Computed Getter: Sync changes natively across header operations
  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  // Show only committees where logged-in user is NOT already an accepted admin/member
  get nearbyGroups(): CommitteesList[] {
    if (!this.isLoggedIn) return this.committeeList;
    return this.committeeList.filter(c => this.isAuthItem(c) && c.membershipStatus !== 'ACCEPTED' && !c.isFavourite);
  }

  get favouriteGroups(): CommitteesList[] {
    if (!this.isLoggedIn) return [];
    return this.committeeList.filter(c => this.isAuthItem(c) && c.isFavourite === 1);
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

  ngAfterViewInit(): void {}

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
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.notifier.error(error?.message || error?.error || 'Failed to fetch committees');
        this.cdr.detectChanges();
      }
    });
  }

  // Type guard: only CommitteeAuthItem has membership fields
  private isAuthItem(c: CommitteesList): c is CommitteeAuthItem {
    return 'membershipStatus' in c;
  }

// 🛡️ Action: Send Request to join Selected operational matrix unit
  joinCommittee(id: number, event: Event): void {
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
      this.homeService.joinCommittee(body).subscribe({
        next: (response: JoinCommitteeApiResponse | undefined) => {
          this.notifier.success('Join request sent successfully!');
          if (committee && this.isAuthItem(committee)) {
            committee.membershipStatus = 'PENDING';
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
            committee.membershipStatus = null;
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
        this.notifier.success(response.isFavourite ? 'Added to Favourites' : 'Removed from Favourites');
      },
      error: (err) => {
        this.notifier.error(err?.message || 'Failed to update favourite status');
      }
    });
  }

  expandNearby() {
    if (this.nearbyAccordion) {
      Promise.resolve().then(() => this.nearbyAccordion.openAll());
    }
  }

  collapseNearby() {
    if (this.nearbyAccordion) {
      Promise.resolve().then(() => this.nearbyAccordion.closeAll());
    }
  }

  expandFavourites() {
    if (this.favouriteAccordion) {
      Promise.resolve().then(() => this.favouriteAccordion.openAll());
    }
  }

  collapseFavourites() {
    if (this.favouriteAccordion) {
      Promise.resolve().then(() => this.favouriteAccordion.closeAll());
    }
  }

  getTruncatedDescription(description: string | null): string {
    if (!description) return '';
    return description.length > 100 ? description.substring(0, 100) + '...' : description;
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