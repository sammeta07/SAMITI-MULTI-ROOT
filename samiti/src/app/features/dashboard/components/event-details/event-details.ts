import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { HttpErrorResponse } from '@angular/common/http';
import { EventVotingService } from './event-voting/event-voting.service';
import { EventVotingPayload } from './event-voting/event-voting.models';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { EventDetailsStateService } from './event-details-state.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';

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
    MatFormFieldModule,
    FormsModule
  ],
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss'
})
export class EventDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notifier = inject(NotifierService);
  private readonly votingService = inject(EventVotingService);
  private readonly stateService = inject(EventDetailsStateService);

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
    return String(this.eventData?.currentCommitteeRole || 'NONE').toUpperCase() === 'COMMITTEE_MASTER_ADMIN';
  }

  public get currentVotingMode(): 'VOTING' | 'DIRECT_ASSIGN' | null {
    return (this.eventData?.votingMode as 'VOTING' | 'DIRECT_ASSIGN' | undefined) || 'VOTING';
  }

  public get votingPhaseState(): number {
    return Number(this.eventData?.votingPhaseState || 0);
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

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const eventId = params['id'];
      if (eventId) {
        this.loadVotingMetadata(eventId);
      }
    });
  }

  private loadVotingMetadata(id: string): void {
    this.votingService.getEventVotingDetails(id).subscribe({
      next: (data) => {
        this.stateService.eventData.set(data ?? null);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load event details.');
        this.stateService.eventData.set(null);
      }
    });
  }

  public navigateToTab(tab: string): void {
    const eventId = this.eventData?.eventId ?? this.route.snapshot.params['id'];
    if (eventId) {
      this.router.navigate(['/dashboard', 'event', eventId, tab]);
    }
  }

  public onVotingModeChange(mode: 'VOTING' | 'DIRECT_ASSIGN'): void {
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
}