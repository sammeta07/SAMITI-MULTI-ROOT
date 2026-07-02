import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, throwError } from 'rxjs';
import { PromoteMemberDialogComponent } from './promote-member.component';
import { PromoteMemberDialogData, PromoteMemberDialogResponse, PromoteMemberResponse, MemberDataResponse } from './promote-member.models';

@Injectable({
  providedIn: 'root',
})
export class PromoteMemberDialogService {
  private readonly dialog = inject(MatDialog);

  open(data: PromoteMemberDialogData): MatDialogRef<PromoteMemberDialogComponent, PromoteMemberDialogResponse> {
    return this.dialog.open(PromoteMemberDialogComponent, {
      width: '450px',
      disableClose: true,
      data: data,
    });
  }

  promoteMember(userId: string, committeeId: string, newRole: string): Observable<PromoteMemberResponse> {
    return throwError(() => new Error('Promote member flow has been removed from UI cleanup.'));
  }

  getMember(userId: string, committeeId: string): Observable<MemberDataResponse> {
    return throwError(() => new Error('Get member flow has been removed from UI cleanup.'));
  }
}
