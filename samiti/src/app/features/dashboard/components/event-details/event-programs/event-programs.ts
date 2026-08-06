import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { CreateProgramDialogComponent } from '../../../../../components/dialog/create-program/create-program.component';
import { EventProgramsService } from './event-programs.service';
import { EventProgramsPayload } from './event-programs.models';
import { Subscription } from 'rxjs';

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
export class EventProgramsComponent implements OnInit, OnDestroy{
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly programsService = inject(EventProgramsService);
  private parentParamsSub?: Subscription;

  public eventData: EventProgramsPayload | null = null;

  public get programsCount(): number {
    return this.eventData?.programs?.length ?? 0;
  }

  ngOnInit(): void {
    const parentParams$ = this.route.parent?.params;
    if (!parentParams$) return;

    this.parentParamsSub = parentParams$.subscribe(params => {
      const eventId = params['id'];
      if (eventId) {
        this.loadEventPrograms(eventId);
      }
    });
  }

  private loadEventPrograms(eventId: string): void {
    this.programsService.getEventPrograms(eventId).subscribe({
      next: (data) => {
        this.eventData = data ?? null;
      },
      error: (err: any) => {
        this.eventData = null;
      }
    });
  }

  public onCreateProgram(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available'); return; }
    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateProgramDialogComponent, {
      position: { right: '0', top: '0' }, height: '100%', width: '50%',
      autoFocus: true, disableClose: true, hasBackdrop: true, panelClass: 'slide-in-dialog',
      data: { eventId: currentEvent.eventId, address: '' }
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

  ngOnDestroy(): void {
    this.parentParamsSub?.unsubscribe();
  }
}