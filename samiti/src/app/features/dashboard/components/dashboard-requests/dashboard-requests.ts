import { Component, inject, signal, OnInit, computed } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { MatIconModule } from '@angular/material/icon'; 
import { DashboardRequestsService } from './dashboard-requests.service';
import {
  ActionTakenOnCommitteeMembershipRequestItem,
  CancelSubmittedCommitteeMembershipRequestResponse,
  CommitteeMembershipRequestType,
  ReceivedCommitteeMembershipRequestItem,
  SentCommitteeMembershipRequestItem
} from './dashboard-requests.models';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';

@Component({
  selector: 'app-dashboard-requests',
  standalone: true, 
  imports: [CommonModule, MatIconModule],
  templateUrl: './dashboard-requests.html',
  styleUrl: './dashboard-requests.scss',
})
export class DashboardRequests implements OnInit {
  private readonly requestsService = inject(DashboardRequestsService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly activeTab = signal<'received' | 'history' | 'sent'>('sent'); 
  readonly requests = signal<ReceivedCommitteeMembershipRequestItem[]>([]); 
  readonly resolvedHistory = signal<ActionTakenOnCommitteeMembershipRequestItem[]>([]); 
  readonly sentRequests = signal<SentCommitteeMembershipRequestItem[]>([]); 
  readonly isLoading = signal<boolean>(false);

  readonly receivedMemberRequests = computed(() =>
    this.requests().filter((request) => request.requestType === 'COMMITTEE_MEMBER')
  );

  readonly receivedAdminRequests = computed(() =>
    this.requests().filter((request) => request.requestType === 'COMMITTEE_ADMIN')
  );

  readonly historyMemberRequests = computed(() =>
    this.resolvedHistory().filter((request) => request.requestType === 'COMMITTEE_MEMBER')
  );

  readonly historyAdminRequests = computed(() =>
    this.resolvedHistory().filter((request) => request.requestType === 'COMMITTEE_ADMIN')
  );

  readonly sentMemberRequests = computed(() =>
    this.sentRequests().filter((request) => request.requestType === 'COMMITTEE_MEMBER')
  );

  readonly sentAdminRequests = computed(() =>
    this.sentRequests().filter((request) => request.requestType === 'COMMITTEE_ADMIN')
  );

  readonly sectionExpanded = signal<Record<string, boolean>>({
    receivedAdmin: true,
    receivedMember: true,
    historyAdmin: true,
    historyMember: true,
    sentAdmin: true,
    sentMember: true
  });

  // 🚀 Track individual api loaders inside parallel streams
  private isIncomingLoading = false;
  private isHistoryLoading = false;
  private isSentLoading = false;

  ngOnInit() {
    // 🔥 Menu click hote hi teeno APIs ek sath background mein load ho jayengi
    this.loadAllRequestsParallel();
  }

  // 🚀 1. SMART SWITCH TAB: Ab tab badalne par koi API call nahi hogi, instant load hoga data signals se!
  switchTab(tab: 'received' | 'history' | 'sent') {
    this.activeTab.set(tab);
  }

  isSectionExpanded(sectionKey: string): boolean {
    return this.sectionExpanded()[sectionKey] ?? true;
  }

  toggleSection(sectionKey: string) {
    this.sectionExpanded.update((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey]
    }));
  }

  // 🚀 2. PARALLEL LOAD LOGIC: Handles master loading state across all three requests types
  loadAllRequestsParallel() {
    this.isLoading.set(true);
    this.isIncomingLoading = true;
    this.isHistoryLoading = true;
    this.isSentLoading = true;

    this.getReceivedRequests();
    this.getHistoryRequestsLogs();
    this.getSentRequestsList();
  }

  private checkGlobalLoaderState() {
    // Agar teeno APIs ka data aa chuka hai, tabhi loader screen se hatega
    if (!this.isIncomingLoading && !this.isHistoryLoading && !this.isSentLoading) {
      this.isLoading.set(false);
    }
  }

  getReceivedRequests() {
    this.requestsService.getReceivedCommitteeMembershipRequestsForAdminCommittees().subscribe({
      next: (response) => {
        this.requests.set(response ?? []);
        this.isIncomingLoading = false;
        this.checkGlobalLoaderState();
      },
      error: () => {
        this.isIncomingLoading = false;
        this.checkGlobalLoaderState();
      }
    });
  }

  getHistoryRequestsLogs() { 
    this.requestsService.getActionTakenOnCommitteeMembershipRequestsByLoggedInUser().subscribe({
      next: (response) => {
        this.resolvedHistory.set(response ?? []);
        this.isHistoryLoading = false;
        this.checkGlobalLoaderState();
      },
      error: () => {
        this.isHistoryLoading = false;
        this.checkGlobalLoaderState();
      }
    });
  }

  getSentRequestsList() {
    this.requestsService.getSentCommitteeMembershipRequestsByLoggedInUser().subscribe({
      next: (response) => {
        this.sentRequests.set(response ?? []);
        this.isSentLoading = false;
        this.checkGlobalLoaderState(); // 🚀 Ab loader sahi time par off hoga aur counter update ho jayega!
      },
      error: () => {
        this.isSentLoading = false;
        this.checkGlobalLoaderState();
      }
    });
  }

  // Action complete hone ke baad fir se data pure pipeline me sync hoga
  approveRequest(committeeId: number, userId: number) {
    const dialogData: ConfirmDialogData = {
      title: 'Accept Committee Membership Request',
      message: 'Are you sure you want to accept this committee membership request?',
      confirmText: 'Accept',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);

    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.requestsService.takeActionOnCommitteeMembershipRequest({ committeeId, targetUserId: userId, decisionAction: 'ACCEPTED' })
        .subscribe({ next: () => this.loadAllRequestsParallel() });
    });
  }

  rejectRequest(committeeId: number, userId: number) {
    const dialogData: ConfirmDialogData = {
      title: 'Reject Committee Membership Request',
      message: 'Are you sure you want to reject this committee membership request?',
      confirmText: 'Reject',
      cancelText: 'Cancel'
    };

    const dialogRef = this.confirmDialog.open(dialogData);

    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.requestsService.takeActionOnCommitteeMembershipRequest({ committeeId, targetUserId: userId, decisionAction: 'REJECTED' })
        .subscribe({ next: () => this.loadAllRequestsParallel() });
    });
  }

  cancelSentRequest(committeeId: number, committeeName: string) {
    const dialogData: ConfirmDialogData = {
      title: 'Cancel Submitted Committee Membership Request',
      message: `Are you sure you want to cancel your request for "${committeeName}"?`,
      confirmText: 'Cancel Request',
      cancelText: 'Keep Request'
    };

    const dialogRef = this.confirmDialog.open(dialogData);

    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.confirmed) {
        return;
      }

      this.requestsService.cancelSubmittedCommitteeMembershipRequest(committeeId).subscribe({
        next: () => {
          this.loadAllRequestsParallel();
        },
        error: () => {
          // Keep silent for now; existing loaders and refresh cycle handle recovery.
        }
      });
    });
  }

  getCommitteeInitial(committeeName: string | null | undefined): string {
    return String(committeeName || '').trim().charAt(0).toUpperCase() || '?';
  }

}