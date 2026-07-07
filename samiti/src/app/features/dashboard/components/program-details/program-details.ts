import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ProgramDetailsPayload, ProgramTask } from './program-details.models';
import { ProgramDetailsService } from './program-details.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { CreateProgramDialogComponent } from '../../../../components/dialog/create-program/create-program.component';
import { ImageAssetService } from '../../../../core/services/image-asset.service';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';

@Component({
  selector: 'app-program-details',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  templateUrl: './program-details.html',
  styleUrl: './program-details.scss'
})
export class ProgramDetailsComponent implements OnInit {
  @ViewChild('programBannerFileInput') private readonly programBannerFileInput?: ElementRef<HTMLInputElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly programDetailsService = inject(ProgramDetailsService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  public readonly isLoading = signal<boolean>(false);
  public readonly isBannerUploading = signal<boolean>(false);
  public readonly programData = signal<ProgramDetailsPayload | null>(null);
  public readonly tasks = signal<ProgramTask[]>([]);
  public readonly MAX_BANNERS = 5;

  public get bannerCount(): number {
    return this.programData()?.bannerImages?.length ?? 0;
  }

  public get canUploadMoreBanners(): boolean {
    return this.bannerCount < this.MAX_BANNERS;
  }

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const programId = params['id'];
      if (programId) {
        this.fetchProgramDetails(programId);
      }
    });
  }

  private fetchProgramDetails(id: string): void {
    this.isLoading.set(true);
    this.programData.set(null);

    this.programDetailsService.getProgramDetails(id).subscribe({
      next: (data: ProgramDetailsPayload) => {
        this.programData.set(data ?? null);
        this.tasks.set([]);
        this.isLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load program details.');
        this.programData.set(null);
        this.tasks.set([]);
        this.isLoading.set(false);
      }
    });
  }

  public onEditProgram(): void {
    const currentProgram = this.programData();
    if (!currentProgram?.programId || !currentProgram?.eventId) {
      this.notifier.error('No program available for editing');
      return;
    }

    document.body.classList.add('dialog-open');
    const dialogRef = this.dialog.open(CreateProgramDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog',
      data: {
        programId: currentProgram.programId,
        eventId: currentProgram.eventId,
        programName: currentProgram.programName,
        address: currentProgram.address || '',
        visibility: currentProgram.visibility,
        startDate: currentProgram.startDate,
        endDate: currentProgram.endDate
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (!result) {
        return;
      }

      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.fetchProgramDetails(String(currentProgram.programId));
      this.notifier.success(`Program "${result.programName || currentProgram.programName}" updated successfully!`);
    });
  }

  public onDeleteProgram(): void {
    // TODO: implement delete with confirm dialog
  }

  public onAddTask(): void {
    // TODO: implement add task dialog
  }

  public onAddProgramBannerClick(): void {
    if (!this.programBannerFileInput?.nativeElement) {
      this.notifier.error('File picker is not ready. Please try again.');
      return;
    }

    this.programBannerFileInput.nativeElement.value = '';
    this.programBannerFileInput.nativeElement.click();
  }

  public async onProgramBannerFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const selectedFiles = Array.from(input.files || []);
    if (!selectedFiles.length) {
      return;
    }

    const currentProgram = this.programData();
    if (!currentProgram?.programId) {
      return;
    }

    const slotsAvailable = this.MAX_BANNERS - this.bannerCount;
    if (slotsAvailable <= 0) {
      this.notifier.warn(`Maximum ${this.MAX_BANNERS} banner images allowed. Delete existing banners first.`);
      return;
    }

    const filesToUpload = selectedFiles.slice(0, slotsAvailable);
    if (selectedFiles.length > slotsAvailable) {
      this.notifier.warn(`Only ${slotsAvailable} slot(s) remaining. Uploading first ${slotsAvailable} image(s).`);
    }

    this.isBannerUploading.set(true);
    try {
      const uploadedAssets = await firstValueFrom(
        this.imageAssetService.uploadMultipleImagesForEventBanners(filesToUpload)
      );
      const urls = uploadedAssets.map((asset) => asset.publicAbsoluteUrl);

      const result = await firstValueFrom(
        this.programDetailsService.uploadProgramBannerImages(currentProgram.programId, urls)
      );

      this.programData.update((prev) =>
        prev
          ? {
              ...prev,
              bannerImages: result.bannerImages,
              programBanner: result.bannerImages[0] || prev.programBanner || null
            }
          : prev
      );

      this.notifier.success(`${urls.length} banner image${urls.length > 1 ? 's' : ''} uploaded successfully.`);
    } catch (err: any) {
      this.notifier.error(err?.error?.message || err?.message || 'Failed to upload program banner images.');
    } finally {
      this.isBannerUploading.set(false);
    }
  }

  public onDeleteProgramBanner(imageUrl: string): void {
    const currentProgram = this.programData();
    if (!currentProgram?.programId || !imageUrl) {
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Delete Banner Image',
      message: 'Are you sure you want to delete this banner image? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.programDetailsService.deleteProgramBannerImage(currentProgram.programId, imageUrl).subscribe({
        next: (payload) => {
          this.programData.update((prev) =>
            prev
              ? {
                  ...prev,
                  bannerImages: payload.bannerImages,
                  programBanner: payload.bannerImages[0] || null
                }
              : prev
          );
          this.notifier.success('Banner image deleted successfully.');
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to delete banner image.');
        }
      });
    });
  }
}
