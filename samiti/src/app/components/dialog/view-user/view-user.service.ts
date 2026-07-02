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

  getMemberDetails(userId: string, committeeId: string): Observable<MemberDetailsResponse> {
    const userRelationalAnalyticsByUserIdQueryDocument = `query UserRelationalAnalyticsByUserId($userId: Int!, $committeeId: Int) {
      userRelationalAnalyticsByUserId(userId: $userId, committeeId: $committeeId) {
        statusCode
        status
        message
        data {
          profile {
            id
            name
            email
            mobile
            date_of_birth
            gender
            profile_photo
            created_at
          }
          associations {
            committees {
              committee_id
              committee_name
              logo
              is_committee_admin
            }
            programs_owned {
              program_id
              program_name
              status
              committee_id
            }
          }
          kpi_metrics {
            tasks_summary {
              total_assigned
              completed
              pending
              critical_overdue
              listing {
                task_id
                task_title
                status
                due_date
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

        const userRelationalAnalyticsPayload = graphQlResponseEnvelope.data?.userRelationalAnalyticsByUserId;
        if (!userRelationalAnalyticsPayload) {
          throw new Error('Invalid user analytics response payload');
        }

        return userRelationalAnalyticsPayload;
      })
    );
  }
}
