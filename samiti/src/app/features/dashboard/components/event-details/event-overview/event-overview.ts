import { Component, ElementRef, inject, ViewChild, signal, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EventOverviewService } from './event-overview.service';
import { EventOverviewPayload } from './event-overview.models';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { ConfirmDialogService } from '../../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../../components/dialog/confirm/confirm-dialog.models';
import { EventDetailsStateService } from '../event-details-state.service';
import { EventProgramsService } from '../event-programs/event-programs.service';
import { EventProgramEntry } from '../event-programs/event-programs.models';
import { CreateProgramService } from '../../../../../components/dialog/create-program/create-program.service';
import { DashboardHierarchyTreeService } from '../../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { ImageAssetService } from '../../../../../core/services/image-asset.service';
import { ImageCropperDialogComponent } from '../../../../../shared/components/image-cropper-dialog/image-cropper-dialog.component';
import { CreateProgramDialogComponent } from '../../../../../components/dialog/create-program/create-program.component';
import { ProgramOwnerService } from '../../program-owner/program-owner.service';
import { ProgramOwnerCandidate, ProgramOwnerPayload } from '../../program-owner/program-owner.models';
import { EventVotingService } from '../event-voting/event-voting.service';
import { EventDirectAssignMember } from '../event-voting/event-voting.models';

