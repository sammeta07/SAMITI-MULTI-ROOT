import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpErrorResponse } from '@angular/common/http';
import { EventDetailsService } from './event-details.service';
import { EventDetailsPayload } from './event-details.models';
import { NotifierService } from '../../../../shared/notifier/notifier.service';

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss'
})
export class EventDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notifier = inject(NotifierService);
  private readonly eventDetailsService = inject(EventDetailsService);

  public readonly isLoading = signal<boolean>(false);
  public readonly eventData = signal<EventDetailsPayload | null>(null);

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const eventId = params['id'];
      if (eventId) {
        this.fetchEventDetails(eventId);
      }
    });
  }

  public goBackToDashboardHome(): void {
    this.router.navigate(['/dashboard', 'home']);
  }

  private fetchEventDetails(id: string): void {
    this.isLoading.set(true);

    this.eventDetailsService.getEventDetails(id).subscribe({
      next: (data: EventDetailsPayload) => {
        this.eventData.set(data ?? null);
        this.isLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load event details.');
        this.eventData.set(null);
        this.isLoading.set(false);
      }
    });
  }
}