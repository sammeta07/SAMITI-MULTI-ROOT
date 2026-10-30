import {
  Component,
  ElementRef,
  inject,
  OnInit,
  signal,
  computed,
  ViewChild,
  DestroyRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, finalize } from 'rxjs';

import { ProgramDetailsPayload } from './program-details.models';
import { ProgramDetailsService } from './program-details.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { DashboardHierarchyTreeService } from '../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { CreateProgramDialogComponent } from '../../../../components/dialog/create-program/create-program.component';
import { ImageAssetService } from '../../../../core/services/image-asset.service';
import { LoadingStateService } from '../../../../shared/services/loading-state.service';
import { getEventComputedStatus } from '../../../../shared/services/event-status.util';
import { formatProgramPriceLabel } from '../../../../shared/services/program-price.util';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { ProgramOwnerService } from '../program-owner/program-owner.service';
import { ProgramOwnerCandidate, ProgramOwnerPayload } from '../program-owner/program-owner.models';
import { ImageCropperDialogComponent } from '../../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';
import { TodoItem } from '../../models/todo.models';
import { TodoChecklistComponent } from '../todo-checklist/todo-checklist.component';

@Component({
  selector: 'app-program-details',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatSelectModule,
    MatExpansionModule,
    MatTabsModule,
    TodoChecklistComponent
  ],
  templateUrl: './program-details.html',
  styleUrl: './program-details.scss'
})
export class ProgramDetailsComponent implements OnInit {
  @ViewChild('programBannerFileInput') private readonly programBannerFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('programBannerSingleFileInput') private readonly programBannerSingleFileInput?: ElementRef<HTMLInputElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly programDetailsService = inject(ProgramDetailsService);
  private readonly programOwnerService = inject(ProgramOwnerService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly loadingState = inject(LoadingStateService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly MAX_BANNERS = 5;

  public readonly isLoading = signal<boolean>(false);
  public readonly isBannerUploading = signal<boolean>(false);
  public readonly isDeletingBanners = signal<boolean>(false);
  public readonly isSelectionMode = signal<boolean>(false);
  public readonly selectedBannerUrls = signal<Set<string>>(new Set<string>());
  public readonly programData = signal<ProgramDetailsPayload | null>(null);
  public readonly programOwnerCandidates = signal<ProgramOwnerCandidate[]>([]);
  public readonly isUpdatingOwner = signal<boolean>(false);
  public readonly isUpdatingVisibility = signal<boolean>(false);
  public selectedProgramTabIndex = 0;

  public readonly bannerCount = computed(() => this.programData()?.bannerImages?.length ?? 0);
  public readonly selectedBannerCount = computed(() => this.selectedBannerUrls().size);
  public readonly canUploadMoreBanners = computed(() => this.bannerCount() < this.MAX_BANNERS);
  public readonly canManageEvent = computed(() => Boolean(this.programData()?.canAssignOwner));
  public readonly canDeleteBanners = computed(() => this.canManageEvent());

  public readonly calculatedProgramStatus = computed<'started' | 'upcoming' | 'completed'>(() => {
    const program = this.programData();
    if (!program?.startDate) return 'completed';
    return getEventComputedStatus(program.startDate, program.endDate).toLowerCase() as 'started' | 'upcoming' | 'completed';
  });

  public readonly formattedPriceLabel = computed<string>(() => formatProgramPriceLabel(this.programData()?.price));

  public formatProgramHeaderDate(value: string): string {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return this.formatDisplayDate(value);
    }

    const month = Number(match[2]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${match[3]}-${months[month - 1] || match[2]}-${match[1]}`;
  }

  public formatProgramTime(value: string): string {
    const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
      return value;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      return value;
    }

    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = String(hours % 12 || 12).padStart(2, '0');
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  public readonly programOwnerDisplay = computed<string>(() => {
    const name = this.programData()?.ownerName;
    if (!name) return 'UNASSIGNED';
    return String(name).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  });

  public readonly formattedProgramTimeRange = computed<string>(() => {
    const start = this.programData()?.startTime;
    const end = this.programData()?.endTime;
    if (!start && !end) return '';
    if (start && !end) return this.formatTimeWithPeriod(start);
    if (!start && end) return this.formatTimeWithPeriod(end);

    const startParsed = this.parseTimeParts(start!);
    const endParsed = this.parseTimeParts(end!);
    if (!startParsed || !endParsed) return `${this.formatTimeWithPeriod(start)} – ${this.formatTimeWithPeriod(end)}`;

    const startPeriod = startParsed.hours >= 12 ? 'PM' : 'AM';
    const endPeriod = endParsed.hours >= 12 ? 'PM' : 'AM';

    if (startPeriod === endPeriod) {
      const startDisplay = `${String(startParsed.hours % 12 || 12).padStart(2, '0')}:${String(startParsed.minutes).padStart(2, '0')}`;
      const endDisplay = `${String(endParsed.hours % 12 || 12).padStart(2, '0')}:${String(endParsed.minutes).padStart(2, '0')}`;
      return `${startDisplay} – ${endDisplay} ${startPeriod}`;
    }

    return `${this.formatTimeWithPeriod(start)} – ${this.formatTimeWithPeriod(end)}`;
  });

  public readonly timePillStatusClass = computed<string>(() => {
    const program = this.programData();
    if (!program) return '';

    const status = this.calculatedProgramStatus();
    if (status === 'completed') return 'time-pill-status-completed';
    if (status === 'upcoming') return 'time-pill-status-upcoming';

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
      return `${this.formatDate(sDate)} – ${this.formatDate(eDate)}`;
    }
    if (sDate.getMonth() !== eDate.getMonth()) {
      return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${eDate.getFullYear()}`;
    }
    if (sDate.getDate() === eDate.getDate()) {
      return this.formatDate(sDate);
    }
    return `${startDay} – ${endDay} ${endMonth} ${eDate.getFullYear()}`;
  });

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
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

