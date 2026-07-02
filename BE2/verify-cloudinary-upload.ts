import 'dotenv/config';
import sharp from 'sharp';
import { processAndStoreImageAsset } from './src/media/image-processing';
import { deleteCloudinaryImageByUrl, isCloudinaryStorageEnabled } from './src/media/cloudinary-storage';

async function run(): Promise<void> {
  if (!isCloudinaryStorageEnabled()) {
    throw new Error(
      'Cloudinary env vars are missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.'
    );
  }

  const tinyPngBuffer = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 12, g: 132, b: 255, alpha: 1 }
    }
  })
    .png()
    .toBuffer();

  const tinyPngDataUrl = `data:image/png;base64,${tinyPngBuffer.toString('base64')}`;

  const uploaded = await processAndStoreImageAsset({
    dataUrl: tinyPngDataUrl,
    usageContext: 'GENERAL_ASSET',
    preferredResizeMode: 'INSIDE',
    compressionQuality: 72
  });

  if (!uploaded.publicRelativeUrl.startsWith('https://')) {
    throw new Error(`Expected cloud URL but got: ${uploaded.publicRelativeUrl}`);
  }

  console.log('Cloudinary upload verification passed.');
  console.log(`Uploaded URL: ${uploaded.publicRelativeUrl}`);

  await deleteCloudinaryImageByUrl(uploaded.publicRelativeUrl);
  console.log('Cleanup passed: uploaded verification asset deleted.');
}

run().catch((error: any) => {
  console.error('Cloudinary upload verification failed:', error?.message || error);
  process.exit(1);
});
