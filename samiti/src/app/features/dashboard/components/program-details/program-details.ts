import { Component, ElementRef, inject, OnInit, signal, computed, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, finalize } from 'rxjs';
import { ProgramDetailsPayload, ProgramTask } from './program-details.models';
import { ProgramDetailsService } from './program-details.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { CreateProgramDialogComponent } from '../../../../components/dialog/create-program/create-program.component';
import { ImageAssetService } from '../../../../core/services/image-asset.service';
import { LoadingStateService } from '../../../../shared/services/loading-state.service';
import { getEventComputedStatus } from '../../../../shared/services/event-status.util';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { ProgramOwnerService } from '../program-owner/program-owner.service';
import { ProgramOwnerCandidate, ProgramOwnerPayload } from '../program-owner/program-owner.models';

@Component({
  selector: 'app-program-details',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatSelectModule
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
  private readonly programOwnerService = inject(ProgramOwnerService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly loadingState = inject(LoadingStateService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly cdr = inject(ChangeDetectorRef);

  public readonly isLoading = signal<boolean>(false);
  public readonly isBannerUploading = signal<boolean>(false);
  public readonly isDeletingBanners = signal<boolean>(false);
  public readonly isSelectionMode = signal<boolean>(false);
  public readonly selectedBannerUrls = signal<Set<string>>(new Set<string>());
  public readonly programData = signal<ProgramDetailsPayload | null>(null);
  public readonly tasks = signal<ProgramTask[]>([]);
  public readonly programOwnerCandidates = signal<ProgramOwnerCandidate[]>([]);
  public readonly isUpdatingOwner = signal<boolean>(false);
  public readonly MAX_BANNERS = 5;

  public get bannerCount(): number {
    return this.programData()?.bannerImages?.length ?? 0;
  }

  public get selectedBannerCount(): number {
    return this.selectedBannerUrls().size;
  }

  public readonly calculatedProgramStatus = computed<'started' | 'upcoming' | 'completed'>(() => {
    const program = this.programData();
    if (!program?.startDate) return 'completed';
    return getEventComputedStatus(program.startDate, program.endDate).toLowerCase() as 'started' | 'upcoming' | 'completed';
  });

  public readonly timePillStatusClass = computed<string>(() => {
    const program = this.programData();
    if (!program) return '';

    const status = this.calculatedProgramStatus();
    if (status === 'completed') return 'time-pill-status-completed';
    if (status === 'upcoming') return 'time-pill-status-upcoming';

    // status === 'started'
    const today = this.getTodayLocalDate();
    const programStart = this.parseLocalDate(program.startDate);
    const programEnd = this.parseLocalDate(program.endDate);

    if (!programStart || !programEnd) return 'time-pill-status-started';

    const startTime = this.parseTimeToMinutes(program.startTime);
    const endTime = this.parseTimeToMinutes(program.endTime);

    if (today.getTime() === programStart.getTime() && startTime !== null && endTime !== null) {
      const now = this.getCurrentTimeMinutes();
      if (now < startTime) return 'time-pill-status-upcoming';
      if (now > endTime) return 'time-pill-status-completed';
      return 'time-pill-status-started';
    }

    if (today > programStart && today < programEnd) return 'time-pill-status-started';
    if (today.getTime() === programEnd.getTime() && startTime !== null && endTime !== null) {
      const now = this.getCurrentTimeMinutes();
      if (now > endTime) return 'time-pill-status-completed';
    }

    return 'time-pill-status-started';
  });

  private getTodayLocalDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private getCurrentTimeMinutes(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  private parseTimeToMinutes(timeStr: string | null | undefined): number | null {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  public readonly formattedDateRange = computed<string | null>(() => {
    const program = this.programData();
    if (!program) return null;

    const startDate = this.parseLocalDate(program.startDate);
    const endDate = this.parseLocalDate(program.endDate);

    if (!startDate && !endDate) return null;
    if (!startDate && endDate) return this.formatDate(endDate);
    if (startDate && !endDate) return this.formatDate(startDate);

    const sDate = startDate!;
    const eDate = endDate!;

    const startDay = String(sDate.getDate()).padStart(2, '0');
    const endDay = String(eDate.getDate()).padStart(2, '0');
    const startMonth = this.formatMonth(sDate);
    const endMonth = this.formatMonth(eDate);

    if (sDate.getFullYear() !== eDate.getFullYear()) {
      return `${this.formatDate(sDate)} - ${this.formatDate(eDate)}`;
    }
    if (sDate.getMonth() !== eDate.getMonth()) {
      return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${eDate.getFullYear()}`;
    }
    if (sDate.getDate() === eDate.getDate()) {
      return this.formatDate(sDate);
    }
    return `${startDay} - ${endDay} ${endMonth} ${eDate.getFullYear()}`;
  });

  public get programOwnerDisplay(): string {
    const name = this.programData()?.ownerName;
    if (!name) return 'UNASSIGNED';
    return String(name).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  public get programStartTime(): string | null {
    return this.formatTimeOnly(this.programData()?.startTime);
  }

  public get programEndTime(): string | null {
    return this.formatTimeOnly(this.programData()?.endTime);
  }

  public get formattedProgramStartTime(): string {
    return this.formatTimeWithPeriod(this.programData()?.startTime);
  }

  public get formattedProgramEndTime(): string {
    return this.formatTimeWithPeriod(this.programData()?.endTime);
  }

  private formatTimeOnly(timeStr?: string | null): string | null {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : timeStr;
  }

  private formatTimeWithPeriod(timeStr?: string | null): string {
    if (!timeStr) return '--:--';
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return timeStr;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return timeStr;

    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  private parseLocalDate(value: string | null | undefined): Date | null {
    if (!value || typeof value !== 'string') return null;
    const cleaned = value.trim().slice(0, 10);
    const [year, month, day] = cleaned.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  private formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = this.formatMonth(date);
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }

  private formatMonth(date: Date): string {
    return date.toLocaleString('en-US', { month: 'short' });
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
    const currentProgram = this.programData();
    const selectedUrls = [...this.selectedBannerUrls()];
    if (!currentProgram?.programId || selectedUrls.length === 0 || this.isDeletingBanners()) {
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
        lastPayload = await firstValueFrom(this.programDetailsService.deleteProgramBannerImage(currentProgram.programId, url));
      }

      this.programData.update((prev) =>
        prev
          ? {
              ...prev,
              bannerImages: lastPayload?.bannerImages ?? prev.bannerImages.filter((u) => !selectedUrls.includes(u)),
              programBanner: lastPayload ? lastPayload.bannerImages[0] || null : prev.programBanner
            }
          : prev
      );
      this.cdr.detectChanges();
      this.selectedBannerUrls.set(new Set<string>());
      this.isSelectionMode.set(false);
      this.notifier.success(`${selectedUrls.length} banner image(s) deleted successfully.`);
    } catch (err: any) {
      this.notifier.error(err?.error?.message || err?.message || 'Failed to delete banner images.');
    } finally {
      this.isDeletingBanners.set(false);
    }
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
    this.loadingState.begin();
    this.programData.set(null);
    this.programOwnerCandidates.set([]);

    this.programDetailsService.getProgramDetails(id).pipe(
      finalize(() => {
        this.isLoading.set(false);
        this.loadingState.end();
      })
    ).subscribe({
      next: (data: ProgramDetailsPayload) => {
        this.programData.set(data ?? null);
        this.tasks.set([]);
        if (data?.canAssignOwner && data.eventId) {
          const eventId = data.eventId;
          this.programOwnerService.getCandidates(data.eventId).subscribe({
            next: (candidates) => {
              if (this.programData()?.eventId === eventId) {
                this.programOwnerCandidates.set(candidates);
              }
            },
            error: (err: HttpErrorResponse) => this.notifier.error(err?.error?.message || 'Failed to load committee members.')
          });
        } else {
          this.programOwnerCandidates.set([]);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load program details.');
        this.programData.set(null);
        this.tasks.set([]);
      }
    });
  }

  public updateProgramOwner(ownerUserId: number | null): void {
    const currentProgram = this.programData();
    if (!currentProgram?.programId || !currentProgram.canAssignOwner || this.isUpdatingOwner()) {
      return;
    }

    this.programData.update((current) =>
      current ? { ...current, ownerUserId } : current
    );
    this.isUpdatingOwner.set(true);
    this.programOwnerService.assignOwner(currentProgram.programId, ownerUserId).subscribe({
      next: (owner: ProgramOwnerPayload) => {
        this.programData.update((current) =>
          current && current.programId === owner.programId
            ? {
                ...current,
                ownerUserId: owner.ownerUserId,
                ownerName: owner.ownerName,
                ownerAssignedBy: owner.ownerAssignedBy,
                ownerAssignedAt: owner.ownerAssignedAt
              }
            : current
        );
        this.isUpdatingOwner.set(false);
        this.notifier.success(owner.ownerName ? `Program owner assigned to ${owner.ownerName}.` : 'Program owner cleared.');
      },
      error: (err: HttpErrorResponse) => {
        this.programData.update((current) =>
          current && current.programId === currentProgram.programId
            ? { ...current, ownerUserId: currentProgram.ownerUserId ?? null }
            : current
        );
        this.isUpdatingOwner.set(false);
        this.notifier.error(err?.error?.message || 'Failed to update program owner.');
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
        endDate: currentProgram.endDate,
        startTime: currentProgram.startTime,
        endTime: currentProgram.endTime,
        isRecurring: currentProgram.isRecurring
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
      this.cdr.detectChanges();

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
          this.cdr.detectChanges();
          this.notifier.success('Banner image deleted successfully.');
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to delete banner image.');
        }
      });
    });
  }
}