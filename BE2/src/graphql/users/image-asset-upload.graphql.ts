import { processAndStoreImageAsset, ImageAssetUsageContext, ImageResizeMode } from '../../media/image-processing';
import { hasPermission, PERMISSIONS } from '../../authorization/authorization';

const GRAPHQL_IMAGE_USAGE_CONTEXT_TO_STORAGE_CONTEXT: Record<string, ImageAssetUsageContext> = {
  USER_PROFILE_PHOTO: 'USER_PROFILE_PHOTO',
  COMMITTEE_LOGO: 'COMMITTEE_LOGO',
  EVENT_BANNER: 'EVENT_BANNER',
  GENERAL_ASSET: 'GENERAL_ASSET'
};

const GRAPHQL_IMAGE_RESIZE_MODE_TO_STORAGE_MODE: Record<string, ImageResizeMode> = {
  COVER: 'COVER',
  CONTAIN: 'CONTAIN',
  INSIDE: 'INSIDE'
};

function resolvePublicMediaUrl(context: any, relativeUrl: string): string {
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }

  const request = context.request;
  const forwardedProto = request?.headers?.['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' && forwardedProto.length > 0
    ? forwardedProto.split(',')[0].trim()
    : (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = request?.headers?.host || 'localhost:3000';

  return `${protocol}://${host}${relativeUrl}`;
}

export const imageAssetUploadTypes = `
  enum ImageAssetUsageContextType {
    USER_PROFILE_PHOTO
    COMMITTEE_LOGO
    EVENT_BANNER
    GENERAL_ASSET
  }

  enum ImageResizeModeType {
    COVER
    CONTAIN
    INSIDE
  }

  input ImageAssetUploadItemInput {
    dataUrl: String!
    preferredResizeMode: ImageResizeModeType
    compressionQuality: Int
    publicId: String
  }

  input ImageAssetBatchUploadInput {
    usageContext: ImageAssetUsageContextType!
    files: [ImageAssetUploadItemInput!]!
    publicId: String
  }

  type UploadedImageAssetMetadata {
    storageRelativePath: String!
    publicRelativeUrl: String!
    publicAbsoluteUrl: String!
    width: Int!
    height: Int!
    byteSize: Int!
  }

  type ImageAssetBatchUploadPayload {
    data: [UploadedImageAssetMetadata!]!
  }
`;

export const imageAssetUploadMutationFields = `
  uploadImageAssetBatch(input: ImageAssetBatchUploadInput!): ImageAssetBatchUploadPayload!
`;

export const imageAssetUploadResolvers = {
  Mutation: {
    async uploadImageAssetBatch(
      _: unknown,
      args: {
        input: {
          usageContext: keyof typeof GRAPHQL_IMAGE_USAGE_CONTEXT_TO_STORAGE_CONTEXT;
          files: Array<{
            dataUrl: string;
            preferredResizeMode?: keyof typeof GRAPHQL_IMAGE_RESIZE_MODE_TO_STORAGE_MODE;
            compressionQuality?: number;
            publicId?: string;
          }>;
          publicId?: string;
        };
      },
      context: any
    ) {
      const { usageContext, files, publicId } = args.input;

      if (!Array.isArray(files) || files.length === 0) {
        throw new Error('At least one image must be provided for upload.');
      }

      if (usageContext !== 'EVENT_BANNER' && files.length > 1) {
        throw new Error('This context accepts only one image at a time.');
      }

      const resolvedUsageContext = GRAPHQL_IMAGE_USAGE_CONTEXT_TO_STORAGE_CONTEXT[usageContext];
      if (!resolvedUsageContext) {
        throw new Error('Invalid image usage context.');
      }

      const requestedPublicIds = files.map((fileItem) => fileItem.publicId || publicId);
      for (const requestedPublicId of requestedPublicIds) {
        const committeeLogoMatch = usageContext === 'COMMITTEE_LOGO'
          ? requestedPublicId?.match(/^committee-logo-(\d+)$/)
          : null;
        if (!committeeLogoMatch) {
          continue;
        }

        const authHeader = context.headers?.authorization;
        const tokenFromCookie = context.cookies?.token;
        const accessToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : typeof tokenFromCookie === 'string'
            ? tokenFromCookie.trim()
            : '';
        if (!accessToken) {
          throw new Error('Unauthorized: Missing access token');
        }

        let loggedInUserId: number;
        try {
          const decoded: any = await context.jwt.verify(accessToken);
          loggedInUserId = Number(decoded?.id || decoded?.user_id || decoded?.uid);
        } catch {
          throw new Error('Unauthorized: Invalid or expired token');
        }
        if (!Number.isInteger(loggedInUserId) || loggedInUserId <= 0) {
          throw new Error('Unauthorized: Invalid token');
        }

        const committeeId = Number(committeeLogoMatch[1]);
        if (!await hasPermission(
          loggedInUserId,
          PERMISSIONS.COMMITTEE_LOGO_UPDATE,
          { type: 'COMMITTEE', id: committeeId }
        )) {
          throw new Error('Only committee admins can update the committee logo');
        }
      }

      const uploadedMetadata = await Promise.all(
        files.map(async (fileItem) => {
          const resizedImageMetadata = await processAndStoreImageAsset({
            dataUrl: fileItem.dataUrl,
            usageContext: resolvedUsageContext,
            preferredResizeMode: fileItem.preferredResizeMode
              ? GRAPHQL_IMAGE_RESIZE_MODE_TO_STORAGE_MODE[fileItem.preferredResizeMode]
              : undefined,
            compressionQuality: fileItem.compressionQuality,
            publicId: fileItem.publicId || publicId
          });

          return {
            storageRelativePath: resizedImageMetadata.storageRelativePath,
            publicRelativeUrl: resizedImageMetadata.publicRelativeUrl,
            publicAbsoluteUrl: resolvePublicMediaUrl(context, resizedImageMetadata.publicRelativeUrl),
            width: resizedImageMetadata.width,
            height: resizedImageMetadata.height,
            byteSize: resizedImageMetadata.byteSize
          };
        })
      );

      return {
        data: uploadedMetadata
      };
    }
  }
};
