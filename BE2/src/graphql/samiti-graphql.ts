import { loginTypes, loginMutationFields, loginResolvers } from './auth/login.graphql';
import { newUserRegistrationTypes, newUserRegistrationMutationFields, newUserRegistrationResolvers } from './auth/new-user-registration.graphql';
import { accountTypes, accountQueryFields, accountMutationFields, accountResolvers } from './auth/account.graphql';
import { userRelationalAnalyticsTypes, userRelationalAnalyticsQueryFields, userRelationalAnalyticsResolvers } from './users/user-relational-analytics-by-id.graphql';
import { imageAssetUploadTypes, imageAssetUploadMutationFields, imageAssetUploadResolvers } from './users/image-asset-upload.graphql';
import { createCommitteeTypes, createCommitteeMutationFields, createCommitteeResolvers } from './committees/create-committee.graphql';
import { updateCommitteeTypes, updateCommitteeMutationFields, updateCommitteeResolvers } from './committees/update-committee.graphql';
import { guestCommitteeTypes, guestCommitteeQueryFields, guestCommitteesResolvers } from './committees/guest-user-committees-list.graphql';
import { authCommitteeTypes, authCommitteeQueryFields, authCommitteesResolvers } from './committees/auth-user-committees-list.graphql';
import { committeeMembershipRequestsTypes, committeeMembershipRequestsQueryFields, committeeMembershipRequestsMutationFields, committeeMembershipRequestsResolvers } from './committees/committee-membership-requests.graphql';
import { toggleCommitteeFavouriteTypes, toggleCommitteeFavouriteMutationFields, toggleCommitteeFavouriteResolvers } from './committees/toggle-committee-favourite.graphql';
import { cancelCommitteeMembershipRequestTypes, cancelCommitteeMembershipRequestMutationFields, cancelCommitteeMembershipRequestResolvers } from './committees/cancel-committee-membership-request.graphql';
import { submitCommitteeMembershipRequestTypes, submitCommitteeMembershipRequestMutationFields, submitCommitteeMembershipRequestResolvers } from './committees/submit-committee-membership-request.graphql';
import { hierarchyTreeTypes, hierarchyTreeQueryFields, hierarchyTreeResolvers } from './committees/hierarchy-tree.graphql';
import { committeeDetailsTypes, committeeDetailsQueryFields, committeeDetailsResolvers } from './committees/committee-details-by-id.graphql';
import { createEventTypes, createEventMutationFields, createEventResolvers } from './events/create-event.graphql';
import { eventDetailsTypes, eventDetailsQueryFields, eventDetailsResolvers } from './events/event-details-by-id.graphql';

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

  type Query {
    ${guestCommitteeQueryFields}
    ${authCommitteeQueryFields}
    ${committeeMembershipRequestsQueryFields}
    ${accountQueryFields}
    ${userRelationalAnalyticsQueryFields}
    ${hierarchyTreeQueryFields}
    ${committeeDetailsQueryFields}
    ${eventDetailsQueryFields}
  }

  type Mutation {
    ${loginMutationFields}
    ${newUserRegistrationMutationFields}
    ${accountMutationFields}
    ${imageAssetUploadMutationFields}
    ${createCommitteeMutationFields}
    ${updateCommitteeMutationFields}
    ${createEventMutationFields}
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
    ...eventDetailsResolvers.Query
  },
  Mutation: {
    ...loginResolvers.Mutation,
    ...newUserRegistrationResolvers.Mutation,
    ...accountResolvers.Mutation,
    ...imageAssetUploadResolvers.Mutation,
    ...createCommitteeResolvers.Mutation,
    ...updateCommitteeResolvers.Mutation,
    ...createEventResolvers.Mutation,
    ...toggleCommitteeFavouriteResolvers.Mutation,
    ...cancelCommitteeMembershipRequestResolvers.Mutation,
    ...submitCommitteeMembershipRequestResolvers.Mutation,
    ...committeeMembershipRequestsResolvers.Mutation
  }
};
