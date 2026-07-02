import { promises as fs } from 'fs';
import path from 'path';
import { deleteCloudinaryImageByUrl, isCloudinaryStorageEnabled } from './cloudinary-storage';

const MEDIA_STORAGE_ROOT_DIRECTORY = path.join(process.cwd(), 'uploads');

function resolveRelativeMediaPathFromUrl(imageUrl: string): string | null {
  if (!imageUrl) {
    return null;
  }

  let pathname = imageUrl;

  try {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const parsedUrl = new URL(imageUrl);
      pathname = parsedUrl.pathname;
    }
  } catch {
    pathname = imageUrl;
  }

  if (!pathname.startsWith('/media/')) {
    return null;
  }

  return pathname.replace('/media/', '').replace(/\\/g, '/');
}

export async function deleteLocalMediaFileIfExists(imageUrl: string): Promise<void> {
  if (isCloudinaryStorageEnabled()) {
    await deleteCloudinaryImageByUrl(imageUrl);
    return;
  }

  const relativePath = resolveRelativeMediaPathFromUrl(imageUrl);
  if (!relativePath) {
    return;
  }

  const absoluteFilePath = path.resolve(MEDIA_STORAGE_ROOT_DIRECTORY, relativePath);
  const absoluteMediaRoot = path.resolve(MEDIA_STORAGE_ROOT_DIRECTORY);

  if (!absoluteFilePath.startsWith(absoluteMediaRoot)) {
    return;
  }

  try {
    await fs.unlink(absoluteFilePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}
