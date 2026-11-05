import { Injectable, signal } from '@angular/core';
import { EventVotingPayload } from './event-voting/event-voting.models';
import { EventResultsPayload } from './event-voting/event-voting.models';
import { EventOverviewPayload } from './event-overview/event-overview.models';
import { EventDetailsHeaderPayload } from './event-overview/event-overview.models';

@Injectable({
  providedIn: 'root'
})
export class EventDetailsStateService {
  public readonly eventData = signal<EventVotingPayload | null>(null);
  public readonly eventResults = signal<EventResultsPayload | null>(null);
  public readonly eventOverview = signal<EventOverviewPayload | null>(null);
  public readonly headerData = signal<EventDetailsHeaderPayload | null>(null);

  public incrementTaskCounts(isParentTask: boolean): void {
    this.headerData.update((header) =>
      header
        ? {
            ...header,
            tasksCount: (header.tasksCount ?? 0) + 1,
            parentTasksCount: (header.parentTasksCount ?? 0) + (isParentTask ? 1 : 0)
          }
        : header
    );
  }

  public decrementTaskCounts(isParentTask: boolean, taskCount = 1): void {
    this.headerData.update((header) =>
      header
        ? {
            ...header,
            tasksCount: Math.max(0, (header.tasksCount ?? 0) - taskCount),
            parentTasksCount: Math.max(0, (header.parentTasksCount ?? 0) - (isParentTask ? 1 : 0))
          }
        : header
    );
  }

  public reset(): void {
    this.eventData.set(null);
    this.eventResults.set(null);
    this.eventOverview.set(null);
    this.headerData.set(null);
  }
}
