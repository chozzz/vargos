export type { WebhookHook } from '../config/pi-config.js';

export interface WebhookStatus {
  id: string;
  description?: string;
  lastFired?: number;
  totalFires: number;
}
