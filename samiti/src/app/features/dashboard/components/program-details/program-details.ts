import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpErrorResponse } from '@angular/common/http';
import { ProgramDetailsPayload, ProgramTask } from './program-details.models';
import { ProgramDetailsService } from './program-details.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { CreateProgramDialogComponent } from '../../../../components/dialog/create-program/create-program.component';

@Component({
  selector: 'app-program-details',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  templateUrl: './program-details.html',
  styleUrl: './program-details.scss'
})
export class ProgramDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly programDetailsService = inject(ProgramDetailsService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);

  public readonly isLoading = signal<boolean>(false);
  public readonly programData = signal<ProgramDetailsPayload | null>(null);
  public readonly tasks = signal<ProgramTask[]>([]);

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const programId = params['id'];
      if (programId) {
        this.fetchProgramDetails(programId);
      }
    });
  }

  private fetchProgramDetails(id: string): void {
    this.isLoading.set(true);
    this.programData.set(null);

    this.programDetailsService.getProgramDetails(id).subscribe({
      next: (data: ProgramDetailsPayload) => {
        this.programData.set(data ?? null);
        this.tasks.set([]);
        this.isLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load program details.');
        this.programData.set(null);
        this.tasks.set([]);
        this.isLoading.set(false);
      }
    });
  }

  public onEditProgram(): void {
    const currentProgram = this.programData();
    if (!currentProgram?.programId || !currentProgram?.eventId) {
      this.notifier.error('No program available for editing');
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
        programId: currentProgram.programId,
        eventId: currentProgram.eventId,
        programName: currentProgram.programName,
        address: currentProgram.address || '',
        visibility: currentProgram.visibility,
        startDate: currentProgram.startDate,
        endDate: currentProgram.endDate
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (!result) {
        return;
      }

      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.fetchProgramDetails(String(currentProgram.programId));
      this.notifier.success(`Program "${result.programName || currentProgram.programName}" updated successfully!`);
    });
  }

  public onDeleteProgram(): void {
    // TODO: implement delete with confirm dialog
  }

  public onAddTask(): void {
    // TODO: implement add task dialog
  }
}
