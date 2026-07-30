import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { CreateProgramDialogComponent } from '../../../../../components/dialog/create-program/create-program.component';
import { EventDetailsStateService } from '../event-details-state.service';
import { EventDetailsPayload } from '../event-details.models';

@Component({
  selector: 'app-event-programs',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './event-programs.html',
  styleUrl: './event-programs.scss'
})
export class EventProgramsComponent {
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly stateService = inject(EventDetailsStateService);

  public get eventData(): EventDetailsPayload | null {
    return this.stateService.eventData();
  }

  public get programsCount(): number {
    return this.eventData?.programs?.length ?? 0;
  }

  public onCreateProgram(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available'); return; }
    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateProgramDialogComponent, {
      position: { right: '0', top: '0' }, height: '100%', width: '50%',
      autoFocus: true, disableClose: true, hasBackdrop: true, panelClass: 'slide-in-dialog',
      data: { eventId: currentEvent.eventId, address: currentEvent.committeeAddress || '' }
    });
    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (result) {
        this.notifier.success(`Program "${result.programName}" created successfully!`);
        if (result.programId) { this.router.navigate(['/dashboard', 'program', result.programId]); }
      }
    });
  }

  public onOpenProgram(programId: number): void {
    if (!Number.isInteger(programId) || programId <= 0) return;
    this.router.navigate(['/dashboard', 'program', programId]);
  }
}