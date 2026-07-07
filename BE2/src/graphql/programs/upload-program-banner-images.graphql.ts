import { query, execute } from '../../config/db';

const MAX_BANNER_IMAGES = 5;

function throwError(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function getAccessToken(context: any): string {
  const authHeader = context.headers?.authorization;
  const tokenFromCookie = context.cookies?.token;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  if (typeof tokenFromCookie === 'string' && tokenFromCookie.trim().length > 0) {
    return tokenFromCookie.trim();
  }
  return '';
}

async function getLoggedInUserId(context: any): Promise<number> {
  const accessToken = getAccessToken(context);
  if (!accessToken) throwError('UNAUTHORIZED', 'Missing access token');

  try {
    const decoded: any = await context.jwt.verify(accessToken);
    const userId = Number(decoded?.id || decoded?.user_id || decoded?.uid);
    if (!Number.isInteger(userId) || userId <= 0) throwError('UNAUTHORIZED', 'Invalid token payload');
    return userId;
  } catch {
    throwError('UNAUTHORIZED', 'Invalid or expired token');
  }
}

export const uploadProgramBannerImagesTypes = `
  type UploadProgramBannerImagesPayload {
    programId: Int!
    bannerImages: [String!]!
  }
`;

export const uploadProgramBannerImagesMutationFields = `
  uploadProgramBannerImages(programId: Int!, bannerImageUrls: [String!]!): UploadProgramBannerImagesPayload!
  deleteProgramBannerImage(programId: Int!, mediaUrl: String!): UploadProgramBannerImagesPayload!
`;

export const uploadProgramBannerImagesResolvers = {
  Mutation: {
    async uploadProgramBannerImages(_: any, args: { programId: number; bannerImageUrls: string[] }, context: any) {
      const programId = Number(args?.programId);
      if (!Number.isInteger(programId) || programId <= 0) {
        throwError('BAD_REQUEST', 'programId must be a positive integer');
      }

      const incomingUrls: string[] = Array.isArray(args?.bannerImageUrls)
        ? args.bannerImageUrls.filter((u) => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
        : [];

      if (incomingUrls.length === 0) {
        throwError('BAD_REQUEST', 'At least one banner image URL is required');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const programRows = await query<any[]>(
        `SELECT p.id, p.event_id AS eventId, e.committee_id AS committeeId
         FROM programs p
         LEFT JOIN events e ON e.id = p.event_id
         WHERE p.id = ?
         LIMIT 1`,
        [programId]
      );

      if (programRows.length === 0) {
        throwError('NOT_FOUND', 'Program not found');
      }

      const committeeId = Number(programRows[0].committeeId);
      const adminRows = await query<any[]>(
        `SELECT user_id FROM users_committees
         WHERE committee_id = ? AND user_id = ? AND is_committee_admin = 1 LIMIT 1`,
        [committeeId, loggedInUserId]
      );

      if (adminRows.length === 0) {
        throwError('FORBIDDEN', 'Only committee admins can upload program banners');
      }

      const existingRows = await query<any[]>(
        `SELECT id FROM program_media_assets WHERE program_id = ? ORDER BY sort_order ASC, id ASC`,
        [programId]
      );

      const existingCount = existingRows.length;
      if (existingCount >= MAX_BANNER_IMAGES) {
        throwError('BAD_REQUEST', `Maximum ${MAX_BANNER_IMAGES} banner images allowed. Delete existing banners to upload new ones.`);
      }

      const slotsAvailable = MAX_BANNER_IMAGES - existingCount;
      const urlsToInsert = incomingUrls.slice(0, slotsAvailable);

      for (let i = 0; i < urlsToInsert.length; i += 1) {
        await execute(
          `INSERT INTO program_media_assets (program_id, media_url, media_type, sort_order, created_by, created_at)
           VALUES (?, ?, 'BANNER', ?, ?, NOW())`,
          [programId, urlsToInsert[i], existingCount + i + 1, loggedInUserId]
        );
      }

      const updatedBannerRows = await query<any[]>(
        `SELECT media_url AS mediaUrl FROM program_media_assets
         WHERE program_id = ? ORDER BY sort_order ASC, id ASC`,
        [programId]
      );

      return {
        programId,
        bannerImages: updatedBannerRows.map((r) => String(r.mediaUrl))
      };
    },

    async deleteProgramBannerImage(_: any, args: { programId: number; mediaUrl: string }, context: any) {
      const programId = Number(args?.programId);
      if (!Number.isInteger(programId) || programId <= 0) {
        throwError('BAD_REQUEST', 'programId must be a positive integer');
      }

      const mediaUrl = typeof args?.mediaUrl === 'string' ? args.mediaUrl.trim() : '';
      if (!mediaUrl) {
        throwError('BAD_REQUEST', 'mediaUrl is required');
      }

      const loggedInUserId = await getLoggedInUserId(context);

      const programRows = await query<any[]>(
        `SELECT p.id, e.committee_id AS committeeId
         FROM programs p
         LEFT JOIN events e ON e.id = p.event_id
         WHERE p.id = ?
         LIMIT 1`,
        [programId]
      );

      if (programRows.length === 0) {
        throwError('NOT_FOUND', 'Program not found');
      }

      const committeeId = Number(programRows[0].committeeId);
      const adminRows = await query<any[]>(
        `SELECT user_id FROM users_committees
         WHERE committee_id = ? AND user_id = ? AND is_committee_admin = 1 LIMIT 1`,
        [committeeId, loggedInUserId]
      );

      if (adminRows.length === 0) {
        throwError('FORBIDDEN', 'Only committee admins can delete program banners');
      }

      await execute(
        `DELETE FROM program_media_assets WHERE program_id = ? AND media_url = ?`,
        [programId, mediaUrl]
      );

      const updatedBannerRows = await query<any[]>(
        `SELECT media_url AS mediaUrl FROM program_media_assets
         WHERE program_id = ? ORDER BY sort_order ASC, id ASC`,
        [programId]
      );

      return {
        programId,
        bannerImages: updatedBannerRows.map((r) => String(r.mediaUrl))
      };
    }
  }
};
