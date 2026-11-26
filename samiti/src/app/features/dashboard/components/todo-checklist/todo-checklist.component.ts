import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmDialogData } from '../../../../components/dialog/confirm/confirm-dialog.models';
import { ConfirmDialogService } from '../../../../components/dialog/confirm/confirm-dialog.service';
import { WholeRupeeDirective } from '../../../../shared/directives/whole-rupee.directive';
import { NotifierService } from '../../../../shared/notifier/notifier.service';
import { EditableTodoStatus, TodoAssignee, TodoItem, TodoParentType, TodoStatus } from '../../models/todo.models';
import { TodoChecklistService } from '../../services/todo-checklist.service';

@Component({
  selector: 'app-todo-checklist',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatAutocompleteModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTableModule,
    MatTooltipModule,
    WholeRupeeDirective
  ],
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
  public newExpenseAmount = '0';
  public isAdding = false;
  public readonly assigneeSearchText: Record<number, string> = {};
  public readonly pendingAssigneeUserIds: Record<number, number | null> = {};
  public readonly pendingIds = new Set<number>();
  public editingId: number | null = null;
  public editTitle = '';
  public editExpenseAmount = '0';
  public editCompleted = false;
  public editStatus: EditableTodoStatus = 'NEW';
  public statusDropdownOpen = false;

  public get tableColumns(): string[] {
    const columns = ['number', 'title'];
    if (this.parentType === 'TASK') columns.push('expense');
    columns.push('status');
    if (this.items.some((item) => item.canManage)) columns.push('actions');
    return columns;
  }

  public canManageItem(item: TodoItem): boolean {
    return item.canManage;
  }

  public canUpdateStatusItem(item: TodoItem): boolean {
    return item.canUpdateStatus;
  }

  public toggleCompleted(item: TodoItem, event: MatCheckboxChange): void {
    if (!this.canUpdateStatusItem(item) || this.editingId !== item.id || this.pendingIds.has(item.id)) return;
    this.editCompleted = event.checked;
    this.editStatus = event.checked
      ? 'COMPLETED'
      : this.editStatus === 'COMPLETED' ? 'NEW' : this.editStatus;
  }

  public startEditing(item: TodoItem): void {
    if (!this.canManageItem(item) || this.pendingIds.has(item.id)) return;
    this.editingId = item.id;
    this.editTitle = this.toSentenceCase(item.title);
    this.editExpenseAmount = String(Math.round(Number(item.expenseAmount || 0)));
    this.editCompleted = item.isCompleted;
    this.editStatus = this.normalizeStatus(item.status);
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
    this.editExpenseAmount = '0';
    this.editCompleted = false;
    this.editStatus = 'NEW';
    this.statusDropdownOpen = false;
  }

  public saveExpansionChanges(item: TodoItem): void {
    const title = this.toSentenceCase(this.editTitle);
    if (!this.canManageItem(item) || this.editingId !== item.id || !title || title.length > 255 || this.pendingIds.has(item.id)) return;
    if (this.parentType === 'TASK' && !this.isValidExpenseAmount(this.editExpenseAmount)) {
      this.notifier.error('Enter a valid non-negative checklist expense amount.');
      return;
    }
    const expenseAmount = this.parentType === 'TASK' ? this.normalizeExpenseAmount(this.editExpenseAmount) : item.expenseAmount;
    if (title === item.title && this.editStatus === this.normalizeStatus(item.status) && expenseAmount === item.expenseAmount) {
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
    if (!this.canManageItem(item) || this.editingId !== item.id || !title || title.length > 255 || this.pendingIds.has(item.id)) return;
    if (this.parentType === 'TASK' && !this.isValidExpenseAmount(this.editExpenseAmount)) {
      this.notifier.error('Enter a valid non-negative checklist expense amount.');
      return;
    }
    const expenseAmount = this.parentType === 'TASK' ? this.normalizeExpenseAmount(this.editExpenseAmount) : item.expenseAmount;
    if (title === item.title && this.editStatus === this.normalizeStatus(item.status) && expenseAmount === item.expenseAmount) {
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

  public add(value = this.newTitle): void {
    const title = this.toSentenceCase(value);
    if (!title || title.length > 255 || this.isAdding) return;
    if (this.parentType === 'TASK' && !this.isValidExpenseAmount(this.newExpenseAmount)) {
      this.notifier.error('Enter a valid non-negative checklist expense amount.');
      return;
    }

    this.isAdding = true;
    const expenseAmount = this.parentType === 'TASK' ? this.normalizeExpenseAmount(this.newExpenseAmount) : '0';
    this.service.create(this.parentType, this.parentId, title, expenseAmount).subscribe({
      next: (item) => {
        this.items = [...this.items, item];
        this.itemsChange.emit(this.items);
        this.newTitle = '';
        this.newExpenseAmount = '0';
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
    return String(Math.round(Number(value || 0)));
  }

  public normalizeStatus(status: TodoStatus): EditableTodoStatus {
    return status === 'PENDING' ? 'NEW' : status;
  }

  public getStatusLabel(status: TodoStatus): string {
    return this.normalizeStatus(status).replace(/_/g, ' ');
  }

  public onEditStatusChange(status: EditableTodoStatus): void {
    this.editStatus = status;
    this.editCompleted = status === 'COMPLETED';
  }

  public getAssigneeSearchText(item: TodoItem): string {
    return Object.prototype.hasOwnProperty.call(this.assigneeSearchText, item.id)
      ? this.assigneeSearchText[item.id]
      : this.getSelectedAssignee(item)?.name || 'Unassigned';
  }

  public getSelectedAssigneeId(item: TodoItem): number | null {
    return Object.prototype.hasOwnProperty.call(this.pendingAssigneeUserIds, item.id)
      ? this.pendingAssigneeUserIds[item.id]
      : item.assignedUserId;
  }

  public getSelectedAssignee(item: TodoItem): TodoAssignee | undefined {
    const userId = this.getSelectedAssigneeId(item);
    if (userId === null) return undefined;
    return this.assignees.find((assignee) => Number(assignee.userId) === Number(userId))
      ?? (item.assignedUserId === userId && item.assignedUserName
        ? { userId, name: item.assignedUserName }
        : undefined);
  }

  public getFilteredAssignees(item: TodoItem): TodoAssignee[] {
    const search = (this.assigneeSearchText[item.id] || '').trim().toLowerCase();
    const assignees = [...this.assignees];
    if (
      item.assignedUserId !== null &&
      item.assignedUserName &&
      !assignees.some((assignee) => Number(assignee.userId) === Number(item.assignedUserId))
    ) {
      assignees.push({ userId: item.assignedUserId, name: item.assignedUserName });
    }

    return assignees
      .filter((assignee) =>
        !search ||
        assignee.name.toLowerCase().includes(search) ||
        (assignee.email || '').toLowerCase().includes(search)
      )
      .sort((left, right) =>
        Number(Boolean(right.roleIcon || right.roleColor || right.isWinner)) -
          Number(Boolean(left.roleIcon || left.roleColor || left.isWinner)) ||
        Number(Number(right.userId) === Number(this.getSelectedAssigneeId(item))) -
          Number(Number(left.userId) === Number(this.getSelectedAssigneeId(item))) ||
        left.name.localeCompare(right.name)
      );
  }

  public onAssigneeSearch(itemId: number, value: string): void {
    this.assigneeSearchText[itemId] = value;
  }

  public onAssigneeFocus(itemId: number, trigger: MatAutocompleteTrigger): void {
    this.assigneeSearchText[itemId] = '';
    trigger.openPanel();
  }

  public onAssigneeAutocompleteClosed(item: TodoItem): void {
    if (this.pendingIds.has(item.id)) return;
    this.assigneeSearchText[item.id] = this.getSelectedAssignee(item)?.name || 'Unassigned';
  }

  public clearAssigneeSearch(
    itemId: number,
    trigger: MatAutocompleteTrigger,
    event: MouseEvent
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.assigneeSearchText[itemId] = '';
    trigger.openPanel();
  }

  public onAssigneeSelected(item: TodoItem, event: MatAutocompleteSelectedEvent): void {
    if (!this.canManageItem(item) || this.pendingIds.has(item.id)) return;
    const selectedValue = event.option.value;
    const ownerUserId = selectedValue === '' ? null : Number(selectedValue);
    if (ownerUserId === this.getSelectedAssigneeId(item)) {
      this.assigneeSearchText[item.id] = this.getSelectedAssignee(item)?.name || 'Unassigned';
      return;
    }

    const selectedAssignee = ownerUserId === null
      ? null
      : this.assignees.find((assignee) => Number(assignee.userId) === ownerUserId)
        ?? (Number(item.assignedUserId) === ownerUserId && item.assignedUserName
          ? { userId: ownerUserId, name: item.assignedUserName }
          : null);
    if (ownerUserId !== null && !selectedAssignee) {
      this.notifier.error('Selected assignee is not a member of this committee.');
      this.assigneeSearchText[item.id] = item.assignedUserName || 'Unassigned';
      return;
    }

    this.pendingAssigneeUserIds[item.id] = ownerUserId;
    this.assigneeSearchText[item.id] = selectedAssignee?.name || 'Unassigned';
    this.pendingIds.add(item.id);
    this.service.assign(item.id, ownerUserId).subscribe({
      next: (updated) => {
        this.items = this.items.map((entry) => (entry.id === updated.id ? updated : entry));
        this.itemsChange.emit(this.items);
        this.pendingIds.delete(item.id);
        delete this.pendingAssigneeUserIds[item.id];
        this.assigneeSearchText[item.id] = updated.assignedUserName || 'Unassigned';
      },
      error: (error) => {
        this.pendingIds.delete(item.id);
        delete this.pendingAssigneeUserIds[item.id];
        this.assigneeSearchText[item.id] = item.assignedUserName || 'Unassigned';
        this.notifier.error(error?.error?.errors?.[0]?.message || error?.message || 'Failed to assign checklist item.');
      }
    });
  }

  public getAssigneeInitials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  }

  public isValidExpenseAmount(value: string): boolean {
    const amount = String(value ?? '').trim();
    return /^(?:0|[1-9]\d{0,9})$/.test(amount);
  }

  private normalizeExpenseAmount(value: string): string {
    return String(Math.round(Number(value)));
  }

  public setStatus(item: TodoItem, event: Event): void {
    if (!this.canUpdateStatusItem(item) || this.pendingIds.has(item.id)) return;
    const select = event.target as HTMLSelectElement;
    const status = select.value as EditableTodoStatus;
    const previousStatus = this.normalizeStatus(item.status);
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
    if (!this.canManageItem(item) || this.pendingIds.has(item.id)) return;
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
    if (!this.canManageItem(item) || this.pendingIds.has(item.id)) return;

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
