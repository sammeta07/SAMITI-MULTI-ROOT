import { execute } from '../../config/db';

export const toggleCommitteeFavouriteTypes = `
  type ToggleCommitteeFavouritePayload {
    committeeId: Int!
    isFavourite: Int!
  }
`;

export const toggleCommitteeFavouriteMutationFields = `
  toggleCommitteeFavourite(committeeId: Int!, isFavourite: Int!): ToggleCommitteeFavouritePayload!
`;

export const toggleCommitteeFavouriteResolvers = {
  Mutation: {
    async toggleCommitteeFavourite(_: any, args: { committeeId: number; isFavourite: number }, context: any) {
      const { committeeId, isFavourite } = args;

      const authHeader = context.headers?.authorization;
      const tokenFromCookie = context.cookies?.token;
      let accessToken: string | null = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      } else if (tokenFromCookie) {
        accessToken = tokenFromCookie;
      }

      if (!accessToken) {
        throw new Error('Unauthorized: Missing access token');
      }

      const decoded: any = await context.jwt.verify(accessToken);
      const loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);
      if (!loggedInUserId) {
        throw new Error('Unauthorized: Invalid token');
      }

      const normalizedFavourite = isFavourite === 1 ? 1 : 0;

      await execute(
        `
          INSERT INTO users_committees (
            committee_id,
            user_id,
            is_committee_admin,
            is_committee_member,
            membership_status,
            membership_status_action_by,
            membership_status_action_at,
            admin_status,
            admin_status_action_by,
            admin_status_action_at,
            is_favourite
          )
          VALUES (?, ?, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, ?)
          ON DUPLICATE KEY UPDATE
            is_favourite = VALUES(is_favourite)
        `,
        [committeeId, loggedInUserId, normalizedFavourite]
      );

      return {
        committeeId,
        isFavourite: normalizedFavourite
      };
    }
  }
};
