import { Injectable, signal } from '@angular/core';
import { EventVotingPayload } from './event-voting/event-voting.models';

@Injectable({
  providedIn: 'root'
})
export class EventDetailsStateService {
  public readonly eventData = signal<EventVotingPayload | null>(null);
}
