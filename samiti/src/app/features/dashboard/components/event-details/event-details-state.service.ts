import { Injectable, signal } from '@angular/core';
import { EventDetailsPayload } from './event-details.models';

@Injectable({
  providedIn: 'root'
})
export class EventDetailsStateService {
  public readonly eventData = signal<EventDetailsPayload | null>(null);
  public readonly eventId = signal<number | null>(null);
}