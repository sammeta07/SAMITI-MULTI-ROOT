import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { CommitteeDetailsPayload, RoleNode } from './dashboard-hierarchy-tree.models';
import { sanitizeCloudinaryLogoUrl } from '../../../../shared/services/cloudinary-logo.util';

/**
 * Fields selected for every hierarchy tree node at any nesting depth.
 * Kept in a single helper so the GraphQL query stays DRY across the
 * (potentially many) recursive `children` blocks.
 */
const nodeFields = `
  id
  committeeId
  name
  type
  logo
  canUpdateLogo
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
  public readonly logoUpdated = signal<
    | { type: 'group'; id: number; logo: string }
    | { type: 'event'; id: number; committeeId: number; logo: string }
    | null
  >(null);

  public triggerHierarchyTreeRefresh(): void {
    this.refreshHierarchyTree.update((value) => value + 1);
  }

  public notifyLogoUpdated(
    update:
      | { type: 'group'; id: number; logo: string }
      | { type: 'event'; id: number; committeeId: number; logo: string }
  ): void {
    this.logoUpdated.set(update);
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

  public updateCommitteeLogo(committeeId: number, logo: string): Observable<string> {
    const query = `mutation UpdateCommitteeLogo($input: UpdateCommitteeLogoInput!) {
      updateCommitteeLogo(input: $input) {
        data {
          logo
        }
      }
    }`;

    return this.http.post<{
      errors?: Array<{ message: string }>;
      data?: { updateCommitteeLogo?: { data?: { logo?: string | null } } };
    }>(
      this.graphqlUrl,
      { query, variables: { input: { committeeId, logo } } },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('; '));
        }
        const updatedLogo = response.data?.updateCommitteeLogo?.data?.logo;
        if (!updatedLogo) {
          throw new Error('GraphQL response is missing updated committee logo');
        }
        return sanitizeCloudinaryLogoUrl(updatedLogo) || updatedLogo;
      })
    );
  }

  public updateEventLogo(eventId: number, committeeId: number, eventLogo: string): Observable<string> {
    const query = `mutation UpdateEventLogo($input: UpdateEventLogoInput!) {
      updateEventLogo(input: $input) {
        eventId
        eventLogo
      }
    }`;

    return this.http.post<{
      errors?: Array<{ message: string }>;
      data?: { updateEventLogo?: { eventId: number; eventLogo: string | null } };
    }>(
      this.graphqlUrl,
      { query, variables: { input: { eventId, committeeId, eventLogo } } },
      { withCredentials: true }
    ).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('; '));
        }
        const updatedLogo = response.data?.updateEventLogo?.eventLogo;
        if (!updatedLogo) {
          throw new Error('GraphQL response is missing updated event logo');
        }
        return sanitizeCloudinaryLogoUrl(updatedLogo) || updatedLogo;
      })
    );
  }
}