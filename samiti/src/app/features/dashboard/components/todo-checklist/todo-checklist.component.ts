import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
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
  imports: [CommonModule, FormsModule, MatCheckboxModule, MatExpansionModule, MatIconModule, MatTableModule, MatTooltipModule],
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
  @Input() expansionView = false;
  @Input() hideTableAddForm = false;
  @Output() readonly itemsChange = new EventEmitter<TodoItem[]>();
  @Output() readonly itemAdded = new EventEmitter<void>();

  public newTitle = '';
  public newExpenseAmount = '0.00';
  public isAdding = false;
  public readonly pendingIds = new Set<number>();
  public editingId: number | null = null;
  public editTitle = '';
  public editExpenseAmount = '0.00';
  public editCompleted = false;
  public editStatus: TodoStatus = 'PENDING';
  public statusDropdownOpen = false;

  public get tableColumns(): string[] {
    const columns = ['number', 'title'];
    if (this.parentType === 'TASK') columns.push('expense');
    columns.push('status');
    if (this.canManage || this.canToggle) columns.push('actions');
    return columns;
  }

  public toggleCompleted(item: TodoItem, event: MatCheckboxChange): void {
    if (!this.canToggle || this.editingId !== item.id || this.pendingIds.has(item.id)) return;
    this.editCompleted = event.checked;
  }

  public startEditing(item: TodoItem): void {
    if (!this.canManage || this.pendingIds.has(item.id)) return;
    this.editingId = item.id;
    this.editTitle = this.toSentenceCase(item.title);
    this.editExpenseAmount = item.expenseAmount || '0.00';
    this.editCompleted = item.isCompleted;
    this.editStatus = item.status;
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
    this.editExpenseAmount = '0.00';
    this.editCompleted = false;
    this.editStatus = 'PENDING';
    this.statusDropdownOpen = false;
  }

  public saveExpansionChanges(item: TodoItem): void {
    const title = this.toSentenceCase(this.editTitle);
    if (!this.canManage || this.editingId !== item.id || !title || title.length > 255 || this.pendingIds.has(item.id)) return;
    if (this.parentType === 'TASK' && !this.isValidExpenseAmount(this.editExpenseAmount)) {
      this.notifier.error('Enter a valid non-negative checklist expense amount.');
      return;
    }
    const expenseAmount = this.parentType === 'TASK' ? this.normalizeExpenseAmount(this.editExpenseAmount) : item.expenseAmount;
    if (title === item.title && this.editStatus === item.status && expenseAmount === item.expenseAmount) {
      this.cancelEditing();
      return;
    }

    this.pendingIds.add(item.id);
    this.service.updateTodoDetails(item.id, title, this.editStatus, expenseAmount).subscribe({
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

  public saveChanges(item: TodoItem): void {
    const title = this.toSentenceCase(this.editTitle);
    if (!this.canManage || this.editingId !== item.id || !title || title.length > 255 || this.pendingIds.has(item.id)) return;
    if (this.parentType === 'TASK' && !this.isValidExpenseAmount(this.editExpenseAmount)) {
      this.notifier.error('Enter a valid non-negative checklist expense amount.');
      return;
    }
    const expenseAmount = this.parentType === 'TASK' ? this.normalizeExpenseAmount(this.editExpenseAmount) : item.expenseAmount;
    if (title === item.title && this.editCompleted === item.isCompleted && expenseAmount === item.expenseAmount) {
      this.cancelEditing();
      return;
    }

    this.pendingIds.add(item.id);
    this.service.updateTodo(item.id, title, this.editCompleted, expenseAmount).subscribe({
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

  public add(value = this.newTitle): void {
    const title = this.toSentenceCase(value);
    if (!title || title.length > 255 || this.isAdding) return;
    if (this.parentType === 'TASK' && !this.isValidExpenseAmount(this.newExpenseAmount)) {
      this.notifier.error('Enter a valid non-negative checklist expense amount.');
      return;
    }

    this.isAdding = true;
    const expenseAmount = this.parentType === 'TASK' ? this.normalizeExpenseAmount(this.newExpenseAmount) : '0.00';
    this.service.create(this.parentType, this.parentId, title, expenseAmount).subscribe({
      next: (item) => {
        this.items = [...this.items, item];
        this.itemsChange.emit(this.items);
        this.newTitle = '';
        this.newExpenseAmount = '0.00';
        this.isAdding = false;
        this.itemAdded.emit();
      },
      error: (error) => {
        this.isAdding = false;
        this.notifier.error(error?.error?.errors?.[0]?.message || error?.message || 'Failed to add checklist item.');
      }
    });
  }

  public formatExpenseAmount(value: string): string {
    return Number(value || 0).toFixed(2);
  }

  private isValidExpenseAmount(value: string): boolean {
    const amount = String(value ?? '').trim();
    return /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amount) &&
      Number(amount) <= 9_999_999_999.99;
  }

  private normalizeExpenseAmount(value: string): string {
    return Number(value).toFixed(2);
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
