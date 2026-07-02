import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, throwError } from 'rxjs';
import { DemoteMemberDialogComponent } from './demote-member.component';
import { DemoteMemberDialogData, DemoteMemberDialogResponse, DemoteMemberResponse } from './demote-member.models';

@Injectable({
  providedIn: 'root',
})
export class DemoteMemberDialogService {
  private readonly dialog = inject(MatDialog);

  open(data: DemoteMemberDialogData): MatDialogRef<DemoteMemberDialogComponent, DemoteMemberDialogResponse> {
    return this.dialog.open(DemoteMemberDialogComponent, {
      width: '450px',
      disableClose: true,
      data: data,
    });
  }

  demoteMember(userId: string, committeeId: string, newRole: string): Observable<DemoteMemberResponse> {
    return throwError(() => new Error('Demote member flow has been removed from UI cleanup.'));
  }
}
