import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../../../environments/environment';
import {
  EventVotingPayload,
  ToggleEventVotingRolePayload,
  LockEventVotingRolesPayload,
  UnlockEventVotingRolesPayload,
  StartEventNominationsPayload,
  StopEventNominationsPayload,
  AllowEventVotingPayload,
  StopEventVotingPayload,
  DeclareEventResultsPayload,
  ResolveTieBreakerPayload,
  VacateVotingRolePayload,
  AssignWinningRolePayload,
  DirectAssignWinnerPayload,
  ExpressEventInterestPayload,
  ReviewEventInterestPayload,
  EventVoteHistory,
  CastEventVotePayload,
  EventResultsPayload,
  EventCommitteeMember,
  EventDirectAssignMember
} from './event-voting.models';

@Injectable({
  providedIn: 'root'
})
export class EventVotingService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public getEventVotingDetails(id: string): Observable<EventVotingPayload> {
    const query = `query {
      eventVotingDetails(id: ${id}) {
        id
        eventId
        availableRoles {
          roleId
          roleName
          roleCode
          hindiName
          englishName
        }
        mappedVotingRoles {
          roleId
          roleName
          hindiName
          englishName
          sortOrder
          winnerUserId
          winnerName
          winnerPhoto
          winnerVoteCount
        }
        myInterestRoleIds
        myInterestStatuses {
          roleId
          status
        }
        interestApprovedPeople {
          roleId
          approvedPeople {
            userId
            name
            email
            photo
          }
        }
        pendingEventInterests {
          eventId
          pending {
            id
            eventId
            roleId
            roleName
            userId
            userName
            userEmail
            userPhoto
            status
            createdAt
          }
        }
        myVotes {
          roleId
          candidateId
          votedAt
        }
        canReviewInterest
        canManageVotingRoles
        currentCommitteeRole
        votingPhaseState
        votingMode
      }
    }`;

