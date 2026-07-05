import { loginTypes, loginMutationFields, loginResolvers } from './auth/login.graphql';
import { newUserRegistrationTypes, newUserRegistrationMutationFields, newUserRegistrationResolvers } from './auth/new-user-registration.graphql';
import { accountTypes, accountQueryFields, accountMutationFields, accountResolvers } from './auth/account.graphql';
import { userRelationalAnalyticsTypes, userRelationalAnalyticsQueryFields, userRelationalAnalyticsResolvers } from './users/user-relational-analytics-by-id.graphql';
import { imageAssetUploadTypes, imageAssetUploadMutationFields, imageAssetUploadResolvers } from './users/image-asset-upload.graphql';
import { createCommitteeTypes, createCommitteeMutationFields, createCommitteeResolvers } from './committees/create-committee.graphql';
import { updateCommitteeTypes, updateCommitteeMutationFields, updateCommitteeResolvers } from './committees/update-committee.graphql';
import { committeeMembershipRequestsTypes, committeeMembershipRequestsQueryFields, committeeMembershipRequestsMutationFields, committeeMembershipRequestsResolvers } from './committees/committee-membership-requests.graphql';
import { toggleCommitteeFavouriteTypes, toggleCommitteeFavouriteMutationFields, toggleCommitteeFavouriteResolvers } from './committees/toggle-committee-favourite.graphql';
import { hierarchyTreeTypes, hierarchyTreeQueryFields, hierarchyTreeResolvers } from './committees/hierarchy-tree.graphql';
import { committeeDetailsTypes, committeeDetailsQueryFields, committeeDetailsResolvers } from './committees/committee-details-by-id.graphql';
import { createEventTypes, createEventMutationFields, createEventResolvers } from './events/create-event.graphql';
import { eventDetailsTypes, eventDetailsQueryFields, eventDetailsResolvers } from './events/event-details-by-id.graphql';
import { eventsListTypes, eventsListQueryFields, eventsListResolvers } from './events/events-list-by-committee.graphql';
import { updateEventVisibilityTypes, updateEventVisibilityMutationFields, updateEventVisibilityResolvers } from './events/update-event-visibility.graphql';
import { deleteEventTypes, deleteEventMutationFields, deleteEventResolvers } from './events/delete-event.graphql';
import { authCommitteeTypes, authCommitteeQueryFields, authCommitteesResolvers } from './committees/committees-list/auth-user-committees-list.graphql';
import { guestCommitteeTypes, guestCommitteeQueryFields, guestCommitteesResolvers } from './committees/committees-list/guest-user-committees-list.graphql';
import { cancelCommitteeMembershipRequestTypes, cancelCommitteeMembershipRequestMutationFields, cancelCommitteeMembershipRequestResolvers } from './committees/user-requests/cancel-committee-membership-request.graphql';
import { submitCommitteeMembershipRequestTypes, submitCommitteeMembershipRequestMutationFields, submitCommitteeMembershipRequestResolvers } from './committees/user-requests/submit-committee-membership-request.graphql';

// Single schema — one Query block, one Mutation block
export const typeDefs = `
  ${guestCommitteeTypes}
  ${authCommitteeTypes}
  ${createCommitteeTypes}
  ${updateCommitteeTypes}
  ${committeeMembershipRequestsTypes}
  ${toggleCommitteeFavouriteTypes}
  ${cancelCommitteeMembershipRequestTypes}
  ${submitCommitteeMembershipRequestTypes}
  ${hierarchyTreeTypes}
  ${committeeDetailsTypes}
  ${loginTypes}
  ${newUserRegistrationTypes}
  ${accountTypes}
  ${userRelationalAnalyticsTypes}
  ${imageAssetUploadTypes}
  ${createEventTypes}
  ${eventDetailsTypes}
  ${eventsListTypes}
  ${updateEventVisibilityTypes}
  ${deleteEventTypes}

  type Query {
    ${guestCommitteeQueryFields}
    ${authCommitteeQueryFields}
    ${committeeMembershipRequestsQueryFields}
    ${accountQueryFields}
    ${userRelationalAnalyticsQueryFields}
    ${hierarchyTreeQueryFields}
    ${committeeDetailsQueryFields}
    ${eventDetailsQueryFields}
    ${eventsListQueryFields}
  }

  type Mutation {
    ${loginMutationFields}
    ${newUserRegistrationMutationFields}
    ${accountMutationFields}
    ${imageAssetUploadMutationFields}
    ${createCommitteeMutationFields}
    ${updateCommitteeMutationFields}
    ${createEventMutationFields}
    ${updateEventVisibilityMutationFields}
    ${deleteEventMutationFields}
    ${toggleCommitteeFavouriteMutationFields}
    ${cancelCommitteeMembershipRequestMutationFields}
    ${submitCommitteeMembershipRequestMutationFields}
    ${committeeMembershipRequestsMutationFields}
  }
`;

export const resolvers = {
  Query: {
    ...guestCommitteesResolvers.Query,
    ...authCommitteesResolvers.Query,
    ...committeeMembershipRequestsResolvers.Query,
    ...accountResolvers.Query,
    ...userRelationalAnalyticsResolvers.Query,
    ...hierarchyTreeResolvers.Query,
    ...committeeDetailsResolvers.Query,
    ...eventDetailsResolvers.Query,
    ...eventsListResolvers.Query
  },
  Mutation: {
    ...loginResolvers.Mutation,
    ...newUserRegistrationResolvers.Mutation,
    ...accountResolvers.Mutation,
    ...imageAssetUploadResolvers.Mutation,
    ...createCommitteeResolvers.Mutation,
    ...updateCommitteeResolvers.Mutation,
    ...createEventResolvers.Mutation,
    ...updateEventVisibilityResolvers.Mutation,
    ...deleteEventResolvers.Mutation,
    ...toggleCommitteeFavouriteResolvers.Mutation,
    ...cancelCommitteeMembershipRequestResolvers.Mutation,
    ...submitCommitteeMembershipRequestResolvers.Mutation,
    ...committeeMembershipRequestsResolvers.Mutation
  }
};
