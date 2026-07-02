import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { isCloudinaryStorageEnabled, uploadImageBufferToCloudinary } from './cloudinary-storage';

export type ImageAssetUsageContext =
  | 'USER_PROFILE_PHOTO'
  | 'COMMITTEE_LOGO'
  | 'EVENT_BANNER'
  | 'GENERAL_ASSET';

export type ImageResizeMode = 'COVER' | 'CONTAIN' | 'INSIDE';

export interface ProcessAndStoreImageAssetInput {
  dataUrl: string;
  usageContext: ImageAssetUsageContext;
  preferredResizeMode?: ImageResizeMode;
  compressionQuality?: number;
}

export interface StoredImageAssetMetadata {
  storageRelativePath: string;
  publicRelativeUrl: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
}

const MEDIA_STORAGE_ROOT_DIRECTORY = path.join(process.cwd(), 'uploads');
const MAX_DECODED_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_CONTEXT_CONSTRAINTS: Record<
  ImageAssetUsageContext,
  { maxWidth: number; maxHeight: number; defaultResizeMode: ImageResizeMode }
> = {
  USER_PROFILE_PHOTO: { maxWidth: 512, maxHeight: 512, defaultResizeMode: 'COVER' },
  COMMITTEE_LOGO: { maxWidth: 768, maxHeight: 768, defaultResizeMode: 'COVER' },
  EVENT_BANNER: { maxWidth: 1920, maxHeight: 1080, defaultResizeMode: 'INSIDE' },
  GENERAL_ASSET: { maxWidth: 1600, maxHeight: 1600, defaultResizeMode: 'INSIDE' }
};

function parseBase64DataUrl(dataUrl: string): { mimeType: string; base64Data: string } {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image payload. Expected a valid base64 data URL.');
  }

  return {
    mimeType: match[1],
    base64Data: match[2]
  };
}

function resolveSharpFitMode(resizeMode: ImageResizeMode): 'cover' | 'contain' | 'inside' {
  if (resizeMode === 'COVER') {
    return 'cover';
  }

  if (resizeMode === 'CONTAIN') {
    return 'contain';
  }

  return 'inside';
}

function sanitizeCompressionQuality(quality?: number): number {
  if (!quality || Number.isNaN(quality)) {
    return 72;
  }

  return Math.max(40, Math.min(85, Math.round(quality)));
}

export async function processAndStoreImageAsset(
  input: ProcessAndStoreImageAssetInput
): Promise<StoredImageAssetMetadata> {
  const { mimeType, base64Data } = parseBase64DataUrl(input.dataUrl);
  const decodedBuffer = Buffer.from(base64Data, 'base64');

  if (!decodedBuffer.length) {
    throw new Error('Image payload was empty after decoding.');
  }

  if (decodedBuffer.length > MAX_DECODED_IMAGE_BYTES) {
    throw new Error('Image is too large. Maximum supported size is 10MB.');
  }

  const contextConstraints = IMAGE_CONTEXT_CONSTRAINTS[input.usageContext];
  const resolvedResizeMode = input.preferredResizeMode || contextConstraints.defaultResizeMode;
  const quality = sanitizeCompressionQuality(input.compressionQuality);

  const imageTransformPipeline = sharp(decodedBuffer)
    .rotate()
    .resize({
      width: contextConstraints.maxWidth,
      height: contextConstraints.maxHeight,
      fit: resolveSharpFitMode(resolvedResizeMode),
      position: 'attention',
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .webp({ quality });

  const processedBuffer = await imageTransformPipeline.toBuffer();
  const imageMetadata = await sharp(processedBuffer).metadata();

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const contextDirectoryName = input.usageContext.toLowerCase();
  const generatedFileName = `${randomUUID()}.webp`;

  if (isCloudinaryStorageEnabled()) {
    const folderPath = `${contextDirectoryName}/${year}/${month}`;
    const uploadResult = await uploadImageBufferToCloudinary({
      imageBuffer: processedBuffer,
      folderPath,
      publicIdSeed: generatedFileName.replace('.webp', '')
    });

    return {
      storageRelativePath: uploadResult.publicId,
      publicRelativeUrl: uploadResult.secureUrl,
      mimeType: 'image/webp',
      width: uploadResult.width || Number(imageMetadata.width || 0),
      height: uploadResult.height || Number(imageMetadata.height || 0),
      byteSize: uploadResult.bytes || processedBuffer.byteLength
    };
  }

  const targetDirectory = path.join(MEDIA_STORAGE_ROOT_DIRECTORY, contextDirectoryName, year, month);

  await fs.mkdir(targetDirectory, { recursive: true });

  const absoluteFilePath = path.join(targetDirectory, generatedFileName);
  await fs.writeFile(absoluteFilePath, processedBuffer);

  const storageRelativePath = path
    .relative(MEDIA_STORAGE_ROOT_DIRECTORY, absoluteFilePath)
    .split(path.sep)
    .join('/');

  return {
    storageRelativePath,
    publicRelativeUrl: `/media/${storageRelativePath}`,
    mimeType: 'image/webp',
    width: Number(imageMetadata.width || 0),
    height: Number(imageMetadata.height || 0),
    byteSize: processedBuffer.byteLength
  };
}
