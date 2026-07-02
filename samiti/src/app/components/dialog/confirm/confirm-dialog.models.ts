export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export interface ConfirmDialogResponse {
  confirmed: boolean;
}
