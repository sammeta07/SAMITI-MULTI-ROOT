import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { EventOverviewService } from '../event-overview/event-overview.service';
import { EventOverviewPayload } from '../event-overview/event-overview.models';
import { EventProgramsService } from './event-programs.service';
import { EventProgramEntry } from './event-programs.models';
import { EventDetailsStateService } from '../event-details-state.service';
import { NotifierService } from '../../../../../shared/notifier/notifier.service';
import { CreateProgramService } from '../../../../../components/dialog/create-program/create-program.service';
import { CreateProgramDialogComponent } from '../../../../../components/dialog/create-program/create-program.component';
import { ProgramOwnerService } from '../../program-owner/program-owner.service';
import { ProgramOwnerCandidate, ProgramOwnerPayload } from '../../program-owner/program-owner.models';
import { DashboardHierarchyTreeService } from '../../dashboard-hierarchy-tree/dashboard-hierarchy-tree.service';
import { EventVotingService } from '../event-voting/event-voting.service';
import { EventDirectAssignMember } from '../event-voting/event-voting.models';
import { getEventComputedStatus, parseLocalDate } from '../../../../../shared/services/event-status.util';
import { compareByScheduleAndStatus } from '../../../../../shared/services/program-schedule-sort.util';
import { formatProgramPriceLabel } from '../../../../../shared/services/program-price.util';

