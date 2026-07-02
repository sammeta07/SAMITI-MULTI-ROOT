import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ViewUserDialogComponent } from './view-user.component';
import { ViewUserDialogData, ViewUserDialogResponse, MemberDetailsResponse } from './view-user.models';

interface GraphQLErrorPayload {
  message: string;
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: GraphQLErrorPayload[];
}

@Injectable({
  providedIn: 'root',
})
export class ViewUserDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly http = inject(HttpClient);
  private readonly graphqlEndpointUrl = environment.graphqlUrl;

  open(data: ViewUserDialogData): MatDialogRef<ViewUserDialogComponent, ViewUserDialogResponse> {
    return this.dialog.open(ViewUserDialogComponent, {
      width: '450px',
      disableClose: true,
      data: data,
    });
  }

  getMemberDetails(userId: string, committeeId: string): Observable<any> {
    const userRelationalAnalyticsByUserIdQueryDocument = `query UserRelationalAnalyticsByUserId($userId: Int!, $committeeId: Int) {
      userRelationalAnalyticsByUserId(userId: $userId, committeeId: $committeeId) {
        data {
          profile {
            id
            name
            email
            mobile
            dateOfBirth
            gender
            profilePhoto
            createdAt
          }
          associations {
            committees {
              committeeId
              committeeName
              logo
              isCommitteeAdmin
            }
            programsOwned {
              programId
              programName
              status
              committeeId
            }
          }
          kpiMetrics {
            tasksSummary {
              totalAssigned
              completed
              pending
              criticalOverdue
              listing {
                taskId
                taskTitle
                status
                dueDate
                priority
              }
            }
          }
        }
      }
    }`;

    return this.http.post<GraphQLResponseEnvelope<{ userRelationalAnalyticsByUserId: MemberDetailsResponse }>>(
      this.graphqlEndpointUrl,
      {
        query: userRelationalAnalyticsByUserIdQueryDocument,
        variables: {
          userId: Number(userId),
          committeeId: committeeId ? Number(committeeId) : null
        }
      }
    ).pipe(
      map((graphQlResponseEnvelope) => {
        if (graphQlResponseEnvelope.errors?.length) {
          throw new Error(graphQlResponseEnvelope.errors[0].message || 'Failed to load user analytics');
        }

        return graphQlResponseEnvelope.data?.userRelationalAnalyticsByUserId!;
      })
    );
  }
}
