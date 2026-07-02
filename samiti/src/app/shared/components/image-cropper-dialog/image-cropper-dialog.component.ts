import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';

interface ImageCropperDialogData {
  file: File;
  title?: string;
  maintainAspectRatio?: boolean;
  aspectRatio?: number;
  cropperMinWidth?: number;
  cropperMinHeight?: number;
}

@Component({
  selector: 'app-image-cropper-dialog',
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, ImageCropperComponent],
  templateUrl: './image-cropper-dialog.component.html',
  styleUrl: './image-cropper-dialog.component.scss'
})
export class ImageCropperDialogComponent implements OnDestroy {
  public readonly dialogTitle: string;
  public croppedImageBlob: Blob | null = null;
  public hasImageLoadFailed = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: ImageCropperDialogData,
    private readonly dialogRef: MatDialogRef<ImageCropperDialogComponent>
  ) {
    this.dialogTitle = data.title || 'Crop Image';
  }

  ngOnDestroy(): void {}

  public getAspectRatioHint(): string {
    if (!this.data.maintainAspectRatio || !this.data.aspectRatio) {
      return 'Free crop';
    }

    if (Math.abs(this.data.aspectRatio - 1) < 0.01) {
      return 'Locked ratio: 1:1';
    }

    if (Math.abs(this.data.aspectRatio - (16 / 9)) < 0.01) {
      return 'Locked ratio: 16:9';
    }

    return `Locked ratio: ${this.data.aspectRatio.toFixed(2)}:1`;
  }

  public getMinimumCropHint(): string | null {
    const minWidth = this.data.cropperMinWidth || 0;
    const minHeight = this.data.cropperMinHeight || 0;

    if (!minWidth && !minHeight) {
      return null;
    }

    if (minWidth && minHeight) {
      return `Minimum crop: ${minWidth} x ${minHeight}`;
    }

    if (minWidth) {
      return `Minimum crop width: ${minWidth}`;
    }

    return `Minimum crop height: ${minHeight}`;
  }

  public onImageCropped(event: ImageCroppedEvent): void {
    this.croppedImageBlob = event.blob ?? null;
  }

  public onImageLoadFailed(): void {
    this.hasImageLoadFailed = true;
  }

  public useOriginalImage(): void {
    this.dialogRef.close(this.data.file);
  }

  public cancelSelection(): void {
    this.dialogRef.close(null);
  }

  public cropAndSelect(): void {
    if (!this.croppedImageBlob) {
      return;
    }

    const croppedFile = new File([this.croppedImageBlob], this.data.file.name, {
      type: this.croppedImageBlob.type || this.data.file.type || 'image/png',
      lastModified: Date.now()
    });

    this.dialogRef.close(croppedFile);
  }
}
