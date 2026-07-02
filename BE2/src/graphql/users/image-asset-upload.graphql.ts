import { processAndStoreImageAsset, ImageAssetUsageContext, ImageResizeMode } from '../../media/image-processing';

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
  }

  input ImageAssetBatchUploadInput {
    usageContext: ImageAssetUsageContextType!
    files: [ImageAssetUploadItemInput!]!
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
    statusCode: Int!
    status: String!
    message: String!
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
          }>;
        };
      },
      context: any
    ) {
      const { usageContext, files } = args.input;

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

      const uploadedMetadata = await Promise.all(
        files.map(async (fileItem) => {
          const resizedImageMetadata = await processAndStoreImageAsset({
            dataUrl: fileItem.dataUrl,
            usageContext: resolvedUsageContext,
            preferredResizeMode: fileItem.preferredResizeMode
              ? GRAPHQL_IMAGE_RESIZE_MODE_TO_STORAGE_MODE[fileItem.preferredResizeMode]
              : undefined,
            compressionQuality: fileItem.compressionQuality
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
        statusCode: 200,
        status: 'success',
        message: 'Image assets uploaded and optimized successfully.',
        data: uploadedMetadata
      };
    }
  }
};
