import { loginTypes, loginMutationFields, loginResolvers } from './auth/login.graphql';
import { newUserRegistrationTypes, newUserRegistrationMutationFields, newUserRegistrationResolvers } from './auth/new-user-registration.graphql';
import { accountTypes, accountQueryFields, accountMutationFields, accountResolvers } from './auth/account.graphql';
import { userRelationalAnalyticsTypes, userRelationalAnalyticsQueryFields, userRelationalAnalyticsResolvers } from './users/user-relational-analytics-by-id.graphql';
import { imageAssetUploadTypes, imageAssetUploadMutationFields, imageAssetUploadResolvers } from './users/image-asset-upload.graphql';
import { createCommitteeTypes, createCommitteeMutationFields, createCommitteeResolvers } from './committees/creation/create-committee.graphql';
import { updateCommitteeTypes, updateCommitteeMutationFields, updateCommitteeResolvers } from './committees/profile/update-committee.graphql';
import { updateCommitteeLogoTypes, updateCommitteeLogoMutationFields, updateCommitteeLogoResolvers } from './committees/profile/update-committee-logo.graphql';
import { committeeMembershipRequestsTypes, committeeMembershipRequestsQueryFields, committeeMembershipRequestsMutationFields, committeeMembershipRequestsResolvers } from './committees/membership/committee-membership-requests.graphql';
import { promoteCommitteeMemberTypes, promoteCommitteeMemberMutationFields, promoteCommitteeMemberResolvers } from './committees/members/promote-committee-member.graphql';
import { demoteCommitteeAdminTypes, demoteCommitteeAdminMutationFields, demoteCommitteeAdminResolvers } from './committees/members/demote-committee-admin.graphql';
import { removeCommitteeMemberTypes, removeCommitteeMemberMutationFields, removeCommitteeMemberResolvers } from './committees/members/remove-committee-member.graphql';
import { toggleCommitteeFavouriteTypes, toggleCommitteeFavouriteMutationFields, toggleCommitteeFavouriteResolvers } from './committees/favourite/toggle-committee-favourite.graphql';
import { hierarchyTreeTypes, hierarchyTreeQueryFields, hierarchyTreeResolvers } from './committees/hierarchy/hierarchy-tree.graphql';
import { committeeDetailsTypes, committeeDetailsQueryFields, committeeDetailsResolvers } from './committees/profile/committee-details-by-id.graphql';
import { createEventTypes, createEventMutationFields, createEventResolvers } from './events/creation/create-event.graphql';
import { updateEventTypes, updateEventMutationFields, updateEventResolvers } from './events/management/update-event.graphql';
import { eventDetailsTypes, eventDetailsQueryFields, eventDetailsResolvers } from './events/details/event-details-by-id.graphql';
import { updateEventVisibilityTypes, updateEventVisibilityMutationFields, updateEventVisibilityResolvers } from './events/management/update-event-visibility.graphql';
import { uploadEventBannerImagesTypes, uploadEventBannerImagesMutationFields, uploadEventBannerImagesResolvers } from './events/media/upload-event-banner-images.graphql';
import { deleteEventTypes, deleteEventMutationFields, deleteEventResolvers } from './events/management/delete-event.graphql';
import { eventVotingTypes, eventVotingMutationFields, eventVotingResolvers } from './events/voting/event-voting.graphql';
import { eventVoteTypes, eventVoteQueryFields, eventVoteMutationFields, eventVoteResolvers } from './events/voting/event-vote.graphql';
import { eventInterestTypes, eventInterestQueryFields, eventInterestMutationFields, eventInterestResolvers } from './events/interest/event-interest.graphql';
import { createProgramTypes, createProgramMutationFields, createProgramResolvers } from './programs/create-program.graphql';
import { updateProgramTypes, updateProgramMutationFields, updateProgramResolvers } from './programs/update-program.graphql';
import { uploadProgramBannerImagesTypes, uploadProgramBannerImagesMutationFields, uploadProgramBannerImagesResolvers } from './programs/upload-program-banner-images.graphql';
import { programDetailsTypes, programDetailsQueryFields, programDetailsResolvers } from './programs/program-details-by-id.graphql';
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
  ${updateCommitteeLogoTypes}
  ${committeeMembershipRequestsTypes}
  ${promoteCommitteeMemberTypes}
  ${demoteCommitteeAdminTypes}
  ${removeCommitteeMemberTypes}
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
  ${updateEventTypes}
  ${createProgramTypes}
  ${updateProgramTypes}
  ${uploadProgramBannerImagesTypes}
  ${programDetailsTypes}
  ${eventVotingTypes}
  ${eventVoteTypes}
  ${eventInterestTypes}
  ${eventDetailsTypes}
  ${updateEventVisibilityTypes}
  ${uploadEventBannerImagesTypes}
  ${deleteEventTypes}

  type Query {
    ${guestCommitteeQueryFields}
    ${authCommitteeQueryFields}
    ${committeeMembershipRequestsQueryFields}
    ${accountQueryFields}
    ${userRelationalAnalyticsQueryFields}
    ${hierarchyTreeQueryFields}
    ${committeeDetailsQueryFields}
    ${programDetailsQueryFields}
    ${eventDetailsQueryFields}
    ${eventInterestQueryFields}
    ${eventVoteQueryFields}
  }

  type Mutation {
    ${loginMutationFields}
    ${newUserRegistrationMutationFields}
    ${accountMutationFields}
    ${imageAssetUploadMutationFields}
    ${createCommitteeMutationFields}
    ${updateCommitteeMutationFields}
    ${updateCommitteeLogoMutationFields}
    ${createEventMutationFields}
    ${updateEventMutationFields}
    ${createProgramMutationFields}
    ${updateProgramMutationFields}
    ${uploadProgramBannerImagesMutationFields}
    ${updateEventVisibilityMutationFields}
    ${uploadEventBannerImagesMutationFields}
    ${deleteEventMutationFields}
    ${eventVotingMutationFields}
    ${eventInterestMutationFields}
    ${eventVoteMutationFields}
    ${toggleCommitteeFavouriteMutationFields}
    ${cancelCommitteeMembershipRequestMutationFields}
    ${submitCommitteeMembershipRequestMutationFields}
    ${committeeMembershipRequestsMutationFields}
    ${promoteCommitteeMemberMutationFields}
    ${demoteCommitteeAdminMutationFields}
    ${removeCommitteeMemberMutationFields}
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
    ...programDetailsResolvers.Query,
    ...eventDetailsResolvers.Query,
    ...eventInterestResolvers.Query,
    ...eventVoteResolvers.Query,
  },
  Mutation: {
    ...loginResolvers.Mutation,
    ...newUserRegistrationResolvers.Mutation,
    ...accountResolvers.Mutation,
    ...imageAssetUploadResolvers.Mutation,
    ...createCommitteeResolvers.Mutation,
    ...updateCommitteeResolvers.Mutation,
    ...updateCommitteeLogoResolvers.Mutation,
    ...createEventResolvers.Mutation,
    ...updateEventResolvers.Mutation,
    ...createProgramResolvers.Mutation,
    ...updateProgramResolvers.Mutation,
    ...uploadProgramBannerImagesResolvers.Mutation,
    ...updateEventVisibilityResolvers.Mutation,
    ...uploadEventBannerImagesResolvers.Mutation,
    ...deleteEventResolvers.Mutation,
    ...toggleCommitteeFavouriteResolvers.Mutation,
    ...cancelCommitteeMembershipRequestResolvers.Mutation,
    ...submitCommitteeMembershipRequestResolvers.Mutation,
    ...committeeMembershipRequestsResolvers.Mutation,
    ...promoteCommitteeMemberResolvers.Mutation,
    ...demoteCommitteeAdminResolvers.Mutation,
    ...removeCommitteeMemberResolvers.Mutation,
    ...eventVotingResolvers.Mutation,
    ...eventInterestResolvers.Mutation,
    ...eventVoteResolvers.Mutation
  }
};
