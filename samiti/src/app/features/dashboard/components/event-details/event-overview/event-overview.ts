import { Component, ElementRef, inject, ViewChild, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EventOverviewService } from './event-overview.service';
import { EventOverviewPayload } from './event-overview.models';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { ConfirmDialogService } from '../../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../../components/dialog/confirm/confirm-dialog.models';
import { EventDetailsStateService } from '../event-details-state.service';
import { ImageAssetService } from '../../../../../core/services/image-asset.service';
import { ImageCropperDialogComponent } from '../../../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';

@Component({
  selector: 'app-event-overview',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatCheckboxModule
  ],
  templateUrl: './event-overview.html',
  styleUrl: './event-overview.scss'
})
export class EventOverviewComponent {
  @ViewChild('bannerFileInput') private readonly bannerFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('bannerSingleFileInput') private readonly bannerSingleFileInput?: ElementRef<HTMLInputElement>;

  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly overviewService = inject(EventOverviewService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly stateService = inject(EventDetailsStateService);
  private readonly cdr = inject(ChangeDetectorRef);

  public readonly isDeletingBanners = signal<boolean>(false);
  public readonly isSelectionMode = signal<boolean>(false);
  public readonly selectedBannerUrls = signal<Set<string>>(new Set<string>());
  public readonly skeletonRows5 = [1, 2, 3, 4, 5];

  public get eventData(): EventOverviewPayload | null {
    return this.stateService.eventOverview();
  }

  public get selectedBannerCount(): number {
    return this.selectedBannerUrls().size;
  }

  public get userEventRole(): string {
    return String(this.eventData?.committeeRole || 'NONE').toUpperCase();
  }

  public get userEventRoleLabel(): string {
    if (this.eventData?.myDesignation?.name) return this.eventData.myDesignation.name;
    return 'MEMBER';
  }

  public get designationColor(): string {
    const designation = this.eventData?.myDesignation;
    if (designation?.name && designation.color) {
      const normalized = designation.name.trim().toLowerCase();
      if (normalized !== 'member' && normalized !== '') {
        return designation.color;
      }
    }
    return '#cbd5e1';
  }

  public get designationIcon(): string | null {
    const designation = this.eventData?.myDesignation;
    if (designation?.name && designation.icon) {
      const normalized = designation.name.trim().toLowerCase();
      if (normalized !== 'member' && normalized !== '') {
        return designation.icon;
      }
    }
    return null;
  }

  public get isEventMasterAdmin(): boolean {
    return this.userEventRole === 'COMMITTEE_MASTER_ADMIN';
  }

  public get isEventAdmin(): boolean {
    return this.userEventRole === 'COMMITTEE_ADMIN';
  }

  public get isEventMember(): boolean {
    return this.userEventRole === 'COMMITTEE_MEMBER';
  }

  public get hasEventRole(): boolean {
    return Boolean(this.eventData?.myDesignation?.roleId);
  }

  public get canManageEvent(): boolean {
    return this.hasEventRole || this.isEventMasterAdmin;
  }

  public get canDeleteBanners(): boolean {
    return this.isEventMasterAdmin || this.isEventAdmin;
  }

  public get bannerCount(): number {
    return this.eventData?.bannerImages?.length ?? 0;
  }

  public get MAX_BANNERS(): number {
    return 5;
  }

  public get canUploadMoreBanners(): boolean {
    return this.bannerCount < this.MAX_BANNERS;
  }

  public get primaryBannerUrl(): string | null {
    if (this.eventData?.eventBanner) return this.eventData.eventBanner;
    if (this.eventData?.bannerImages?.length) return this.eventData.bannerImages[0];
    return null;
  }

  public get fallbackInitial(): string {
    const name = this.eventData?.eventDisplayName || this.eventData?.eventName || '';
    return name ? name.charAt(0).toUpperCase() : 'E';
  }

  public onAddBannerClick(): void {
    if (!this.bannerFileInput?.nativeElement) { this.notifier.error('File picker is not ready. Please try again.'); return; }
    this.bannerFileInput.nativeElement.value = '';
    this.bannerFileInput.nativeElement.click();
  }

  public onAddSingleBannerClick(): void {
    if (!this.bannerSingleFileInput?.nativeElement) { this.notifier.error('File picker is not ready. Please try again.'); return; }
    this.bannerSingleFileInput.nativeElement.value = '';
    this.bannerSingleFileInput.nativeElement.click();
  }

  public async onBannerFilesSelected(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const selectedFiles = Array.from(input.files || []);
    if (!selectedFiles.length) return;
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) return;
    const slotsAvailable = this.MAX_BANNERS - this.bannerCount;
    if (slotsAvailable <= 0) { this.notifier.warn(`Maximum ${this.MAX_BANNERS} banner images allowed. Delete existing banners first.`); return; }
    const filesToUpload = selectedFiles.slice(0, slotsAvailable);
    if (selectedFiles.length > slotsAvailable) { this.notifier.warn(`Only ${slotsAvailable} slot(s) remaining. Uploading first ${slotsAvailable} image(s).`); }
    try {
      const uploadedAssets = await firstValueFrom(this.imageAssetService.uploadMultipleImagesForEventBanners(filesToUpload));
      const urls = uploadedAssets.map((a: any) => a.publicAbsoluteUrl);
      const result = await firstValueFrom(this.overviewService.uploadEventBannerImages(currentEvent.eventId, urls));
      this.stateService.eventOverview.set({ ...currentEvent, bannerImages: (result as any).bannerImages, eventBanner: (result as any).bannerImages[0] || currentEvent.eventBanner });
      this.cdr.detectChanges();
      this.notifier.success(`${urls.length} banner image${urls.length > 1 ? 's' : ''} uploaded successfully.`);
    } catch (err: any) {
      this.notifier.error(err?.error?.message || err?.message || 'Failed to upload banner images.');
    }
  }

