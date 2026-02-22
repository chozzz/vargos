export interface WebhookHook {
  id: string;
  token: string;
  transform?: string;   // module path for custom transform
  notify?: string[];     // channel:userId targets
  description?: string;
}

export interface WebhookStatus {
  id: string;
  description?: string;
  lastFired?: number;
  totalFires: number;
}
