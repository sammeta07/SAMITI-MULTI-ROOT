import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { RemoveMemberDialogComponent } from './remove-member.component';
import { RemoveMemberDialogData, RemoveMemberDialogResponse, RemoveMemberResponse } from './remove-member.models';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

interface RemoveCommitteeMemberPayload {
  committeeId: number;
  targetUserId: number;
  removedByUserId: number;
  removedAtTime: string;
}

@Injectable({
  providedIn: 'root',
})
export class RemoveMemberDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  open(data: RemoveMemberDialogData): MatDialogRef<RemoveMemberDialogComponent, RemoveMemberDialogResponse> {
    return this.dialog.open(RemoveMemberDialogComponent, {
      width: '450px',
      disableClose: true,
      data: data,
    });
  }

  removeMember(userId: string, committeeId: string): Observable<RemoveMemberResponse> {
    const query = `mutation RemoveCommitteeMember($committeeId: Int!, $targetUserId: Int!) {
      removeCommitteeMember(committeeId: $committeeId, targetUserId: $targetUserId) {
        committeeId
        targetUserId
        removedByUserId
        removedAtTime
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ removeCommitteeMember: RemoveCommitteeMemberPayload }>>(
      this.graphqlUrl,
      {
        query,
        variables: {
          committeeId: Number(committeeId),
          targetUserId: Number(userId),
        },
      },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors[0].message || 'Failed to remove committee member');
        }

        const payload = response.data?.removeCommitteeMember;
        if (!payload) {
          throw new Error('Invalid remove committee member response payload');
        }

        return {
          userId: payload.targetUserId,
          committeeId: payload.committeeId,
          removedAt: payload.removedAtTime,
        } as RemoveMemberResponse;
      })
    );
  }
}
