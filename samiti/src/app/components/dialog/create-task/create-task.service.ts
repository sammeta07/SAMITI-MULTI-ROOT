import { Injectable } from '@angular/core';
import { EventTaskEntry } from '../../../features/dashboard/components/event-details/event-tasks/event-tasks.models';
import { NotifierService } from '../../../shared/notifier/notifier.service';
import { EventTasksService } from '../../../features/dashboard/components/event-details/event-tasks/event-tasks.service';

export interface CreateTaskRequest {
  eventId: number;
  taskName: string;
  parentTaskId?: number | null;
}

export interface CreateTaskModel {
  taskId: number;
  eventId: number;
  taskName: string;
  parentTaskId: number | null;
  status?: string | null;
  ownerUserId?: number | null;
  ownerName?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class CreateTaskService {
  constructor(
    private notifier: NotifierService,
    private eventTasksService: EventTasksService
  ) {}

  async createTask(request: CreateTaskRequest): Promise<CreateTaskModel> {
    const { eventId, taskName, parentTaskId } = request;
    
    // Validate input
    if (!Number.isInteger(eventId) || eventId <= 0) {
      this.notifier.error('Event ID is missing. Please reopen the task dialog.');
      throw new Error('Invalid event ID');
    }
    
    if (!taskName || taskName.trim().length === 0) {
      this.notifier.error('Task name is required.');
      throw new Error('Task name is required');
    }
    
    // Create the task entry
    const taskEntry: CreateTaskModel = {
      taskId: Date.now(),
      eventId,
      taskName: taskName.trim(),
      parentTaskId: parentTaskId ?? null,
      status: 'created',
      ownerUserId: null,
      ownerName: null
    };
    
    // Submit to the event tasks service
    await this.eventTasksService.createEventTask({
      eventId,
      taskName: taskName.trim(),
      parentTaskId: parentTaskId
    });
    
    return taskEntry;
  }
}
