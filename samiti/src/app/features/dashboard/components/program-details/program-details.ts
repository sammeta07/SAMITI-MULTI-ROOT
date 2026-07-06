import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProgramDetailsPayload, ProgramTask } from './program-details.models';

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

  public readonly isLoading = signal<boolean>(false);
  public readonly programData = signal<ProgramDetailsPayload | null>(null);
  public readonly tasks = signal<ProgramTask[]>([]);

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const programId = params['id'];
      if (programId) {
        // TODO: fetch program details
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
