export interface CronTask {
  id: string;
  name: string;
  schedule: string;
  description: string;
  task: string;
  enabled: boolean;
  builtIn?: boolean;
}
