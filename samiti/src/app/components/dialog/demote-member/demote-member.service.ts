import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { DemoteMemberDialogComponent } from './demote-member.component';
import { DemoteMemberDialogData, DemoteMemberDialogResponse, DemoteMemberResponse } from './demote-member.models';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

interface DemoteCommitteeAdminPayload {
  committeeId: number;
  targetUserId: number;
  newRole: string;
  actionByUserId: number;
  actionAtTime: string;
}

@Injectable({
  providedIn: 'root',
})
export class DemoteMemberDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  open(data: DemoteMemberDialogData): MatDialogRef<DemoteMemberDialogComponent, DemoteMemberDialogResponse> {
    return this.dialog.open(DemoteMemberDialogComponent, {
      width: '450px',
      disableClose: true,
      data: data,
    });
  }

  demoteMember(userId: string, committeeId: string, newRole: string): Observable<DemoteMemberResponse> {
    const query = `mutation DemoteCommitteeAdmin($committeeId: Int!, $targetUserId: Int!, $newRole: CommitteeAdminDemotionRole!) {
      demoteCommitteeAdmin(committeeId: $committeeId, targetUserId: $targetUserId, newRole: $newRole) {
        committeeId
        targetUserId
        newRole
        actionByUserId
        actionAtTime
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ demoteCommitteeAdmin: DemoteCommitteeAdminPayload }>>(
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
          throw new Error(response.errors[0].message || 'Failed to demote committee admin');
        }

        const payload = response.data?.demoteCommitteeAdmin;
        if (!payload) {
          throw new Error('Invalid demote committee admin response payload');
        }

        return {
          userId: payload.targetUserId,
          committeeId: payload.committeeId,
          role: payload.newRole,
          updatedAt: payload.actionAtTime,
        } as DemoteMemberResponse;
      })
    );
  }
}
