import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { EventDetailsStateService } from '../event-details-state.service';
import { EventDetailsPayload, EventPerson } from '../event-details.models';

@Component({
  selector: 'app-event-people',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './event-people.html',
  styleUrl: './event-people.scss'
})
export class EventPeopleComponent {
  private readonly stateService = inject(EventDetailsStateService);

  public get eventData(): EventDetailsPayload | null {
    return this.stateService.eventData();
  }

  public get eventAdmins(): EventPerson[] {
    const participants = this.eventData?.eventParticipants ?? [];
    return participants.filter((p) => p.designation.includes('ADMIN')).map((p) => ({
      id: Number(p.userId),
      name: p.name,
      email: p.email,
      photo: p.photo || null
    }));
  }

  public get eventMembers(): EventPerson[] {
    const participants = this.eventData?.eventParticipants ?? [];
    return participants.filter((p) => !p.designation.includes('ADMIN')).map((p) => ({
      id: Number(p.userId),
      name: p.name,
      email: p.email,
      photo: p.photo || null
    }));
  }
}