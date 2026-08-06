import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { EventPeopleService } from './event-people.service';
import { EventPeoplePayload, EventPerson } from './event-people.models';
import { Subscription } from 'rxjs';

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
export class EventPeopleComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly peopleService = inject(EventPeopleService);
private parentParamsSub?: Subscription;
  public eventData: EventPeoplePayload | null = null;

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

ngOnInit(): void {
    const parentParams$ = this.route.parent?.params;
    if (!parentParams$) return;

    this.parentParamsSub = parentParams$.subscribe(params => {
      const eventId = params['id'];
      if (eventId) {
        this.loadEventPeople(eventId);
      }
    });
  }

  private loadEventPeople(eventId: string): void {
    this.peopleService.getEventPeople(eventId).subscribe({
      next: (data) => {
        this.eventData = data ?? null;
      },
      error: (err: any) => {
        this.eventData = null;
      }
    });
  }


  ngOnDestroy(): void {
    this.parentParamsSub?.unsubscribe();
  }
}