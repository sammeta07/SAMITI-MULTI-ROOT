import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { TodoAssignee, TodoItem, TodoParentType, TodoStatus } from '../../models/todo.models';
import { TodoChecklistService } from '../../services/todo-checklist.service';

@Component({
  selector: 'app-todo-checklist',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
    <section class="todo-checklist">
      @if (items.length > 0 || canManage) {
        <div class="todo-heading">Checklist</div>
      }
      @for (item of items; track item.id) {
        <div class="todo-row">
          <select
            class="todo-status"
            [value]="item.status"
            [disabled]="!canToggle || pendingIds.has(item.id)"
            [attr.aria-label]="'Status for ' + item.title"
            (change)="setStatus(item, $event)"
          >
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <span class="todo-title" [class.todo-completed]="item.isCompleted">{{ item.title }}</span>
          @if (canManage) {
            <select
              class="todo-assignee"
              [value]="item.assignedUserId ?? ''"
              [disabled]="pendingIds.has(item.id)"
              [attr.aria-label]="'Assignee for ' + item.title"
              (change)="assign(item, $event)"
            >
              <option value="">Unassigned</option>
              @for (assignee of assignees; track assignee.userId) {
                <option [value]="assignee.userId">{{ assignee.name }}</option>
              }
            </select>
          } @else {
            <span class="todo-assignee-name">{{ item.assignedUserName || 'Unassigned' }}</span>
          }
          @if (canManage) {
            <button type="button" class="todo-delete" (click)="remove(item)" [disabled]="pendingIds.has(item.id)" aria-label="Delete checklist item">
              <mat-icon>delete_outline</mat-icon>
            </button>
          }
        </div>
      }
      @if (canManage) {
        <form class="todo-add-form" (ngSubmit)="add()">
          <input
            name="todoTitle"
            [(ngModel)]="newTitle"
            maxlength="255"
            placeholder="Add checklist item"
            aria-label="New checklist item"
          />
          <button type="submit" [disabled]="!newTitle.trim() || isAdding" aria-label="Add checklist item">
            <mat-icon>{{ isAdding ? 'hourglass_top' : 'add' }}</mat-icon>
          </button>
        </form>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .todo-checklist { padding: 2px 8px 8px; }
    .todo-heading { margin: 2px 0 4px; color: #64748b; font-size: .67rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .todo-row, .todo-add-form { display: flex; align-items: center; gap: 7px; min-height: 28px; }
    .todo-status, .todo-assignee { max-width: 125px; min-width: 0; height: 26px; padding: 0 5px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #475569; font-size: .68rem; }
    .todo-title { flex: 1; color: #334155; font-size: .74rem; overflow-wrap: anywhere; }
    .todo-completed { color: #94a3b8; text-decoration: line-through; }
    .todo-assignee-name { max-width: 125px; overflow: hidden; color: #64748b; font-size: .68rem; text-overflow: ellipsis; white-space: nowrap; }
    .todo-delete, .todo-add-form button { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: #64748b; cursor: pointer; }
    .todo-delete:hover, .todo-add-form button:hover { background: #f1f5f9; color: #0f172a; }
    .todo-delete mat-icon, .todo-add-form mat-icon { width: 18px; height: 18px; font-size: 18px; }
    .todo-add-form { margin-top: 4px; }
    .todo-add-form input { flex: 1; min-width: 0; height: 27px; padding: 0 8px; border: 1px solid #cbd5e1; border-radius: 5px; font: inherit; font-size: .73rem; }
    .todo-add-form input:focus { border-color: #0284c7; outline: 2px solid #bae6fd; }
    button:disabled, input:disabled { cursor: not-allowed; opacity: .55; }
  `]
})
export class TodoChecklistComponent {
  private readonly service = inject(TodoChecklistService);
  private readonly notifier = inject(NotifierService);

  @Input({ required: true }) parentType!: TodoParentType;
  @Input({ required: true }) parentId!: number;
  @Input() items: TodoItem[] = [];
  @Input() assignees: TodoAssignee[] = [];
  @Input() canManage = false;
  @Input() canToggle = false;
  @Output() readonly itemsChange = new EventEmitter<TodoItem[]>();

  public newTitle = '';
  public isAdding = false;
  public readonly pendingIds = new Set<number>();

  public add(): void {
    const title = this.newTitle.trim();
    if (!title || title.length > 255 || this.isAdding) return;

    this.isAdding = true;
    this.service.create(this.parentType, this.parentId, title).subscribe({
      next: (item) => {
        this.items = [...this.items, item];
        this.itemsChange.emit(this.items);
        this.newTitle = '';
        this.isAdding = false;
      },
      error: (error) => {
        this.isAdding = false;
        this.notifier.error(error?.error?.errors?.[0]?.message || error?.message || 'Failed to add checklist item.');
      }
    });
  }

  public setStatus(item: TodoItem, event: Event): void {
    if (!this.canToggle || this.pendingIds.has(item.id)) return;
    const select = event.target as HTMLSelectElement;
    const status = select.value as TodoStatus;
    const previousStatus = item.status;
    this.pendingIds.add(item.id);

    this.service.setStatus(item.id, status).subscribe({
      next: (updated) => {
        this.items = this.items.map((entry) => entry.id === updated.id ? updated : entry);
        this.itemsChange.emit(this.items);
        this.pendingIds.delete(item.id);
      },
      error: (error) => {
        select.value = previousStatus;
        this.pendingIds.delete(item.id);
        this.notifier.error(error?.error?.errors?.[0]?.message || error?.message || 'Failed to update checklist item.');
      }
    });
  }

  public assign(item: TodoItem, event: Event): void {
    if (!this.canManage || this.pendingIds.has(item.id)) return;
    const select = event.target as HTMLSelectElement;
    const previousAssigneeId = item.assignedUserId;
    const ownerUserId = select.value ? Number(select.value) : null;
    this.pendingIds.add(item.id);

    this.service.assign(item.id, ownerUserId).subscribe({
      next: (updated) => {
        this.items = this.items.map((entry) => entry.id === updated.id ? updated : entry);
        this.itemsChange.emit(this.items);
        this.pendingIds.delete(item.id);
      },
      error: (error) => {
        select.value = previousAssigneeId === null ? '' : String(previousAssigneeId);
        this.pendingIds.delete(item.id);
        this.notifier.error(error?.error?.errors?.[0]?.message || error?.message || 'Failed to assign checklist item.');
      }
    });
  }

  public remove(item: TodoItem): void {
    if (!this.canManage || this.pendingIds.has(item.id)) return;
    this.pendingIds.add(item.id);

    this.service.delete(item.id).subscribe({
      next: () => {
        this.items = this.items.filter((entry) => entry.id !== item.id);
        this.itemsChange.emit(this.items);
        this.pendingIds.delete(item.id);
      },
      error: (error) => {
        this.pendingIds.delete(item.id);
        this.notifier.error(error?.error?.errors?.[0]?.message || error?.message || 'Failed to remove checklist item.');
      }
    });
  }
}
