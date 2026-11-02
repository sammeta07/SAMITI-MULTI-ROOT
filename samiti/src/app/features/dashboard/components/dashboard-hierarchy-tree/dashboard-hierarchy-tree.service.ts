import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { CommitteeDetailsPayload, RoleNode } from './dashboard-hierarchy-tree.models';

/**
 * Fields selected for every hierarchy tree node at any nesting depth.
 * Kept in a single helper so the GraphQL query stays DRY across the
 * (potentially many) recursive `children` blocks.
 */
const nodeFields = `
  id
  name
  type
  logo
  roles {
    name
    color
    icon
  }
  startDate
  endDate
  startTime
  endTime
  ownerUserId
  visibility
  votingPhaseState
  price
  taskParentId
  allTasks {
    id
    name
    type
    taskParentId
    roles {
      name
      color
      icon
    }
    ownerUserId
  }
`;

// Recursively build a `children { ... }` block for the non-task hierarchy.
const buildChildrenBlock = (depth: number): string => {
  if (depth <= 0) return '';
  return `
    children {
      ${nodeFields}
      ${buildChildrenBlock(depth - 1)}
    }
  `;
};

// Tasks are fetched as a flat list per event and rebuilt from parent IDs,
// so this depth only covers committee → event → program/task roots.
const HIERARCHY_DEPTH = 2;

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

  public getAdminHierarchyTree(year?: number): Observable<RoleNode[]> {
    const query = `query AdminHierarchyTree($year: Int) {
      adminHierarchyTree(year: $year) {
        roleName
        committees {
          ${nodeFields}
          ${buildChildrenBlock(HIERARCHY_DEPTH)}
        }
      }
    }`;

    return this.http.post<{ data: { adminHierarchyTree: RoleNode[] } }>(this.graphqlUrl, {
      query,
      variables: { year: year ?? null }
    }, { withCredentials: true }).pipe(
      map(res => res.data.adminHierarchyTree)
    );
  }

  public getCommitteeDetails(id: number): Observable<CommitteeDetailsPayload> {
    const query = `query {
      committeeDetails(id: ${id}) {
        id
        committeeId
        committeeName
        address
        establishYear
        logo
        contactNumbers
        createdBy
        createdAt
        committeeRole
        members {
          id
          name
          email
          committeeRole
        }
      }
    }`;

    return this.http.post<{ data: { committeeDetails: CommitteeDetailsPayload } }>(this.graphqlUrl, { query }, { withCredentials: true }).pipe(
      map(res => res.data.committeeDetails)
    );
  }
}