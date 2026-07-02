export type NotifierType = 'success' | 'error' | 'warn' | 'info';

export interface NotifierMessage {
  id: string;
  type: NotifierType;
  message: string;
  title?: string;
  timeoutMs?: number;
  createdAt: number;
}
