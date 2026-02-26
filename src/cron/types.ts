export interface CronTask {
  id: string;
  name: string;
  schedule: string;
  description: string;
  task: string;
  enabled: boolean;
  notify?: string[];
}

/** Input for addTask and config — name derived from id, description from task if omitted */
export type CronTaskInput = Omit<CronTask, 'name' | 'description' | 'enabled'> & {
  name?: string;
  description?: string;
  enabled?: boolean;
};
