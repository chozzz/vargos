/**
 * Cron service — schedules and fires periodic tasks.
 *
 * Callable: cron.search, cron.add, cron.remove, cron.update, cron.run
 *
 * Concurrency: one active run per task (via activeTasks set).
 * Lock released on agent.onCompleted for cron sessions.
 *
 * Delivery: after each run, sends result to task's notify targets.
 * Heartbeat OK responses (HEARTBEAT_OK) are pruned silently.
 * Subagent deferral: if subagents are still running, the agent runtime may
 * defer delivery until the parent run completes.
 */
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig, CronAddParams, CronUpdateParams } from '../../services/config/index.js';
export declare class CronService {
    private readonly bus;
    private readonly config;
    private jobs;
    private ephemeralIds;
    private activeTasks;
    private beforeFireHooks;
    private unsubscribeCompleted?;
    private readonly cronDir;
    constructor(bus: Bus, config: AppConfig, cronDir?: string);
    start(): Promise<void>;
    stop(): void;
    search(params: EventMap['cron.search']['params']): Promise<EventMap['cron.search']['result']>;
    add(params: CronAddParams): Promise<void>;
    remove(params: EventMap['cron.remove']['params']): Promise<void>;
    update(params: CronUpdateParams): Promise<void>;
    run(params: EventMap['cron.run']['params']): Promise<void>;
    private addJob;
    private startAll;
    private stopAll;
    private fire;
    private onAgentCompleted;
    private executeTask;
    private parseMarkdownTask;
    private serializeMarkdownTask;
    private loadTasksFromDisk;
    private writeTaskToDisk;
    private deleteTaskFromDisk;
    private registerHeartbeat;
}
export declare function boot(bus: Bus): Promise<{
    stop(): void;
}>;
//# sourceMappingURL=index.d.ts.map