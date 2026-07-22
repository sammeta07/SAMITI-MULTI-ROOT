export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  iconType?: 'warning' | 'error' | 'info' | 'success';
  highlightText?: string;
}

export interface ConfirmDialogResponse {
  confirmed: boolean;
}
