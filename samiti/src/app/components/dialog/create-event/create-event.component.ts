import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatToolbar } from '@angular/material/toolbar';
import { firstValueFrom } from 'rxjs';
import { CreateEventService } from './create-event.service';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { ImageAssetService } from '../../../core/services/image-asset.service';
import { ImageCropperDialogComponent } from '../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';
import { TextFormatService } from '../../../shared/services/text-format-service.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-create-event-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    MatToolbar,
  ],
  templateUrl: './create-event.component.html',
  styleUrl: './create-event.component.scss'
})
export class CreateEventDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<CreateEventDialogComponent>);
  private readonly createEventService = inject(CreateEventService);
  private readonly notifier = inject(NotifierService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly dialog = inject(MatDialog);
  private readonly textFormatService = inject(TextFormatService);
  private readonly authService = inject(AuthService);

  public readonly injectedData = inject(MAT_DIALOG_DATA, { optional: true });

  // 📝 Form bindings
  public eventName: string = '';
  public description: string = '';
  public eventBannerFiles: File[] = [];
  public uploadedEventBannerUrls: string[] = [];
  public status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' = 'UPCOMING';
  public type: string = 'puja';
  public visibility: 'VISIBLE' | 'HIDDEN' = 'HIDDEN';
  public startDate: Date | null = null;
  public endDate: Date | null = null;

  public readonly isSubmitting = signal<boolean>(false);
  public readonly bannerPreviewUrls = signal<string[]>([]);

  // Event type options
  public readonly eventTypes = ['puja', 'sports', 'meeting', 'celebration', 'workshop', 'other'];
  
  // Event status options
  public readonly statuses = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'];

  get isFormValid(): boolean {
    return (
      !!this.eventName?.trim() &&
      !!this.status &&
      !!this.startDate
    );
  }

  public onCancel(): void {
    this.dialogRef.close(false);
  }

  public async onBannerSelected(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const files = target.files;

    if (!files || !files.length) {
      return;
    }

    const selectedBannerFiles: File[] = [];

    for (const rawFile of Array.from(files)) {
      const selectedOrCroppedFile = await firstValueFrom(
        this.dialog.open(ImageCropperDialogComponent, {
          width: 'min(92vw, 920px)',
          data: {
            file: rawFile,
            title: `Crop Event Banner (${selectedBannerFiles.length + 1}/${files.length})`,
            maintainAspectRatio: true,
            aspectRatio: 16 / 9,
            cropperMinWidth: 1280,
            cropperMinHeight: 720
          }
        }).afterClosed()
      );

      if (selectedOrCroppedFile) {
        selectedBannerFiles.push(selectedOrCroppedFile);
      }
    }

    if (!selectedBannerFiles.length) {
      return;
    }

    this.eventBannerFiles = selectedBannerFiles;

    const previewReaders = selectedBannerFiles.map((file) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
      })
    );

    Promise.all(previewReaders).then((previewUrls) => {
      this.bannerPreviewUrls.set(previewUrls);
    });
  }

  public clearBanner(index?: number): void {
    if (index === undefined) {
      this.eventBannerFiles = [];
      this.bannerPreviewUrls.set([]);
      this.uploadedEventBannerUrls = [];
      return;
    }

    this.eventBannerFiles = this.eventBannerFiles.filter((_, currentIndex) => currentIndex !== index);
    this.bannerPreviewUrls.set(
      this.bannerPreviewUrls().filter((_, currentIndex) => currentIndex !== index)
    );
  }

  public async onSubmit(): Promise<void> {
    if (!this.isFormValid) return;

    this.isSubmitting.set(true);

    const committeeId = this.injectedData?.committeeId;
    if (!committeeId) {
      this.notifier.error('Committee ID not provided');
      this.isSubmitting.set(false);
      return;
    }

    let primaryBannerImageUrl: string | undefined;
    if (this.eventBannerFiles.length > 0) {
      try {
        const uploadedEventBannerMetadataList = await firstValueFrom(
          this.imageAssetService.uploadMultipleImagesForEventBanners(this.eventBannerFiles)
        );
        this.uploadedEventBannerUrls = uploadedEventBannerMetadataList.map((item) => item.publicAbsoluteUrl);
        primaryBannerImageUrl = this.uploadedEventBannerUrls[0];
      } catch (uploadError: unknown) {
        const typedUploadError = uploadError as { message?: string };
        this.notifier.error(typedUploadError.message || 'Failed to upload event images');
        this.isSubmitting.set(false);
        return;
      }
    }

    // Convert Date objects to ISO string format for dates
    const startDateStr = this.startDate ? this.startDate.toISOString().split('T')[0] : null;
    const endDateStr = this.endDate ? this.endDate.toISOString().split('T')[0] : null;

    const payload = {
      committeeId: Number(committeeId),
      eventName: this.eventName.trim(),
      description: this.description?.trim() || undefined,
      eventBanner: primaryBannerImageUrl,
      bannerImageUrls: this.uploadedEventBannerUrls.length ? this.uploadedEventBannerUrls : undefined,
      status: this.status,
      type: this.type || undefined,
      visibility: this.visibility,
      startDate: startDateStr,
      endDate: endDateStr
    };

    this.createEventService.createEvent(payload).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        const rawUserName = this.authService.getStoredUserData()?.name || 'User';
        const displayUserName = this.textFormatService.toTitleCase(rawUserName);
        const displayEventName = this.textFormatService.toTitleCase(response.eventName || this.eventName);

        this.notifier.success(
          `Hi, **${displayUserName}**! You have successfully created the event **${displayEventName}**.`,
          'Event Created'
        );
        this.dialogRef.close(response);
      },
      error: (error) => {
        this.isSubmitting.set(false);
        const errorMessage = error?.error?.errors?.[0]?.message || 'Failed to create event';
        this.notifier.error(errorMessage);
        console.error('Create event error:', error);
      }
    });
  }
}
