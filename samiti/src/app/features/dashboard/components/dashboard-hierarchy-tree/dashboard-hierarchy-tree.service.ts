import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { CommitteeDetailsPayload, RoleNode } from './dashboard-hierarchy-tree.models';

@Injectable({
  providedIn: 'root'
})
export class DashboardHierarchyTreeService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;
  public readonly refreshHierarchyTree = signal<number>(0);

  public triggerHierarchyTreeRefresh(): void {
    this.refreshHierarchyTree.update((value) => value + 1);
  }

  public getAdminHierarchyTree(): Observable<RoleNode[]> {
    const query = `query {
      adminHierarchyTree {
        roleName
        committees {
          id
          name
          type
          logo
          roles
          children {
            id
            name
            type
            logo
            roles
            children {
              id
              name
              type
              logo
              roles
              children {
                id
                name
                type
                logo
                roles
                children {
                  id
                  name
                  type
                  logo
                  roles
                }
              }
            }
          }
        }
      }
    }`;

    return this.http.post<{ data: { adminHierarchyTree: RoleNode[] } }>(this.graphqlUrl, { query }, { withCredentials: true }).pipe(
      map(res => res.data.adminHierarchyTree)
    );
  }

  public getCommitteeDetails(id: number): Observable<CommitteeDetailsPayload> {
    const query = `query {
      committeeDetails(id: ${id}) {
        id
        committeeId
        committeeName
        description
        address
        establishYear
        logo
        contactNumbers
        createdBy
        createdAt
        isLoggedUserAdmin
        members {
          id
          name
          email
          isCommitteeAdmin
        }
      }
    }`;

    return this.http.post<{ data: { committeeDetails: CommitteeDetailsPayload } }>(this.graphqlUrl, { query }, { withCredentials: true }).pipe(
      map(res => res.data.committeeDetails)
    );
  }
}