    this.programDetailsService
      .getProgramDetails(id)
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
          this.loadingState.end();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (data: ProgramDetailsPayload) => {
          this.programData.set(data ?? null);
          if (data?.canAssignOwner && data.eventId) {
            const eventId = data.eventId;
            this.programOwnerService
              .getCandidates(data.eventId)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (candidates) => {
                  if (this.programData()?.eventId === eventId) {
                    this.programOwnerCandidates.set(candidates);
                  }
                },
                error: (err: HttpErrorResponse) =>
                  this.notifier.error(err?.error?.message || 'Failed to load committee members.')
              });
          } else {
            this.programOwnerCandidates.set([]);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.notifier.error(err?.error?.message || 'Failed to load program details.');
          this.programData.set(null);
        }
      });
  }

  public onProgramTodosChange(todos: TodoItem[]): void {
    this.programData.update((current) => (current ? { ...current, todos } : current));
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
      const deleteCalls = selectedUrls.map((url) =>
        firstValueFrom(this.programDetailsService.deleteProgramBannerImage(currentProgram.programId, url))
      );
      const responses = await Promise.all(deleteCalls);
      const lastPayload = responses[responses.length - 1];

      this.programData.update((prev) =>
        prev
          ? {
              ...prev,
              bannerImages: lastPayload?.bannerImages ?? prev.bannerImages.filter((u) => !selectedUrls.includes(u)),
              programBanner: lastPayload ? lastPayload.bannerImages[0] || null : prev.programBanner
            }
          : prev
      );

      this.selectedBannerUrls.set(new Set<string>());
      this.isSelectionMode.set(false);
      this.notifier.success(`${selectedUrls.length} banner image(s) deleted successfully.`);
    } catch (err: any) {
      this.notifier.error(err?.error?.message || err?.message || 'Failed to delete banner images.');
    } finally {
      this.isDeletingBanners.set(false);
    }
  }

  public onAddSingleProgramBannerClick(): void {
    if (!this.programBannerSingleFileInput?.nativeElement) {
      this.notifier.error('File picker is not ready. Please try again.');
      return;
    }
    this.programBannerSingleFileInput.nativeElement.value = '';
    this.programBannerSingleFileInput.nativeElement.click();
  }

  public async onSingleProgramBannerFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const currentProgram = this.programData();
    if (!currentProgram?.programId) return;

    if (this.bannerCount() >= this.MAX_BANNERS) {
      this.notifier.warn(`Maximum ${this.MAX_BANNERS} banner images allowed. Delete existing banners first.`);
      return;
    }

    const croppedFile = await this.openProgramBannerCropDialog(file);
    if (!croppedFile) return;

    try {
      const uploadedAssets = await firstValueFrom(
        this.imageAssetService.uploadMultipleImagesForEventBanners([croppedFile])
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
      this.notifier.success('Banner image uploaded successfully.');
    } catch (err: any) {
      this.notifier.error(err?.error?.message || err?.message || 'Failed to upload program banner image.');
    }
  }

  public onDeleteProgramBanner(imageUrl: string): void {
    const currentProgram = this.programData();
    if (!currentProgram?.programId || !imageUrl) return;

    const dialogData: ConfirmDialogData = {
      title: 'Delete Banner Image',
      message: 'Are you sure you want to delete this banner image? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) return;

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

  public onCreateSubprogram(): void {
    const program = this.programData();
    if (!program?.eventId || !program.canCreateSubprogram) return;

    const dialogRef = this.dialog.open(CreateProgramDialogComponent, {
      position: { right: '0', top: '0' },
      height: '100%',
      width: '50%',
      autoFocus: true,
      disableClose: true,
      hasBackdrop: true,
      panelClass: 'slide-in-dialog',
      data: {
        eventId: program.eventId,
        parentProgramId: program.programId,
        address: program.address,
        startDate: program.startDate,
        endDate: program.endDate,
        startTime: program.startTime,
        endTime: program.endTime,
        visibility: program.visibility,
        price: program.price
      }
    });

    dialogRef.afterClosed().subscribe((createdProgram) => {
      if (!createdProgram) return;
      this.fetchProgramDetails(String(program.programId));
      this.notifier.success(`Subprogram "${createdProgram.programName}" created.`);
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
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
        price: currentProgram.price
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (!result) return;

      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.fetchProgramDetails(String(currentProgram.programId));
      this.notifier.success(`Program "${result.programName || currentProgram.programName}" updated successfully!`);
    });
  }

  public async onToggleProgramVisibility(): Promise<void> {
    const currentProgram = this.programData();
    if (!currentProgram?.canManageTodos || this.isUpdatingVisibility()) return;

    const nextVisibility = currentProgram.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE';
    this.isUpdatingVisibility.set(true);
    try {
      const visibility = await firstValueFrom(
        this.programDetailsService.updateProgramVisibility(currentProgram, nextVisibility)
      );
      this.programData.update((program) => program?.programId === currentProgram.programId
        ? { ...program, visibility }
        : program
      );
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      this.notifier.success(`Program is now ${visibility.toLowerCase()}.`);
    } catch (error) {
      this.notifier.error(
        error instanceof Error ? error.message : 'Failed to update program visibility.'
      );
    } finally {
      this.isUpdatingVisibility.set(false);
    }
  }

  public async onDeleteProgram(): Promise<void> {
    const currentProgram = this.programData();
    if (!currentProgram?.programId) return;

    const dialogData: ConfirmDialogData = {
      title: 'Delete Program',
      message: `Are you sure you want to delete "${currentProgram.programName}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result?.confirmed) return;

    this.isLoading.set(true);
    try {
      await firstValueFrom(this.programDetailsService.deleteProgram(currentProgram.programId));
      this.notifier.success(`Program "${currentProgram.programName}" deleted successfully.`);
      this.hierarchyTreeService.triggerHierarchyTreeRefresh();

      if (currentProgram.parentProgramId) {
        this.router.navigate(['/dashboard', 'program', currentProgram.parentProgramId]);
      } else if (currentProgram.eventId) {
        this.router.navigate(['/dashboard', 'event', currentProgram.eventId]);
      }
    } catch (err: any) {
      this.notifier.error(err?.error?.message || 'Failed to delete program.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async openProgramBannerCropDialog(file: File): Promise<File | null> {
    return firstValueFrom(
      this.dialog
        .open(ImageCropperDialogComponent, {
          width: 'min(92vw, 920px)',
          data: {
            file,
            title: 'Crop Banner Image',
            maintainAspectRatio: true,
            aspectRatio: 2
          }
        })
        .afterClosed()
    );
  }

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

  private parseTimeParts(timeStr: string): { hours: number; minutes: number } | null {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
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

  private formatDisplayDate(value: string): string {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return value;
    }

    const month = Number(match[2]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${match[3]}-${months[month - 1] || match[2]}-${match[1].slice(-2)}`;
  }

  private formatMonth(date: Date): string {
    return date.toLocaleString('en-US', { month: 'short' });
  }
}