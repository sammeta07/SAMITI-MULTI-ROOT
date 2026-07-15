import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { PromoteMemberDialogComponent } from './promote-member.component';
import { PromoteMemberDialogData, PromoteMemberDialogResponse, PromoteMemberResponse, MemberDataResponse } from './promote-member.models';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

interface PromoteCommitteeMemberPayload {
  committeeId: number;
  targetUserId: number;
  newRole: string;
  actionByUserId: number;
  actionAtTime: string;
}

@Injectable({
  providedIn: 'root',
})
export class PromoteMemberDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  open(data: PromoteMemberDialogData): MatDialogRef<PromoteMemberDialogComponent, PromoteMemberDialogResponse> {
    return this.dialog.open(PromoteMemberDialogComponent, {
      width: '450px',
      disableClose: true,
      data: data,
    });
  }

  promoteMember(userId: string, committeeId: string, newRole: string): Observable<PromoteMemberResponse> {
    const query = `mutation PromoteCommitteeMember($committeeId: Int!, $targetUserId: Int!, $newRole: CommitteeMemberPromotionRole!) {
      promoteCommitteeMember(committeeId: $committeeId, targetUserId: $targetUserId, newRole: $newRole) {
        committeeId
        targetUserId
        newRole
        actionByUserId
        actionAtTime
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ promoteCommitteeMember: PromoteCommitteeMemberPayload }>>(
      this.graphqlUrl,
      {
        query,
        variables: {
          committeeId: Number(committeeId),
          targetUserId: Number(userId),
          newRole,
        },
      },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to promote committee member');
        }

        const payload = response.data?.promoteCommitteeMember;
        if (!payload) {
          throw new Error('Invalid promote committee member response payload');
        }

        return {
          userId: payload.targetUserId,
          committeeId: payload.committeeId,
          role: payload.newRole,
          updatedAt: payload.actionAtTime,
        } as PromoteMemberResponse;
      })
    );
  }

  getMember(userId: string, committeeId: string): Observable<MemberDataResponse> {
    return throwError(() => new Error('Get member flow has been removed from UI cleanup.'));
  }
}
