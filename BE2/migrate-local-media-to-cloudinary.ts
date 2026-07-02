import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2/promise';
import { query, execute, closePool } from './src/config/db';
import { isCloudinaryStorageEnabled, uploadImageBufferToCloudinary } from './src/media/cloudinary-storage';

type UserMediaRow = RowDataPacket & {
  id: number;
  profile_photo: string | null;
};

type CommitteeMediaRow = RowDataPacket & {
  id: number;
  logo: string | null;
};

type EventMediaRow = RowDataPacket & {
  id: number;
  media_url: string;
};

const mediaRootDirectory = path.join(process.cwd(), 'uploads');

function resolveRelativeMediaPathFromUrl(imageUrl: string): string | null {
  if (!imageUrl) {
    return null;
  }

  let pathname = imageUrl;

  try {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      pathname = new URL(imageUrl).pathname;
    }
  } catch {
    pathname = imageUrl;
  }

  if (!pathname.startsWith('/media/')) {
    return null;
  }

  return pathname.replace('/media/', '').replace(/\\/g, '/');
}

function guessCloudFolderFromRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  const directoryPath = path.posix.dirname(normalized);
  const contextAwareDirectory = directoryPath === '.' ? 'general_asset/migrated' : `${directoryPath}/migrated`;
  return contextAwareDirectory;
}

async function uploadLocalMediaUrlToCloudinary(imageUrl: string): Promise<string | null> {
  const relativePath = resolveRelativeMediaPathFromUrl(imageUrl);
  if (!relativePath) {
    return null;
  }

  const absoluteFilePath = path.resolve(mediaRootDirectory, relativePath);
  const absoluteMediaRoot = path.resolve(mediaRootDirectory);

  if (!absoluteFilePath.startsWith(absoluteMediaRoot)) {
    return null;
  }

  try {
    const fileBuffer = await fs.readFile(absoluteFilePath);
    if (!fileBuffer.byteLength) {
      return null;
    }

    const uploadResult = await uploadImageBufferToCloudinary({
      imageBuffer: fileBuffer,
      folderPath: guessCloudFolderFromRelativePath(relativePath),
      publicIdSeed: randomUUID()
    });

    return uploadResult.secureUrl;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function migrateUsersProfilePhotos(urlCache: Map<string, string>): Promise<{ scanned: number; migrated: number }> {
  const rows = await query<UserMediaRow[]>(
    "SELECT id, profile_photo FROM users WHERE profile_photo IS NOT NULL AND profile_photo != ''"
  );

  let migratedCount = 0;

  for (const row of rows) {
    const currentUrl = String(row.profile_photo || '').trim();
    const localRelativePath = resolveRelativeMediaPathFromUrl(currentUrl);
    if (!localRelativePath) {
      continue;
    }

    const cached = urlCache.get(currentUrl);
    const migratedUrl = cached || (await uploadLocalMediaUrlToCloudinary(currentUrl));
    if (!migratedUrl) {
      continue;
    }

    if (!cached) {
      urlCache.set(currentUrl, migratedUrl);
    }

    await execute('UPDATE users SET profile_photo = ? WHERE id = ?', [migratedUrl, row.id]);
    migratedCount += 1;
  }

  return {
    scanned: rows.length,
    migrated: migratedCount
  };
}

async function migrateCommitteesLogo(urlCache: Map<string, string>): Promise<{ scanned: number; migrated: number }> {
  const rows = await query<CommitteeMediaRow[]>(
    "SELECT id, logo FROM committees WHERE logo IS NOT NULL AND logo != ''"
  );

  let migratedCount = 0;

  for (const row of rows) {
    const currentUrl = String(row.logo || '').trim();
    const localRelativePath = resolveRelativeMediaPathFromUrl(currentUrl);
    if (!localRelativePath) {
      continue;
    }

    const cached = urlCache.get(currentUrl);
    const migratedUrl = cached || (await uploadLocalMediaUrlToCloudinary(currentUrl));
    if (!migratedUrl) {
      continue;
    }

    if (!cached) {
      urlCache.set(currentUrl, migratedUrl);
    }

    await execute('UPDATE committees SET logo = ? WHERE id = ?', [migratedUrl, row.id]);
    migratedCount += 1;
  }

  return {
    scanned: rows.length,
    migrated: migratedCount
  };
}

async function migrateEventMediaAssets(urlCache: Map<string, string>): Promise<{ scanned: number; migrated: number }> {
  const rows = await query<EventMediaRow[]>(
    "SELECT id, media_url FROM event_media_assets WHERE media_url IS NOT NULL AND media_url != ''"
  );

  let migratedCount = 0;

  for (const row of rows) {
    const currentUrl = String(row.media_url || '').trim();
    const localRelativePath = resolveRelativeMediaPathFromUrl(currentUrl);
    if (!localRelativePath) {
      continue;
    }

    const cached = urlCache.get(currentUrl);
    const migratedUrl = cached || (await uploadLocalMediaUrlToCloudinary(currentUrl));
    if (!migratedUrl) {
      continue;
    }

    if (!cached) {
      urlCache.set(currentUrl, migratedUrl);
    }

    await execute('UPDATE event_media_assets SET media_url = ? WHERE id = ?', [migratedUrl, row.id]);
    migratedCount += 1;
  }

  return {
    scanned: rows.length,
    migrated: migratedCount
  };
}

async function run(): Promise<void> {
  if (!isCloudinaryStorageEnabled()) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET first.'
    );
  }

  const urlCache = new Map<string, string>();

  console.log('Starting local media URL migration to Cloudinary...');

  const usersResult = await migrateUsersProfilePhotos(urlCache);
  const committeesResult = await migrateCommitteesLogo(urlCache);
  const eventsResult = await migrateEventMediaAssets(urlCache);

  console.log('Migration finished.');
  console.log(`Users scanned: ${usersResult.scanned}, migrated: ${usersResult.migrated}`);
  console.log(`Committees scanned: ${committeesResult.scanned}, migrated: ${committeesResult.migrated}`);
  console.log(`Event media scanned: ${eventsResult.scanned}, migrated: ${eventsResult.migrated}`);
  console.log(`Unique source URLs uploaded: ${urlCache.size}`);
}

run()
  .catch((error: any) => {
    console.error('Media migration failed:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
