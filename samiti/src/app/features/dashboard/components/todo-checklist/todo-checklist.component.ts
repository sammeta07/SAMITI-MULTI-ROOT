import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { TodoAssignee, TodoItem, TodoParentType, TodoStatus } from '../../models/todo.models';
import { TodoChecklistService } from '../../services/todo-checklist.service';

@Component({
  selector: 'app-todo-checklist',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCheckboxModule, MatIconModule, MatTableModule],
  template: `
    <section class="todo-checklist">
      @if (!tableView && (items.length > 0 || canManage)) {
        <div class="todo-heading">Checklist</div>
      }
      @if (tableView) {
        <div class="todo-table-container">
          <table mat-table [dataSource]="items" class="todo-table">
            <ng-container matColumnDef="number">
              <th mat-header-cell *matHeaderCellDef>#</th>
              <td mat-cell *matCellDef="let item; let i = index">{{ i + 1 }}</td>
            </ng-container>

            <ng-container matColumnDef="title">
              <th mat-header-cell *matHeaderCellDef>Checklist item</th>
              <td mat-cell *matCellDef="let item">
                @if (editingId === item.id) {
                  <input
                    class="todo-edit-input"
                    [(ngModel)]="editTitle"
                    [ngModelOptions]="{ standalone: true }"
                    [disabled]="pendingIds.has(item.id)"
                    [attr.aria-label]="'Edit ' + item.title"
                    (keydown.enter)="saveTitle(item)"
                    (keydown.escape)="cancelEditing()"
                  />
                } @else {
                  <span class="todo-title" [class.todo-completed]="item.isCompleted">{{ item.title }}</span>
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let item">
                <span
                  class="todo-status-label"
                  [class.todo-status-completed]="item.status === 'COMPLETED'"
                  [class.todo-status-pending]="item.status !== 'COMPLETED'"
                >
                  {{ item.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING' }}
                </span>
              </td>
            </ng-container>

            @if (canManage || canToggle) {
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Action</th>
                <td mat-cell *matCellDef="let item">
                  <div class="todo-actions">
                    @if (canToggle) {
                      <mat-checkbox
                        [checked]="item.isCompleted"
                        [disabled]="pendingIds.has(item.id)"
                        [aria-label]="'Mark ' + item.title + ' as completed'"
                        (change)="toggleCompleted(item, $event)"
                      />
                    }
                    @if (canManage) {
                      @if (editingId === item.id) {
                        <button
                          type="button"
                          class="todo-delete"
                          (click)="saveTitle(item)"
                          [disabled]="pendingIds.has(item.id)"
                          aria-label="Save checklist item"
                        >
                          <mat-icon>check</mat-icon>
                        </button>
                        <button
                          type="button"
                          class="todo-delete"
                          (click)="cancelEditing()"
                          [disabled]="pendingIds.has(item.id)"
                          aria-label="Cancel editing checklist item"
                        >
                          <mat-icon>close</mat-icon>
                        </button>
                      } @else {
                        <button
                          type="button"
                          class="todo-delete"
                          (click)="startEditing(item)"
                          [disabled]="pendingIds.has(item.id)"
                          aria-label="Edit checklist item"
                        >
                          <mat-icon>edit</mat-icon>
                        </button>
                        <button
                          type="button"
                          class="todo-delete"
                          (click)="remove(item)"
                          [disabled]="pendingIds.has(item.id)"
                          aria-label="Delete checklist item"
                        >
                          <mat-icon>delete_outline</mat-icon>
                        </button>
                      }
                    }
                  </div>
                </td>
              </ng-container>
            }

            <tr mat-header-row *matHeaderRowDef="tableColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: tableColumns"></tr>
          </table>
        </div>
      } @else {
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
      }
      @if (canManage) {
        <form class="todo-add-form" (ngSubmit)="add()">
           <input
             name="todoTitle"
             [(ngModel)]="newTitle"
             maxlength="255"
             placeholder="Add a checklist item"
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
    .todo-table-container { max-height: 320px; overflow: auto; }
    .todo-table { width: 100%; background: transparent; border: 1px solid #cbd5e1; border-collapse: collapse; }
    .todo-table th, .todo-table td { border: 1px solid #cbd5e1; padding: 8px 10px; }
    .todo-table th { position: sticky; top: 0; z-index: 1; background: #f8fafc; color: #64748b; font-size: .7rem; font-weight: 700; }
    .todo-table td { color: #334155; font-size: .75rem; }
    .todo-table .mat-column-number { width: 48px; text-align: center; }
    .todo-table .mat-column-title { min-width: 180px; }
    .todo-table .mat-column-status { width: 150px; }
    .todo-table .mat-column-actions { width: 140px; }
    .todo-actions { display: flex; align-items: center; gap: 4px; }
    .todo-status-label { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #f1f5f9; color: #475569; font-size: .68rem; font-weight: 600; white-space: nowrap; }
    .todo-status-pending { background: #fef3c7; color: #92400e; }
    .todo-status-completed { background: #dcfce7; color: #166534; }
    .todo-row, .todo-add-form { display: flex; align-items: center; gap: 7px; min-height: 28px; }
    .todo-status, .todo-assignee { max-width: 125px; min-width: 0; height: 26px; padding: 0 5px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; color: #475569; font-size: .68rem; }
    .todo-title { flex: 1; color: #334155; font-size: .74rem; overflow-wrap: anywhere; }
    .todo-edit-input { width: 100%; min-width: 0; height: 28px; padding: 0 6px; border: 1px solid #94a3b8; border-radius: 4px; font: inherit; }
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
  @Input() tableView = false;
  @Output() readonly itemsChange = new EventEmitter<TodoItem[]>();

  public newTitle = '';
  public isAdding = false;
  public readonly pendingIds = new Set<number>();
  public editingId: number | null = null;
  public editTitle = '';

  public get tableColumns(): string[] {
    return this.canManage || this.canToggle
      ? ['number', 'title', 'status', 'actions']
      : ['number', 'title', 'status'];
  }

  public toggleCompleted(item: TodoItem, event: MatCheckboxChange): void {
    if (!this.canToggle || this.pendingIds.has(item.id)) {
      event.source.checked = item.isCompleted;
      return;
    }

    this.pendingIds.add(item.id);
    this.service.setCompleted(item.id, event.checked).subscribe({
      next: (updated) => {
        this.items = this.items.map((entry) => entry.id === updated.id ? updated : entry);
        this.itemsChange.emit(this.items);
        this.pendingIds.delete(item.id);
      },
      error: (error) => {
        event.source.checked = item.isCompleted;
        this.pendingIds.delete(item.id);
        this.notifier.error(error?.error?.errors?.[0]?.message || error?.message || 'Failed to update checklist item.');
      }
    });
  }

  public startEditing(item: TodoItem): void {
    if (!this.canManage || this.pendingIds.has(item.id)) return;
    this.editingId = item.id;
    this.editTitle = item.title;
  }

  public cancelEditing(): void {
    this.editingId = null;
    this.editTitle = '';
  }

  public saveTitle(item: TodoItem): void {
    const title = this.editTitle.trim();
    if (!this.canManage || this.editingId !== item.id || !title || title.length > 255 || this.pendingIds.has(item.id)) return;
    if (title === item.title) {
      this.cancelEditing();
      return;
    }

    this.pendingIds.add(item.id);
    this.service.updateTitle(item.id, title).subscribe({
      next: (updated) => {
        this.items = this.items.map((entry) => entry.id === updated.id ? updated : entry);
        this.itemsChange.emit(this.items);
        this.pendingIds.delete(item.id);
        this.cancelEditing();
      },
      error: (error) => {
        this.pendingIds.delete(item.id);
        this.notifier.error(error?.error?.errors?.[0]?.message || error?.message || 'Failed to edit checklist item.');
      }
    });
  }

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
