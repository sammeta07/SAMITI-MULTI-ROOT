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
import { updateEventTypes, updateEventMutationFields, updateEventResolvers } from './events/update-event.graphql';
import { eventDetailsTypes, eventDetailsQueryFields, eventDetailsMutationFields, eventDetailsResolvers } from './events/event-details-by-id.graphql';
import { updateEventVisibilityTypes, updateEventVisibilityMutationFields, updateEventVisibilityResolvers } from './events/update-event-visibility.graphql';
import { uploadEventBannerImagesTypes, uploadEventBannerImagesMutationFields, uploadEventBannerImagesResolvers } from './events/upload-event-banner-images.graphql';
import { deleteEventTypes, deleteEventMutationFields, deleteEventResolvers } from './events/delete-event.graphql';
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
  ${updateEventTypes}
  ${createProgramTypes}
  ${updateProgramTypes}
  ${uploadProgramBannerImagesTypes}
  ${programDetailsTypes}
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
  }

  type Mutation {
    ${loginMutationFields}
    ${newUserRegistrationMutationFields}
    ${accountMutationFields}
    ${imageAssetUploadMutationFields}
    ${createCommitteeMutationFields}
    ${updateCommitteeMutationFields}
    ${createEventMutationFields}
    ${updateEventMutationFields}
    ${createProgramMutationFields}
    ${updateProgramMutationFields}
    ${uploadProgramBannerImagesMutationFields}
    ${updateEventVisibilityMutationFields}
    ${uploadEventBannerImagesMutationFields}
    ${deleteEventMutationFields}
    ${toggleCommitteeFavouriteMutationFields}
    ${cancelCommitteeMembershipRequestMutationFields}
    ${submitCommitteeMembershipRequestMutationFields}
    ${committeeMembershipRequestsMutationFields}
    ${eventDetailsMutationFields}
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
    
  },
  Mutation: {
    ...loginResolvers.Mutation,
    ...newUserRegistrationResolvers.Mutation,
    ...accountResolvers.Mutation,
    ...imageAssetUploadResolvers.Mutation,
    ...createCommitteeResolvers.Mutation,
    ...updateCommitteeResolvers.Mutation,
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
    ...eventDetailsResolvers.Mutation
  }
};