@Component({
  selector: 'app-event-programs',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    FormsModule
  ],
  templateUrl: './event-programs.html',
  styleUrl: './event-programs.scss'
})
export class EventProgramsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(NotifierService);
  private readonly programsService = inject(EventProgramsService);
  private readonly overviewService = inject(EventOverviewService);
  private readonly programOwnerService = inject(ProgramOwnerService);
  private readonly createProgramService = inject(CreateProgramService);
  private readonly votingService = inject(EventVotingService);
  private readonly hierarchyTreeService = inject(DashboardHierarchyTreeService);
  private readonly stateService = inject(EventDetailsStateService);
  private parentParamsSub?: Subscription;

  public eventPrograms: EventProgramEntry[] = [];
  public isLoadingPrograms = true;
  public readonly programsUpdatingVisibility = signal<Set<number>>(new Set<number>());
  public readonly programOwnerCandidates = signal<ProgramOwnerCandidate[]>([]);
  public readonly programsUpdatingOwner = signal<Set<number>>(new Set<number>());
  public readonly editingProgramOwnerIds = signal<Set<number>>(new Set<number>());
  public readonly focusedProgramOwnerInputIds = signal<Set<number>>(new Set<number>());
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

  public isProgramOwnerInputFocused(programId: number): boolean {
    return this.focusedProgramOwnerInputIds().has(programId);
  }

  public onProgramOwnerInputFocus(program: EventProgramEntry, trigger: MatAutocompleteTrigger): void {
    this.programOwnerInputText = { ...this.programOwnerInputText, [program.programId]: '' };
    this.focusedProgramOwnerInputIds.update((ids) => new Set(ids).add(program.programId));
    trigger.openPanel();
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
    this.focusedProgramOwnerInputIds.update((ids) => {
      const next = new Set(ids);
      next.delete(program.programId);
      return next;
    });
    this.programOwnerInputText = { ...this.programOwnerInputText, [program.programId]: program.ownerName || '' };
  }

  public onProgramOwnerSearch(programId: number, query: string): void {
    this.programOwnerInputText = { ...this.programOwnerInputText, [programId]: query };
  }

  public hasProgramOwnerSearch(programId: number): boolean {
    const value = this.programOwnerInputText[programId];
    return typeof value === 'string' && value.length > 0;
  }

  public clearProgramOwnerSearch(program: EventProgramEntry, trigger: MatAutocompleteTrigger, event: MouseEvent): void {
    event.preventDefault();
    this.programOwnerInputText = { ...this.programOwnerInputText, [program.programId]: '' };
    trigger.openPanel();
  }

  public onProgramOwnerSelect(program: EventProgramEntry, event: { option: { value: number | string } }): void {
    const userId = Number(event.option.value);
    const name = this.getFilteredCandidates(program).find((c) => c.userId === userId)?.name || '';
    this.programOwnerInputText = { ...this.programOwnerInputText, [program.programId]: this.toTitleCase(name) };
    this.focusedProgramOwnerInputIds.update((ids) => {
      const next = new Set(ids);
      next.delete(program.programId);
      return next;
    });
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

  public get userEventRole(): string {
    return String(this.eventData?.committeeRole || 'NONE').toUpperCase();
  }

  public get isEventMasterAdmin(): boolean {
    return this.userEventRole === 'COMMITTEE_MASTER_ADMIN';
  }

  public get isEventAdmin(): boolean {
    return this.userEventRole === 'COMMITTEE_ADMIN';
  }

  public get canManageProgramVisibility(): boolean {
    return this.isEventMasterAdmin || this.isEventAdmin;
  }

  public get canAssignProgramOwner(): boolean {
    return Boolean(this.eventData?.canAssignProgramOwner);
  }

  public getProgramStatus(program: EventProgramEntry): 'started' | 'upcoming' | 'completed' {
    return getEventComputedStatus(program.startDate, program.endDate).toLowerCase() as 'started' | 'upcoming' | 'completed';
  }

  public formatProgramPriceLabel(price: number | null | undefined): string {
    return formatProgramPriceLabel(price);
  }

  public shouldShowProgramRepeatIcon(program: EventProgramEntry): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = parseLocalDate(program.startDate);
    const end = parseLocalDate(program.endDate);

    return start !== null && start.getTime() <= today.getTime() &&
           end !== null && end.getTime() > today.getTime();
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
        this.stateService.headerData.update((header) =>
          header ? { ...header, programsCount: (header.programsCount ?? 0) + 1 } : header
        );
        this.loadEventPrograms(String(currentEvent.eventId));
        this.hierarchyTreeService.triggerHierarchyTreeRefresh();
      }
    });
  }

  public ngOnInit(): void {
    const parentParams$ = this.route.parent?.params;
    if (!parentParams$) return;

    this.parentParamsSub = parentParams$.subscribe(params => {
      const eventId = params['id'];
      if (eventId) {
        this.loadEventPrograms(eventId);
        this.loadEventOverview(eventId);
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

  public formatProgramDateTimeRange(startDate: string, startTime: string, endDate: string, endTime: string): string {
    return `${this.formatDisplayDate(startDate)}, ${this.formatProgramTimeWithPaddedHour(startTime)} To ` +
      `${this.formatDisplayDate(endDate)}, ${this.formatProgramTimeWithPaddedHour(endTime)}`;
  }

  public formatProgramTimeWithPaddedHour(value: string): string {
    const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
      return this.formatProgramTime(value);
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      return this.formatProgramTime(value);
    }

    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = String(hours % 12 || 12).padStart(2, '0');
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  public formatProgramTimeRange(startTime: string | undefined, endTime: string | undefined): string {
    if (!startTime || !endTime) {
      return '';
    }

    const startMatch = startTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    const endMatch = endTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

    if (!startMatch || !endMatch) {
      return `${this.formatProgramTime(startTime)} - ${this.formatProgramTime(endTime)}`;
    }

    const startHours = Number(startMatch[1]);
    const endHours = Number(endMatch[1]);
    const startMinutes = Number(startMatch[2]);
    const endMinutes = Number(endMatch[2]);

    if (startHours > 23 || endHours > 23 || startMinutes > 59 || endMinutes > 59) {
      return `${this.formatProgramTime(startTime)} - ${this.formatProgramTime(endTime)}`;
    }

    const startPeriod = startHours >= 12 ? 'PM' : 'AM';
    const endPeriod = endHours >= 12 ? 'PM' : 'AM';

    if (startPeriod === endPeriod) {
      const startDisplay = `${String(startHours % 12 || 12).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}`;
      const endDisplay = `${String(endHours % 12 || 12).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
      return `${startDisplay} - ${endDisplay} ${startPeriod}`;
    }

    const startDisplay = `${String(startHours % 12 || 12).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')} ${startPeriod}`;
    const endDisplay = `${String(endHours % 12 || 12).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')} ${endPeriod}`;
    return `${startDisplay} - ${endDisplay}`;
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

  public formatProgramDateRange(startDate: string, endDate: string): string {
    const startMatch = startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const endMatch = endDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (startMatch && endMatch && startMatch[1] === endMatch[1] && startMatch[2] === endMatch[2]) {
      return `${startMatch[3]} To ${this.formatDisplayDate(endDate)}`;
    }

    return `${this.formatDisplayDate(startDate)} To ${this.formatDisplayDate(endDate)}`;
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
      price: program.price ?? 0
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
    this.focusedProgramOwnerInputIds.update((ids) => {
      const next = new Set(ids);
      next.delete(programId);
      return next;
    });
  }

  private loadEventPrograms(eventId: string): void {
    this.isLoadingPrograms = true;
    this.programsService.getEventPrograms(eventId).subscribe({
      next: (data) => {
        const programs = data.entries ?? [];
        this.sortPrograms(programs);
        this.eventPrograms = programs;
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

  private sortPrograms(programs: EventProgramEntry[]): void {
    programs.sort(compareByScheduleAndStatus);
  }

  private loadEventOverview(eventId: string): void {
    this.overviewService.getEventOverview(eventId).subscribe({
      next: (data) => {
        this.stateService.eventOverview.set(data ?? null);
        this.programOwnerCandidates.set([]);
        if (data?.eventId) {
          this.loadDirectAssignMembers(data.eventId);
        } else {
          this.allCommitteeMembers.set([]);
        }
        if (this.canAssignProgramOwner && data?.eventId) {
          this.programOwnerService.getCandidates(data.eventId).subscribe({
            next: (candidates) => this.programOwnerCandidates.set(candidates),
            error: (err: HttpErrorResponse) => this.notifier.error(err?.error?.message || 'Failed to load committee members.')
          });
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
        this.notifier.error(err?.error?.errors?.[0]?.message || err?.error?.message || 'Failed to load program owner designations.');
      }
    });
  }

  public ngOnDestroy(): void {
    this.parentParamsSub?.unsubscribe();
  }
}
