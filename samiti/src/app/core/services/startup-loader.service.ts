import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StartupLoaderService {
  private readonly reverseGeocodeSettled = signal<boolean>(false);
  private readonly committeesSettled = signal<boolean>(false);
  private readonly committeesErrorMessage = signal<string | null>(null);
  private readonly committeesRetryTick = signal<number>(0);
  private readonly committeesRetrying = signal<boolean>(false);

  readonly isBlocking = computed<boolean>(() => {
    return !(this.reverseGeocodeSettled() && this.committeesSettled());
  });

  readonly startupErrorMessage = computed<string | null>(() => this.committeesErrorMessage());
  readonly committeesRetryTrigger = computed<number>(() => this.committeesRetryTick());
  readonly isCommitteesRetrying = computed<boolean>(() => this.committeesRetrying());

  markReverseGeocodeSettled(): void {
    this.reverseGeocodeSettled.set(true);
  }

  markCommitteesSettled(): void {
    this.committeesSettled.set(true);
    this.committeesErrorMessage.set(null);
    this.committeesRetrying.set(false);
  }

  markCommitteesFailed(message = 'Server error. Please try again in some time.'): void {
    this.committeesSettled.set(false);
    this.committeesErrorMessage.set(message);
    this.committeesRetrying.set(false);
  }

  requestCommitteesRetry(): void {
    this.committeesErrorMessage.set(null);
    this.committeesRetrying.set(true);
    this.committeesRetryTick.update((v) => v + 1);
  }

  markAllSettled(): void {
    this.reverseGeocodeSettled.set(true);
    this.committeesSettled.set(true);
    this.committeesErrorMessage.set(null);
    this.committeesRetrying.set(false);
  }
}