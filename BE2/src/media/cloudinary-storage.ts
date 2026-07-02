import { v2 as cloudinary } from 'cloudinary';

const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY || '';
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET || '';
const cloudinaryFolderPrefix = (process.env.CLOUDINARY_FOLDER_PREFIX || 'samiti').replace(/^\/+|\/+$/g, '');

const isConfigured = Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);

if (isConfigured) {
  cloudinary.config({
    cloud_name: cloudinaryCloudName,
    api_key: cloudinaryApiKey,
    api_secret: cloudinaryApiSecret,
    secure: true
  });
}

export function isCloudinaryStorageEnabled(): boolean {
  return isConfigured;
}

export async function uploadImageBufferToCloudinary(params: {
  imageBuffer: Buffer;
  folderPath: string;
  publicIdSeed: string;
}): Promise<{ secureUrl: string; publicId: string; bytes: number; width: number; height: number }> {
  if (!isConfigured) {
    throw new Error('Cloudinary is not configured. Missing CLOUDINARY_* environment variables.');
  }

  const cleanedFolderPath = params.folderPath.replace(/^\/+|\/+$/g, '');
  const resolvedFolder = [cloudinaryFolderPrefix, cleanedFolderPath].filter(Boolean).join('/');

  const uploadResult = await new Promise<any>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder: resolvedFolder,
        public_id: params.publicIdSeed,
        overwrite: true,
        format: 'webp'
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Cloudinary upload failed.'));
          return;
        }
        resolve(result);
      }
    );

    uploadStream.end(params.imageBuffer);
  });

  return {
    secureUrl: String(uploadResult.secure_url || uploadResult.url || ''),
    publicId: String(uploadResult.public_id || ''),
    bytes: Number(uploadResult.bytes || 0),
    width: Number(uploadResult.width || 0),
    height: Number(uploadResult.height || 0)
  };
}

function extractCloudinaryPublicIdFromUrl(imageUrl: string): string | null {
  if (!isConfigured || !imageUrl) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return null;
  }

  const expectedHost = `res.cloudinary.com/${cloudinaryCloudName}/`;
  const normalizedUrl = `${parsedUrl.host}${parsedUrl.pathname}`;
  if (!normalizedUrl.includes(expectedHost) || !parsedUrl.pathname.includes('/image/upload/')) {
    return null;
  }

  const uploadPathPart = parsedUrl.pathname.split('/image/upload/')[1] || '';
  const cleanedUploadPath = uploadPathPart.replace(/^v\d+\//, '');
  const withoutExtension = cleanedUploadPath.replace(/\.[a-zA-Z0-9]+$/, '');
  return withoutExtension || null;
}

export async function deleteCloudinaryImageByUrl(imageUrl: string): Promise<void> {
  const publicId = extractCloudinaryPublicIdFromUrl(imageUrl);
  if (!publicId) {
    return;
  }

  const destroyResult = await cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true
  });

  if (destroyResult.result !== 'ok' && destroyResult.result !== 'not found') {
    throw new Error(`Cloudinary destroy failed for publicId: ${publicId}`);
  }
}
