import { Component, ElementRef, inject, ViewChild, OnInit, OnDestroy, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { EventOverviewService } from './event-overview.service';
import { EventOverviewPayload } from './event-overview.models';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { ConfirmDialogService } from '../../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../../components/dialog/confirm/confirm-dialog.models';
import { DashboardHierarchyTreeService } from '../../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { CreateEventDialogComponent } from '../../../../../components/dialog/create-event/create-event.component';
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
    MatSlideToggleModule,
    MatCheckboxModule,
    MatTooltipModule
  ],
  templateUrl: './event-overview.html',
  styleUrl: './event-overview.scss'
})
export class EventOverviewComponent implements OnInit, OnDestroy {
  @ViewChild('bannerFileInput') private readonly bannerFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('bannerSingleFileInput') private readonly bannerSingleFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('eventLogoInput') private readonly eventLogoInput?: ElementRef<HTMLInputElement>;

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly overviewService = inject(EventOverviewService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly cdr = inject(ChangeDetectorRef);

  private routeSub?: Subscription;
  public eventData: EventOverviewPayload | null = null;
  public readonly isLoading = signal<boolean>(false);
  public readonly isUploadingEventLogo = signal<boolean>(false);
  public readonly isDeletingBanners = signal<boolean>(false);
  public readonly isSelectionMode = signal<boolean>(false);
  public readonly selectedBannerUrls = signal<Set<string>>(new Set<string>());
  public readonly skeletonRows3 = [1, 2, 3];
  public readonly skeletonRows5 = [1, 2, 3, 4, 5];

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

  ngOnInit(): void {
    const parentParams$ = this.route.parent?.params;
    if (!parentParams$) {
      this.notifier.error('Failed to resolve event route.');
      return;
    }

    this.routeSub = parentParams$.subscribe(params => {
      const eventId = params['id'];
      if (eventId) {
        this.loadEventOverview(eventId);
      }
    });
  }

  private loadEventOverview(id: string): void {
    this.isLoading.set(true);
    this.overviewService.getEventOverview(id).subscribe({
      next: (data) => {
        this.eventData = data ?? null;
        this.isLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load event overview.');
        this.eventData = null;
        this.isLoading.set(false);
      }
    });
  }

  public onEditEvent(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId || !currentEvent?.committeeId) {
      this.notifier.error('No event available for editing');
      return;
    }
    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateEventDialogComponent, {
      position: { right: '0', top: '0' }, height: '100%', width: '50%',
      autoFocus: true, disableClose: true, hasBackdrop: true, panelClass: 'slide-in-dialog',
      data: {
        eventId: currentEvent.eventId, committeeId: currentEvent.committeeId,
        address: currentEvent.committeeAddress || '', eventType: currentEvent.type === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
        visibility: currentEvent.visibility, eventName: currentEvent.eventName,
        eventDisplayName: currentEvent.eventDisplayName, status: currentEvent.status,
        category: currentEvent.category, startDate: currentEvent.startDate,
        endDate: currentEvent.endDate, latitude: currentEvent.latitude, longitude: currentEvent.longitude
      }
    });
    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (!result) return;
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.refreshOverview();
    });
  }

  public onDeleteEvent(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for deletion'); return; }
    const dialogData: ConfirmDialogData = {
      title: 'Delete Event', message: 'Are you sure you want to delete this event? This action will also remove linked members, media, programs, and tasks.',
      confirmText: 'Delete', cancelText: 'Cancel', highlightText: currentEvent.eventName
    };
    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;
      this.overviewService.deleteEvent(currentEvent.eventId).subscribe({
        next: () => {
          this.hierarchyTreeService.triggerHierarchyTreeRefresh();
          this.notifier.success(`**${this.toTitleCase(currentEvent.eventName)}** has been deleted successfully`);
          if (currentEvent.committeeId) { this.router.navigate(['/dashboard', 'group', currentEvent.committeeId]); return; }
          this.router.navigate(['/dashboard', 'home']);
        },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to delete event.'); }
      });
    });
  }

  public onEventVisibilityChange(isVisible: boolean): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) { this.notifier.error('No event available for visibility update'); return; }
    const visibility: 'VISIBLE' | 'HIDDEN' = isVisible ? 'VISIBLE' : 'HIDDEN';
    if (currentEvent.visibility === visibility) return;
    const previousVisibility = currentEvent.visibility;
    this.eventData = { ...currentEvent, visibility };
    this.overviewService.updateEventVisibility(currentEvent.eventId, visibility).subscribe({
      next: () => {
        const formattedEventName = this.toTitleCase(currentEvent.eventName || 'Event');
        this.notifier.success(visibility === 'VISIBLE' ? `**${formattedEventName}** is now visible to all the public` : `**${formattedEventName}** is now hidden to all the public`);
      },
      error: (err: HttpErrorResponse) => {
        this.eventData = { ...currentEvent, visibility: previousVisibility };
        this.notifier.error(err?.error?.message || 'Failed to update event visibility.');
      }
    });
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
      this.eventData = { ...currentEvent, bannerImages: (result as any).bannerImages, eventBanner: (result as any).bannerImages[0] || currentEvent.eventBanner };
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
      this.eventData = { ...currentEvent, bannerImages: (result as any).bannerImages, eventBanner: (result as any).bannerImages[0] || currentEvent.eventBanner };
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

      this.eventData = {
        ...currentEvent,
        bannerImages: lastPayload?.bannerImages ?? currentEvent.bannerImages.filter((u) => !selectedUrls.includes(u)),
        eventBanner: lastPayload ? lastPayload.bannerImages[0] || null : currentEvent.eventBanner
      };
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
          this.eventData = { ...currentEvent, bannerImages: payload.bannerImages, eventBanner: payload.bannerImages[0] || null };
          this.cdr.detectChanges();
          this.notifier.success('Banner image deleted successfully.');
        },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to delete banner image.'); }
      });
    });
  }

  public onEventLogoCircleClicked(event: Event): void {
    if (!(this.isEventMasterAdmin || this.isEventAdmin)) return;
    event.stopPropagation();
    const host = (event.currentTarget as HTMLElement).querySelector('input[type="file"]') as HTMLInputElement | null;
    host?.click();
  }

  public async onEventLogoSelected(event: Event): Promise<void> {
    event.stopPropagation();
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0] || null;
    inputElement.value = '';

    if (!selectedFile) return;

    const currentEvent = this.eventData;
    if (!currentEvent?.eventId || !currentEvent?.committeeId) {
      this.notifier.error('Event reference is missing. Please reload the workspace.');
      return;
    }

    const selectedOrCroppedFile = await this.openEventLogoCropDialog(selectedFile);
    if (!selectedOrCroppedFile) return;

    this.isUploadingEventLogo.set(true);

    try {
      const uploadedMetadata = await firstValueFrom(
        this.imageAssetService.uploadSingleImageForCommitteeLogo(selectedOrCroppedFile, `event-logo-${currentEvent.eventId}`)
      );

      const updated = await firstValueFrom(
        this.overviewService.updateEventLogo(currentEvent.eventId, currentEvent.committeeId, uploadedMetadata.publicAbsoluteUrl)
      );

      this.eventData = { ...currentEvent, eventLogo: updated.eventLogo || uploadedMetadata.publicAbsoluteUrl };
      this.cdr.detectChanges();
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.notifier.success('Event logo updated successfully.');
    } catch (error: any) {
      this.notifier.error(error?.message || 'Failed to update event logo.');
    } finally {
      this.isUploadingEventLogo.set(false);
    }
  }

  private async openEventLogoCropDialog(file: File): Promise<File | null> {
    return firstValueFrom(
      this.dialog.open(ImageCropperDialogComponent, {
        width: 'min(92vw, 920px)',
        data: {
          file,
          title: 'Crop Event Logo',
          maintainAspectRatio: true,
          aspectRatio: 1
        }
      }).afterClosed()
    );
  }

  public onEventLogoLoadError(): void {
    if (this.eventData) {
      this.eventData = { ...this.eventData, eventLogo: null };
    }
  }

  private refreshOverview(): void {
    const currentEvent = this.eventData;
    if (currentEvent?.eventId) {
      this.overviewService.getEventOverview(String(currentEvent.eventId)).subscribe({
        next: (data) => this.eventData = data ?? null
      });
    }
  }

  private toTitleCase(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\b\w/g, (char) => char.toUpperCase());
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }
}