@Component({
  selector: 'app-event-overview',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule
  ],
  templateUrl: './event-overview.html',
  styleUrl: './event-overview.scss'
})
export class EventOverviewComponent implements OnInit {
  @ViewChild('bannerFileInput') private readonly bannerFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('bannerSingleFileInput') private readonly bannerSingleFileInput?: ElementRef<HTMLInputElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly overviewService = inject(EventOverviewService);
  private readonly imageAssetService = inject(ImageAssetService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly stateService = inject(EventDetailsStateService);
  private readonly programsService = inject(EventProgramsService);
  private readonly programOwnerService = inject(ProgramOwnerService);
  private readonly votingService = inject(EventVotingService);
  private readonly createProgramService = inject(CreateProgramService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly cdr = inject(ChangeDetectorRef);

  public readonly isDeletingBanners = signal<boolean>(false);
  public readonly isSelectionMode = signal<boolean>(false);
  public readonly selectedBannerUrls = signal<Set<string>>(new Set<string>());
  public readonly skeletonRows5 = [1, 2, 3, 4, 5];
  public eventPrograms: EventProgramEntry[] = [];
  public isLoadingPrograms = true;
  public readonly programsUpdatingVisibility = signal<Set<number>>(new Set<number>());
  public readonly programOwnerCandidates = signal<ProgramOwnerCandidate[]>([]);
  public readonly programsUpdatingOwner = signal<Set<number>>(new Set<number>());
  public readonly editingProgramOwnerIds = signal<Set<number>>(new Set<number>());
  public readonly allCommitteeMembers = signal<EventDirectAssignMember[]>([]);
  public programOwnerInputText: Record<number, string | number | null> = {};

  public readonly displayProgramOwnerName = (value: string | number | null): string => {
    if (value === null) return 'UNASSIGNED';
    if (typeof value === 'string') return value;
    const owner = this.allCommitteeMembers().find((member) => Number(member.userId) === value);
    return this.toTitleCase(owner?.name || String(value));
  };

  public getRoleColorClass(role?: string | null): string {
    switch ((role || '').toUpperCase()) {
      case 'COMMITTEE_MASTER_ADMIN': return 'role-master';
      case 'COMMITTEE_ADMIN': return 'role-admin';
      case 'COMMITTEE_MEMBER': return 'role-member';
      default: return 'role-default';
    }
  }

  public getRoleColor(role?: string | null): string {
    switch ((role || '').toUpperCase()) {
      case 'COMMITTEE_MASTER_ADMIN': return '#ef4444';
      case 'COMMITTEE_ADMIN': return '#22c55e';
      case 'COMMITTEE_MEMBER': return '#3b82f6';
      default: return '#64748b';
    }
  }

  public getInitials(name?: string | null): string {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return trimmed.slice(0, 2).toUpperCase();
  }

  public isOwnerUnassigned(program: EventProgramEntry): boolean {
    return !program.ownerName && program.ownerUserId === null;
  }

  public getProgramOwnerCandidate(program: EventProgramEntry): EventDirectAssignMember | undefined {
    if (program.ownerUserId === null || program.ownerUserId === undefined) return undefined;
    return this.allCommitteeMembers().find((member) => Number(member.userId) === program.ownerUserId);
  }

  public getProgramOwnerIconColor(program: EventProgramEntry): string {
    const owner = this.getProgramOwnerCandidate(program);
    return owner?.color || this.getRoleColor(owner?.committeeRole);
  }

  public isEditingProgramOwner(programId: number): boolean {
    return this.editingProgramOwnerIds().has(programId);
  }

  public editProgramOwner(program: EventProgramEntry): void {
    if (!this.canAssignProgramOwner || this.programsUpdatingOwner().has(program.programId)) {
      return;
    }

    this.programOwnerInputText = {
      ...this.programOwnerInputText,
      [program.programId]: this.toTitleCase(program.ownerName || '')
    };
    const editingProgramIds = new Set(this.editingProgramOwnerIds());
    editingProgramIds.add(program.programId);
    this.editingProgramOwnerIds.set(editingProgramIds);
  }

  public cancelEditProgramOwner(program: EventProgramEntry): void {
    const editingProgramIds = new Set(this.editingProgramOwnerIds());
    editingProgramIds.delete(program.programId);
    this.editingProgramOwnerIds.set(editingProgramIds);
    this.programOwnerInputText = { ...this.programOwnerInputText, [program.programId]: program.ownerName || '' };
  }

  public onProgramOwnerSearch(programId: number, query: string): void {
    this.programOwnerInputText = { ...this.programOwnerInputText, [programId]: query };
  }

  public onProgramOwnerSelect(program: EventProgramEntry, event: { option: { value: number | string } }): void {
    const userId = Number(event.option.value);
    const name = this.getFilteredCandidates(program).find((c) => c.userId === userId)?.name || '';
    this.programOwnerInputText = { ...this.programOwnerInputText, [program.programId]: this.toTitleCase(name) };
    this.updateProgramOwner(program, Number.isInteger(userId) && userId > 0 ? userId : null);
  }

  private toTitleCase(value: string): string {
    return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
  }

  public getFilteredCandidates(program: EventProgramEntry): EventDirectAssignMember[] {
    const inputValue = this.programOwnerInputText[program.programId];
    const query = typeof inputValue === 'string' ? inputValue.toLowerCase().trim() : '';
    const members = this.allCommitteeMembers()
      .filter((m) => (m.committeeRole || '').toUpperCase() !== 'COMMITTEE_MASTER_ADMIN')
      .map((m) => ({
        userId: Number(m.userId),
        name: m.name,
        email: m.email,
        photo: m.photo ?? null,
        committeeRole: m.committeeRole,
        isWinner: false,
        icon: m.icon ?? null,
        color: m.color ?? null,
        roleIcon: '',
        roleColor: ''
      }));
    const filtered = query
      ? members.filter((m) => (m.name || '').toLowerCase().includes(query) || (m.email || '').toLowerCase().includes(query))
      : members;
    return filtered.sort((a, b) => {
      const aIcon = Boolean(a.icon);
      const bIcon = Boolean(b.icon);
      if (aIcon !== bIcon) return aIcon ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

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

  public get canCreateProgram(): boolean {
    if (this.isEventMasterAdmin || this.isEventAdmin) return true;
    const designation = (this.eventData?.myDesignation?.name || '').trim().toLowerCase();
    return designation === 'adhyaksha' || designation === 'upadhyaksha';
  }

  public get canManageProgramVisibility(): boolean {
    return this.isEventMasterAdmin || this.isEventAdmin;
  }

  public get canAssignProgramOwner(): boolean {
    return Boolean(this.eventData?.canAssignProgramOwner);
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

  public get fallbackInitial(): string {
    const name = this.eventData?.eventDisplayName || this.eventData?.eventName || '';
    return name ? name.charAt(0).toUpperCase() : 'E';
  }

  public onCreateProgram(): void {
    const currentEvent = this.eventData;
    if (!currentEvent?.eventId) {
      this.notifier.error('No event available for program creation');
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
        eventId: currentEvent.eventId,
        address: this.stateService.headerData()?.committeeAddress || ''
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      document.body.classList.remove('dialog-open');
      if (result) {
        this.notifier.success(`Program "${result.programName}" created successfully!`);
        this.loadEventPrograms(String(currentEvent.eventId));
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      }
    });
  }

  public ngOnInit(): void {
    const parentParams$ = this.route.parent?.params;
    if (!parentParams$) return;

    parentParams$.subscribe(params => {
      const eventId = params['id'];
      if (eventId) {
        this.loadEventOverview(eventId);
        this.loadEventPrograms(eventId);
      }
    });
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
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  public formatDisplayDate(value: string): string {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return value;
    }

    const year = match[1];
    const month = Number(match[2]);
    const day = match[3];

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month - 1] || match[2];

    return `${day}-${monthName}-${year}`;
  }

  public updateProgramVisibility(program: EventProgramEntry, visible: boolean): void {
    if (!this.canManageProgramVisibility || this.programsUpdatingVisibility().has(program.programId)) {
      return;
    }

    const pendingProgramIds = new Set(this.programsUpdatingVisibility());
    pendingProgramIds.add(program.programId);
    this.programsUpdatingVisibility.set(pendingProgramIds);

    this.createProgramService.updateProgram({
      programId: program.programId,
      eventId: program.eventId,
      programName: program.programName,
      address: program.address || undefined,
      visibility: visible ? 'VISIBLE' : 'HIDDEN',
      startDate: program.startDate,
      endDate: program.endDate,
      startTime: program.startTime,
      endTime: program.endTime,
      isRecurring: program.isRecurring
    }).subscribe({
      next: (updatedProgram) => {
        this.eventPrograms = this.eventPrograms.map((entry) =>
          entry.programId === program.programId
            ? { ...entry, visibility: updatedProgram.visibility }
            : entry
        );
        this.finishVisibilityUpdate(program.programId);
      },
      error: (err: HttpErrorResponse) => {
        this.finishVisibilityUpdate(program.programId);
        this.notifier.error(err?.error?.message || 'Failed to update program visibility.');
      }
    });
  }

  private finishVisibilityUpdate(programId: number): void {
    const pendingProgramIds = new Set(this.programsUpdatingVisibility());
    pendingProgramIds.delete(programId);
    this.programsUpdatingVisibility.set(pendingProgramIds);
  }

  public updateProgramOwner(program: EventProgramEntry, ownerUserId: number | null): void {
    if (!this.canAssignProgramOwner || this.programsUpdatingOwner().has(program.programId)) {
      return;
    }

    const previousOwnerUserId = program.ownerUserId ?? null;
    this.eventPrograms = this.eventPrograms.map((entry) =>
      entry.programId === program.programId ? { ...entry, ownerUserId } : entry
    );

    const pendingProgramIds = new Set(this.programsUpdatingOwner());
    pendingProgramIds.add(program.programId);
    this.programsUpdatingOwner.set(pendingProgramIds);

    this.programOwnerService.assignOwner(program.programId, ownerUserId).subscribe({
      next: (owner: ProgramOwnerPayload) => {
        this.eventPrograms = this.eventPrograms.map((entry) =>
          entry.programId === owner.programId
            ? {
                ...entry,
                ownerUserId: owner.ownerUserId,
                ownerName: owner.ownerName,
                ownerAssignedBy: owner.ownerAssignedBy,
                ownerAssignedAt: owner.ownerAssignedAt
              }
            : entry
        );
        this.programOwnerInputText[program.programId] = owner.ownerName || '';
        this.finishOwnerUpdate(program.programId);
        this.notifier.success(owner.ownerName ? `Program owner assigned to ${owner.ownerName}.` : 'Program owner cleared.');
      },
      error: (err: HttpErrorResponse) => {
        this.eventPrograms = this.eventPrograms.map((entry) =>
          entry.programId === program.programId ? { ...entry, ownerUserId: previousOwnerUserId } : entry
        );
        this.programOwnerInputText[program.programId] = program.ownerName || '';
        this.finishOwnerUpdate(program.programId);
        this.notifier.error(err?.error?.message || 'Failed to update program owner.');
      }
    });
  }

  private finishOwnerUpdate(programId: number): void {
    const pendingProgramIds = new Set(this.programsUpdatingOwner());
    pendingProgramIds.delete(programId);
    this.programsUpdatingOwner.set(pendingProgramIds);

    const editingProgramIds = new Set(this.editingProgramOwnerIds());
    editingProgramIds.delete(programId);
    this.editingProgramOwnerIds.set(editingProgramIds);
  }

  private loadEventPrograms(eventId: string): void {
    this.isLoadingPrograms = true;
    this.programsService.getEventPrograms(eventId).subscribe({
      next: (data) => {
        this.eventPrograms = data.entries ?? [];
        this.isLoadingPrograms = false;
        this.eventPrograms.forEach((program) => {
          this.programOwnerInputText[program.programId] = program.ownerName || '';
        });
      },
      error: (err: HttpErrorResponse) => {
        this.eventPrograms = [];
        this.isLoadingPrograms = false;
        this.notifier.error(err?.error?.message || 'Failed to load event programs.');
      }
    });
  }

  private loadEventOverview(eventId: string): void {
    this.overviewService.getEventOverview(eventId).subscribe({
      next: (data) => {
        this.stateService.eventOverview.set(data ?? null);
        this.programOwnerCandidates.set([]);
        if (this.canAssignProgramOwner && data?.eventId) {
          this.programOwnerService.getCandidates(data.eventId).subscribe({
            next: (candidates) => this.programOwnerCandidates.set(candidates),
            error: (err: HttpErrorResponse) => this.notifier.error(err?.error?.message || 'Failed to load committee members.')
          });
          this.loadDirectAssignMembers(data.eventId);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.notifier.error(err?.error?.message || 'Failed to load event overview.');
        this.stateService.eventOverview.set(null);
      }
    });
  }

  private loadDirectAssignMembers(eventId: number): void {
    this.votingService.getDirectAssignMembers(eventId).subscribe({
      next: (members) => {
        this.allCommitteeMembers.set(members ?? []);
      },
      error: (err: HttpErrorResponse) => {
        this.allCommitteeMembers.set([]);
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
      this.stateService.eventOverview.set({ ...currentEvent, bannerImages: (result as any).bannerImages });
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
      this.stateService.eventOverview.set({ ...currentEvent, bannerImages: (result as any).bannerImages });
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
          this.stateService.eventOverview.set({ ...currentEvent, bannerImages: payload.bannerImages });
          this.cdr.detectChanges();
          this.notifier.success('Banner image deleted successfully.');
        },
        error: (err: HttpErrorResponse) => { this.notifier.error(err?.error?.message || 'Failed to delete banner image.'); }
      });
    });
  }
}
