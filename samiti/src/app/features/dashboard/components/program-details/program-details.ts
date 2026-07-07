import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpErrorResponse } from '@angular/common/http';
import { ProgramDetailsPayload, ProgramTask } from './program-details.models';
import { ProgramDetailsService } from './program-details.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';

@Component({
  selector: 'app-program-details',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './program-details.html',
  styleUrl: './program-details.scss'
})
export class ProgramDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly notifier = inject(NotifierService);
  private readonly programDetailsService = inject(ProgramDetailsService);

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
    // TODO: implement edit dialog
  }

  public onDeleteProgram(): void {
    // TODO: implement delete with confirm dialog
  }

  public onAddTask(): void {
    // TODO: implement add task dialog
  }
}
