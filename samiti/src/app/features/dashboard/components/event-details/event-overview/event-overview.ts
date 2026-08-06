import { Component, ElementRef, inject, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EventOverviewService } from './event-overview.service';
import { EventOverviewPayload } from './event-overview.models';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { ConfirmDialogService } from '../../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../../components/dialog/confirm/confirm-dialog.models';
import { DashboardHierarchyTreeService } from '../../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { CreateEventDialogComponent } from '../../../../../components/dialog/create-event/create-event.component';
import { ImageAssetService } from '../../../../../core/services/image-asset.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-event-overview',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule
  ],
  templateUrl: './event-overview.html',
  styleUrl: './event-overview.scss'
})
export class EventOverviewComponent implements OnInit, OnDestroy {
  @ViewChild('bannerFileInput') private readonly bannerFileInput?: ElementRef<HTMLInputElement>;

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly overviewService = inject(EventOverviewService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private routeSub?: Subscription;
  public eventData: EventOverviewPayload | null = null;

  public get bannerCount(): number {
    return this.eventData?.bannerImages?.length ?? 0;
  }

  public get MAX_BANNERS(): number {
    return 5;
  }

  public get canUploadMoreBanners(): boolean {
    return this.bannerCount < this.MAX_BANNERS;
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
    this.overviewService.getEventOverview(id).subscribe({
      next: (data) => {
        this.eventData = data ?? null;
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load event overview.');
        this.eventData = null;
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
      const urls = uploadedAssets.map((a) => (a as any).publicAbsoluteUrl);
      const result = await firstValueFrom(this.overviewService.uploadEventBannerImages(currentEvent.eventId, urls));
      this.eventData = { ...currentEvent, bannerImages: (result as any).bannerImages, eventBanner: (result as any).bannerImages[0] || currentEvent.eventBanner };
      this.notifier.success(`${urls.length} banner image${urls.length > 1 ? 's' : ''} uploaded successfully.`);
    } catch (err: any) {
      this.notifier.error(err?.error?.message || err?.message || 'Failed to upload banner images.');
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
          this.notifier.success('Banner image deleted successfully.');
        },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to delete banner image.'); }
      });
    });
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