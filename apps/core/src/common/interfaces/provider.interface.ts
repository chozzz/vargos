export interface Provider {
  initialize?(): Promise<void>;
  healthCheck?(): Promise<boolean>;
}
