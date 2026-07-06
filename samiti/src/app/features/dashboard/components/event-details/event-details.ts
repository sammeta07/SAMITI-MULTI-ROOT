import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpErrorResponse } from '@angular/common/http';
import { EventDetailsService } from './event-details.service';
import { EventDetailsPayload, EventPerson } from './event-details.models';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { CreateProgramDialogComponent } from '../../../../components/dialog/create-program/create-program.component';

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
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly eventDetailsService = inject(EventDetailsService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);

  public readonly isLoading = signal<boolean>(false);
  public readonly eventData = signal<EventDetailsPayload | null>(null);
  public readonly eventAdmins = signal<EventPerson[]>([]);
  public readonly eventMembers = signal<EventPerson[]>([]);

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const eventId = params['id'];
      if (eventId) {
        this.fetchEventDetails(eventId);
      }
    });
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

  public onEditEvent(): void {
    // TODO: implement edit dialog
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