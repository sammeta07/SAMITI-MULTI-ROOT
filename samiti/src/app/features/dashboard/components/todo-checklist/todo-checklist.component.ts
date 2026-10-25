import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { TodoAssignee, TodoItem, TodoParentType, TodoStatus } from '../../models/todo.models';
import { TodoChecklistService } from '../../services/todo-checklist.service';

@Component({
  selector: 'app-todo-checklist',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCheckboxModule, MatIconModule, MatTableModule, MatTooltipModule],
  host: {
    '[class.todo-checklist-table-view]': 'tableView'
  },
  templateUrl: './todo-checklist.component.html',
  styleUrl: './todo-checklist.component.scss'
})
export class TodoChecklistComponent {
  private readonly service = inject(TodoChecklistService);
  private readonly notifier = inject(NotifierService);
  private readonly confirmDialog = inject(ConfirmDialogService);

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
  public editCompleted = false;

  public get tableColumns(): string[] {
    return this.canManage || this.canToggle
      ? ['number', 'title', 'status', 'actions']
      : ['number', 'title', 'status'];
  }

  public toggleCompleted(item: TodoItem, event: MatCheckboxChange): void {
    if (!this.canToggle || this.editingId !== item.id || this.pendingIds.has(item.id)) return;
    this.editCompleted = event.checked;
  }

  public startEditing(item: TodoItem): void {
    if (!this.canManage || this.pendingIds.has(item.id)) return;
    this.editingId = item.id;
    this.editTitle = this.toSentenceCase(item.title);
    this.editCompleted = item.isCompleted;
  }

  public toSentenceCase(value: string): string {
    if (!value) return '';
    return value.trim().toLowerCase().replace(
      /(^|[.!?]\s+|\n\s*)(\p{L})/gu,
      (_, boundary: string, letter: string) => `${boundary}${letter.toUpperCase()}`
    );
  }

  public cancelEditing(): void {
    this.editingId = null;
    this.editTitle = '';
    this.editCompleted = false;
  }

  public saveChanges(item: TodoItem): void {
    const title = this.toSentenceCase(this.editTitle);
    if (!this.canManage || this.editingId !== item.id || !title || title.length > 255 || this.pendingIds.has(item.id)) return;
    if (title === item.title && this.editCompleted === item.isCompleted) {
      this.cancelEditing();
      return;
    }

    this.pendingIds.add(item.id);
    this.service.updateTodo(item.id, title, this.editCompleted).subscribe({
      next: (updated) => {
        this.items = this.items.map((entry) => (entry.id === updated.id ? updated : entry));
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
    const title = this.toSentenceCase(this.newTitle);
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
        this.items = this.items.map((entry) => (entry.id === updated.id ? updated : entry));
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
        this.items = this.items.map((entry) => (entry.id === updated.id ? updated : entry));
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

    const dialogData: ConfirmDialogData = {
      title: 'Delete checklist item?',
      message: 'Are you sure you want to permanently delete this checklist item?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      iconType: 'warning',
      highlightText: this.toSentenceCase(item.title)
    };

    this.confirmDialog.open(dialogData).afterClosed().subscribe((result) => {
      if (!result?.confirmed || this.pendingIds.has(item.id)) return;
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
    });
  }
}
