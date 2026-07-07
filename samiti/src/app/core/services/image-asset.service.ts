import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type ImageAssetUsageContextType =
  | 'USER_PROFILE_PHOTO'
  | 'COMMITTEE_LOGO'
  | 'EVENT_BANNER'
  | 'GENERAL_ASSET';

export type ImageResizeModeType = 'COVER' | 'CONTAIN' | 'INSIDE';

interface ImageAssetUploadItemInput {
  dataUrl: string;
  preferredResizeMode?: ImageResizeModeType;
  compressionQuality?: number;
}

interface ImageAssetBatchUploadInput {
  usageContext: ImageAssetUsageContextType;
  files: ImageAssetUploadItemInput[];
}

interface UploadedImageAssetMetadata {
  storageRelativePath: string;
  publicRelativeUrl: string;
  publicAbsoluteUrl: string;
  width: number;
  height: number;
  byteSize: number;
}

interface ImageAssetBatchUploadPayload {
  data: UploadedImageAssetMetadata[];
}

interface GraphQLResponseEnvelope<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

interface ImageOptimizationPlan {
  usageContext: ImageAssetUsageContextType;
  preferredResizeMode: ImageResizeModeType;
  maxWidth: number;
  maxHeight: number;
  targetQuality: number;
  forceSquareCrop: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ImageAssetService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  private readonly uploadImageAssetBatchMutationDocument = `mutation UploadImageAssetBatch($input: ImageAssetBatchUploadInput!) {
    uploadImageAssetBatch(input: $input) {
      data {
        storageRelativePath
        publicRelativeUrl
        publicAbsoluteUrl
        width
        height
        byteSize
      }
    }
  }`;

  uploadSingleImageForUserProfilePhoto(file: File): Observable<UploadedImageAssetMetadata> {
    return this.prepareAndUploadImageAssetBatch('USER_PROFILE_PHOTO', [file]).pipe(
      map((uploadedAssets) => uploadedAssets[0])
    );
  }

  uploadSingleImageForCommitteeLogo(file: File): Observable<UploadedImageAssetMetadata> {
    return this.prepareAndUploadImageAssetBatch('COMMITTEE_LOGO', [file]).pipe(
      map((uploadedAssets) => uploadedAssets[0])
    );
  }

  uploadMultipleImagesForEventBanners(files: File[]): Observable<UploadedImageAssetMetadata[]> {
    return this.prepareAndUploadImageAssetBatch('EVENT_BANNER', files);
  }

  private prepareAndUploadImageAssetBatch(
    usageContext: ImageAssetUsageContextType,
    files: File[]
  ): Observable<UploadedImageAssetMetadata[]> {
    if (!files.length) {
      throw new Error('At least one file is required for image upload.');
    }

    if (usageContext !== 'EVENT_BANNER' && files.length > 1) {
      throw new Error('This upload context supports one image at a time.');
    }

    const optimizationPlan = this.resolveImageOptimizationPlan(usageContext);

    return from(
      Promise.all(
        files.map((file) => this.transformFileToOptimizedDataUrl(file, optimizationPlan))
      )
    ).pipe(
      switchMap((optimizedDataUrls) => this.executeImageBatchUploadMutation({
        usageContext,
        files: optimizedDataUrls.map((optimizedDataUrl) => ({
          dataUrl: optimizedDataUrl,
          preferredResizeMode: optimizationPlan.preferredResizeMode,
          compressionQuality: optimizationPlan.targetQuality
        }))
      }))
    );
  }

  private executeImageBatchUploadMutation(input: ImageAssetBatchUploadInput): Observable<UploadedImageAssetMetadata[]> {
    return this.http.post<GraphQLResponseEnvelope<{ uploadImageAssetBatch: ImageAssetBatchUploadPayload }>>(this.graphqlUrl, {
        query: this.uploadImageAssetBatchMutationDocument,
        variables: { input }
      },
      { withCredentials: true }
    ).pipe(
      map((responseEnvelope) => {
        if (responseEnvelope.errors?.length) {
          throw new Error(responseEnvelope.errors[0].message || 'Failed to upload image assets.');
        }

        const uploadPayload = responseEnvelope.data?.uploadImageAssetBatch;
        if (!uploadPayload || !Array.isArray(uploadPayload.data)) {
          throw new Error('Image upload service returned an invalid response.');
        }

        return uploadPayload.data;
      })
    );
  }

  private resolveImageOptimizationPlan(usageContext: ImageAssetUsageContextType): ImageOptimizationPlan {
    if (usageContext === 'USER_PROFILE_PHOTO') {
      return {
        usageContext,
        preferredResizeMode: 'COVER',
        maxWidth: 512,
        maxHeight: 512,
        targetQuality: 72,
        forceSquareCrop: true
      };
    }

    if (usageContext === 'COMMITTEE_LOGO') {
      return {
        usageContext,
        preferredResizeMode: 'COVER',
        maxWidth: 768,
        maxHeight: 768,
        targetQuality: 74,
        forceSquareCrop: true
      };
    }

    if (usageContext === 'EVENT_BANNER') {
      return {
        usageContext,
        preferredResizeMode: 'INSIDE',
        maxWidth: 900,
        maxHeight: 506,
        targetQuality: 55,
        forceSquareCrop: false
      };
    }

    return {
      usageContext,
      preferredResizeMode: 'INSIDE',
      maxWidth: 1600,
      maxHeight: 1600,
      targetQuality: 72,
      forceSquareCrop: false
    };
  }

  private async transformFileToOptimizedDataUrl(file: File, plan: ImageOptimizationPlan): Promise<string> {
    const imageBitmap = await this.readFileAsImageBitmap(file);

    let cropSourceX = 0;
    let cropSourceY = 0;
    let cropSourceWidth = imageBitmap.width;
    let cropSourceHeight = imageBitmap.height;

    if (plan.forceSquareCrop) {
      const minEdge = Math.min(imageBitmap.width, imageBitmap.height);
      cropSourceWidth = minEdge;
      cropSourceHeight = minEdge;
      cropSourceX = Math.floor((imageBitmap.width - minEdge) / 2);
      cropSourceY = Math.floor((imageBitmap.height - minEdge) / 2);
    }

    const resizeRatio = Math.min(
      plan.maxWidth / cropSourceWidth,
      plan.maxHeight / cropSourceHeight,
      1
    );

    const outputWidth = Math.max(1, Math.round(cropSourceWidth * resizeRatio));
    const outputHeight = Math.max(1, Math.round(cropSourceHeight * resizeRatio));

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const drawingContext = canvas.getContext('2d');
    if (!drawingContext) {
      throw new Error('Unable to initialize image processing canvas context.');
    }

    drawingContext.drawImage(
      imageBitmap,
      cropSourceX,
      cropSourceY,
      cropSourceWidth,
      cropSourceHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );

    return canvas.toDataURL('image/webp', plan.targetQuality / 100);
  }

  private readFileAsImageBitmap(file: File): Promise<ImageBitmap> {
    if ('createImageBitmap' in window) {
      return createImageBitmap(file);
    }

    return new Promise<ImageBitmap>((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = () => {
        const image = new Image();
        image.onload = async () => {
          try {
            const bitmap = await createImageBitmap(image);
            resolve(bitmap);
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = () => reject(new Error('Image decode failed.'));
        image.src = String(fileReader.result || '');
      };
      fileReader.onerror = () => reject(new Error('Failed to read image file.'));
      fileReader.readAsDataURL(file);
    });
  }
}
