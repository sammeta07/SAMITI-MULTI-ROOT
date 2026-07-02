import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, throwError } from 'rxjs';
import { RemoveMemberDialogComponent } from './remove-member.component';
import { RemoveMemberDialogData, RemoveMemberDialogResponse, RemoveMemberResponse } from './remove-member.models';

@Injectable({
  providedIn: 'root',
})
export class RemoveMemberDialogService {
  private readonly dialog = inject(MatDialog);

  open(data: RemoveMemberDialogData): MatDialogRef<RemoveMemberDialogComponent, RemoveMemberDialogResponse> {
    return this.dialog.open(RemoveMemberDialogComponent, {
      width: '450px',
      disableClose: true,
      data: data,
    });
  }

  removeMember(userId: string, committeeId: string): Observable<RemoveMemberResponse> {
    return throwError(() => new Error('Remove member flow has been removed from UI cleanup.'));
  }
}