  public async onSingleBannerFileSelected(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) return;
    if (this.bannerCount >= this.MAX_BANNERS) {
      this.notifier.warn(`Maximum ${this.MAX_BANNERS} banner images allowed. Delete existing banners first.`);
      return;
    }

    const croppedFile = await this.openBannerCropDialog(file);
    if (!croppedFile) return;

    try {
      const uploadedAssets = await firstValueFrom(this.imageAssetService.uploadMultipleImagesForEventBanners([croppedFile]));
      const urls = uploadedAssets.map((a: any) => a.publicAbsoluteUrl);
      const result = await firstValueFrom(this.overviewService.uploadEventBannerImages(currentEvent.eventId, urls));
      this.stateService.eventOverview.set({ ...currentEvent, bannerImages: (result as any).bannerImages, eventBanner: (result as any).bannerImages[0] || currentEvent.eventBanner });
      this.cdr.detectChanges();
      this.notifier.success('Banner image uploaded successfully.');
    } catch (err: any) {
      this.notifier.error(err?.error?.message || err?.message || 'Failed to upload banner image.');
    }
  }

  private async openBannerCropDialog(file: File): Promise<File | null> {
    return firstValueFrom(
      this.dialog.open(ImageCropperDialogComponent, {
        width: 'min(92vw, 920px)',
        data: {
          file,
          title: 'Crop Banner Image',
          maintainAspectRatio: true,
          aspectRatio: 2
        }
      }).afterClosed()
    );
  }

  public toggleSelectionMode(): void {
    const next = !this.isSelectionMode();
    this.isSelectionMode.set(next);
    if (!next) {
      this.selectedBannerUrls.set(new Set<string>());
    }
  }

  public toggleBannerSelection(imageUrl: string): void {
    const current = new Set(this.selectedBannerUrls());
    if (current.has(imageUrl)) {
      current.delete(imageUrl);
    } else {
      current.add(imageUrl);
    }
    this.selectedBannerUrls.set(current);
  }

  public isBannerSelected(imageUrl: string): boolean {
    return this.selectedBannerUrls().has(imageUrl);
  }

  public async deleteSelectedBanners(): Promise<void> {
    const currentEvent = this.eventData;
    const selectedUrls = [...this.selectedBannerUrls()];
    if (!currentEvent?.eventId || selectedUrls.length === 0 || this.isDeletingBanners()) {
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Delete Banner Images',
      message: `Are you sure you want to delete ${selectedUrls.length} selected banner image(s)? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result?.confirmed) {
      return;
    }

    this.isDeletingBanners.set(true);
    try {
      let lastPayload: any = null;
      for (const url of selectedUrls) {
        lastPayload = await firstValueFrom(this.overviewService.deleteEventBannerImage(currentEvent.eventId, url));
      }

      this.stateService.eventOverview.set({
        ...currentEvent,
        bannerImages: lastPayload?.bannerImages ?? currentEvent.bannerImages.filter((u) => !selectedUrls.includes(u)),
        eventBanner: lastPayload ? lastPayload.bannerImages[0] || null : currentEvent.eventBanner
      });
      this.selectedBannerUrls.set(new Set<string>());
      this.isSelectionMode.set(false);
      this.cdr.detectChanges();
      this.notifier.success(`${selectedUrls.length} banner image(s) deleted successfully.`);
    } catch (err: any) {
      this.notifier.error(err?.error?.message || err?.message || 'Failed to delete banner images.');
    } finally {
      this.isDeletingBanners.set(false);
    }
  }

  public onDeleteBanner(imageUrl: string): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId || !imageUrl) return;
    const dialogData: ConfirmDialogData = { title: 'Delete Banner Image', message: 'Are you sure you want to delete this banner image? This action cannot be undone.', confirmText: 'Delete', cancelText: 'Cancel' };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.overviewService.deleteEventBannerImage(currentEvent.eventId, imageUrl).subscribe({
        next: (payload: any) => {
          this.stateService.eventOverview.set({ ...currentEvent, bannerImages: payload.bannerImages, eventBanner: payload.bannerImages[0] || null });
          this.cdr.detectChanges();
          this.notifier.success('Banner image deleted successfully.');
        },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to delete banner image.'); }
      });
    });
  }
}
