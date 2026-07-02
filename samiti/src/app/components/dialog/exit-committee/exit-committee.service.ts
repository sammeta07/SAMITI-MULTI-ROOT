import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, throwError } from 'rxjs';
import { ExitCommitteeDialogComponent } from './exit-committee.component';
import { ExitCommitteeDialogData, ExitCommitteeDialogResponse, ExitCommitteeResponse } from './exit-committee.models';

@Injectable({
  providedIn: 'root',
})
export class ExitCommitteeDialogService {
  private readonly dialog = inject(MatDialog);

  open(data: ExitCommitteeDialogData): MatDialogRef<ExitCommitteeDialogComponent, ExitCommitteeDialogResponse> {
    return this.dialog.open(ExitCommitteeDialogComponent, {
      width: '450px',
      disableClose: true,
      data: data,
    });
  }

  exitCommittee(committeeId: string): Observable<ExitCommitteeResponse> {
    return throwError(() => new Error('Exit committee flow has been removed from UI cleanup.'));
  }
}