    return this.http.post<{ data: { eventVotingDetails: EventVotingPayload } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.eventVotingDetails)
    );
  }

  public toggleEventVotingRole(eventId: number, roleId: number, enabled: boolean): Observable<ToggleEventVotingRolePayload> {
    const mutation = `mutation ToggleEventVotingRole($eventId: Int!, $roleId: Int!, $enabled: Boolean!) {
      toggleEventVotingRole(eventId: $eventId, roleId: $roleId, enabled: $enabled) {
        eventId
        roleId
        enabled
        mappedVotingRoles {
          roleId
          roleName
          hindiName
          englishName
          sortOrder
          winnerUserId
          winnerName
          winnerPhoto
          winnerVoteCount
        }
      }
    }`;

    return this.http.post<{ data: { toggleEventVotingRole: ToggleEventVotingRolePayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: { eventId, roleId, enabled }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.toggleEventVotingRole)
    );
  }

  public lockEventVotingRoles(eventId: number): Observable<LockEventVotingRolesPayload> {
    const mutation = `mutation LockEventVotingRoles($eventId: Int!) {
      lockEventVotingRoles(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { lockEventVotingRoles: LockEventVotingRolesPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: { eventId }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.lockEventVotingRoles)
    );
  }

  public unlockEventVotingRoles(eventId: number): Observable<UnlockEventVotingRolesPayload> {
    const mutation = `mutation UnlockEventVotingRoles($eventId: Int!) {
      unlockEventVotingRoles(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { unlockEventVotingRoles: UnlockEventVotingRolesPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: { eventId }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.unlockEventVotingRoles)
    );
  }

  public startEventNominations(eventId: number): Observable<StartEventNominationsPayload> {
    const mutation = `mutation StartEventNominations($eventId: Int!) {
      startEventNominations(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { startEventNominations: StartEventNominationsPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.startEventNominations)
    );
  }

  public stopEventNominations(eventId: number): Observable<StopEventNominationsPayload> {
    const mutation = `mutation StopEventNominations($eventId: Int!) {
      stopEventNominations(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { stopEventNominations: StopEventNominationsPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.stopEventNominations)
    );
  }

  public allowEventVoting(eventId: number): Observable<AllowEventVotingPayload> {
    const mutation = `mutation AllowEventVoting($eventId: Int!) {
      allowEventVoting(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { allowEventVoting: AllowEventVotingPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: { eventId }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.allowEventVoting)
    );
  }

  public stopEventVoting(eventId: number): Observable<StopEventVotingPayload> {
    const mutation = `mutation StopEventVoting($eventId: Int!) {
      stopEventVoting(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { stopEventVoting: StopEventVotingPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.stopEventVoting)
    );
  }

  public declareEventResults(eventId: number): Observable<DeclareEventResultsPayload> {
    const mutation = `mutation DeclareEventResults($eventId: Int!) {
      declareEventResults(eventId: $eventId) {
        eventId
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { declareEventResults: DeclareEventResultsPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.declareEventResults)
    );
  }

  public expressEventInterest(eventId: number, roleId: number, action: 'INTERESTED' | 'WITHDRAW'): Observable<ExpressEventInterestPayload> {
    const mutation = `mutation ExpressEventInterest($eventId: Int!, $roleId: Int!, $action: String!) {
      expressEventInterest(eventId: $eventId, roleId: $roleId, action: $action) {
        eventId
        roleId
        expressed
        myInterestRoleIds
        myInterestStatuses {
          roleId
          status
        }
      }
    }`;

    return this.http.post<{ data: { expressEventInterest: ExpressEventInterestPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: { eventId, roleId, action }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.expressEventInterest)
    );
  }

  public reviewEventInterest(eventId: number, roleId: number, userId: number, status: 'APPROVED' | 'REJECTED'): Observable<ReviewEventInterestPayload> {
    const mutation = `mutation ReviewEventInterest($eventId: Int!, $roleId: Int!, $userId: Int!, $status: String!) {
      reviewEventInterest(eventId: $eventId, roleId: $roleId, userId: $userId, status: $status) {
        eventId
        roleId
        userId
        status
        autoRejectedOthers
        previousDesignation
      }
    }`;

    return this.http.post<{ data: { reviewEventInterest: ReviewEventInterestPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: { eventId, roleId, userId, status }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.reviewEventInterest)
    );
  }

  public castEventVote(eventId: number, roleId: number, candidateId: number): Observable<CastEventVotePayload> {
    const mutation = `mutation CastEventVote($eventId: Int!, $roleId: Int!, $candidateId: Int!) {
      castEventVote(eventId: $eventId, roleId: $roleId, candidateId: $candidateId) {
        eventId
        roleId
        voterId
        candidateId
        voted
      }
    }`;

    return this.http.post<{ data: { castEventVote: CastEventVotePayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: { eventId, roleId, candidateId }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.castEventVote)
    );
  }

  public getEventResults(eventId: number): Observable<EventResultsPayload> {
    const query = `query EventResults($eventId: Int!) {
      eventResults(eventId: $eventId) {
        eventId
        eventName
        declaredAt
        roles {
          roleId
          roleName
          totalVotes
          candidates {
            userId
            name
            email
            photo
            committeeRole
            voteCount
            isWinner
          }
        }
      }
    }`;

    return this.http.post<{ data: { eventResults: EventResultsPayload } }>(
      this.graphqlUrl,
      { query, variables: { eventId } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.eventResults)
    );
  }

  public getEventVoteHistory(eventId: number): Observable<EventVoteHistory> {
    const query = `query GetEventVoteHistory($eventId: Int!) {
      eventVoteHistory(eventId: $eventId) {
        eventId
        eventName
        totalMembers
        votedCount
        notVotedCount
        members {
          userId
          name
          email
          photo
          committeeRole
          hasVoted
        }
      }
    }`;

    return this.http.post<{ data: { eventVoteHistory: EventVoteHistory } }>(
      this.graphqlUrl,
      {
        query,
        variables: { eventId }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.eventVoteHistory)
    );
  }

  public resolveTieBreaker(eventId: number, roleId: number, winnerCandidateId: number): Observable<ResolveTieBreakerPayload> {
    const mutation = `mutation ResolveTieBreaker($eventId: Int!, $roleId: Int!, $winnerCandidateId: Int!) {
      resolveTieBreaker(eventId: $eventId, roleId: $roleId, winnerCandidateId: $winnerCandidateId) {
        eventId
        roleId
        winnerUserId
        winnerName
        winnerPhoto
        winnerVoteCount
      }
    }`;

    return this.http.post<{ data: { resolveTieBreaker: ResolveTieBreakerPayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: { eventId, roleId, winnerCandidateId }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.resolveTieBreaker)
    );
  }

  public assignWinningRole(eventId: number, roleId: number, newWinnerUserId: number, newWinnerName: string, newWinnerPhoto: string | null): Observable<AssignWinningRolePayload> {
    const mutation = `mutation AssignWinningRole($eventId: Int!, $roleId: Int!, $newWinnerUserId: Int!, $newWinnerName: String!, $newWinnerPhoto: String) {
      assignWinningRole(eventId: $eventId, roleId: $roleId, newWinnerUserId: $newWinnerUserId, newWinnerName: $newWinnerName, newWinnerPhoto: $newWinnerPhoto) {
        eventId
        roleId
        winnerUserId
        winnerName
        winnerPhoto
        winnerVoteCount
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { assignWinningRole: AssignWinningRolePayload } }>(
      this.graphqlUrl,
      {
        query: mutation,
        variables: { eventId, roleId, newWinnerUserId, newWinnerName, newWinnerPhoto }
      },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.assignWinningRole)
    );
  }

  public vacateEventVotingRole(eventId: number, roleId: number): Observable<VacateVotingRolePayload> {
    const mutation = `mutation VacateVotingRole($eventId: Int!, $roleId: Int!) {
      vacateVotingRole(eventId: $eventId, roleId: $roleId) {
        eventId
        roleId
        success
      }
    }`;

    return this.http.post<{ data: { vacateVotingRole: VacateVotingRolePayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId, roleId } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.vacateVotingRole)
    );
  }

  public updateEventVotingMode(eventId: number, mode: 'VOTING' | 'DIRECT_ASSIGN'): Observable<{ eventId: number; votingMode: string }> {
    const mutation = `mutation UpdateEventVotingMode($eventId: Int!, $mode: String!) {
      updateEventVotingMode(eventId: $eventId, mode: $mode) {
        eventId
        votingMode
      }
    }`;

    return this.http.post<{ data: { updateEventVotingMode: { eventId: number; votingMode: string } } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId, mode } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.updateEventVotingMode)
    );
  }

  public getCommitteeMembers(eventId: number): Observable<EventCommitteeMember[]> {
    const query = `query {
      eventCommitteeMembers(eventId: ${eventId}) {
        userId
        name
        email
        photo
        committeeRole
      }
    }`;

    return this.http.post<{ data: { eventCommitteeMembers: EventCommitteeMember[] } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.eventCommitteeMembers)
    );
  }

  public getDirectAssignMembers(eventId: number): Observable<EventDirectAssignMember[]> {
    const query = `query {
      eventDirectAssignMembers(eventId: ${eventId}) {
        userId
        name
        email
        photo
        committeeRole
        isWinner
      }
    }`;

    return this.http.post<{ data: { eventDirectAssignMembers: EventDirectAssignMember[] } }>(
      this.graphqlUrl,
      { query },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.eventDirectAssignMembers)
    );
  }

  public directAssignWinner(eventId: number, roleId: number, userId: number): Observable<DirectAssignWinnerPayload> {
    const mutation = `mutation DirectAssignWinner($eventId: Int!, $roleId: Int!, $userId: Int!) {
      directAssignWinner(eventId: $eventId, roleId: $roleId, userId: $userId) {
        eventId
        roleId
        winnerUserId
        winnerName
        winnerPhoto
        winnerVoteCount
        votingPhaseState
      }
    }`;

    return this.http.post<{ data: { directAssignWinner: DirectAssignWinnerPayload } }>(
      this.graphqlUrl,
      { query: mutation, variables: { eventId, roleId, userId } },
      { withCredentials: true }
    ).pipe(
      map(res => res.data.directAssignWinner)
    );
  }
}
