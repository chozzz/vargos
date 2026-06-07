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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { CronJob } from 'cron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import { CronTaskSchema } from '../../services/config/schemas/cron.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { getDataPaths } from '../../lib/paths.js';
import { generateId } from '../../lib/id.js';
import { paginate } from '../../lib/paginate.js';
import { cronSessionKey, parseSessionKey } from '../../lib/session-key.js';
import { parseFrontmatter, serializeFrontmatter } from '../../lib/frontmatter.js';
import { isWithinActiveHours, isHeartbeatContentEffectivelyEmpty, stripHeartbeatToken, } from './heartbeat.js';
const log = createLogger('cron');
// ── CronService ───────────────────────────────────────────────────────────────
let CronService = (() => {
    let _instanceExtraInitializers = [];
    let _search_decorators;
    let _add_decorators;
    let _remove_decorators;
    let _update_decorators;
    let _run_decorators;
    return class CronService {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _search_decorators = [register('cron.search', {
                    description: 'Search scheduled cron tasks.',
                    schema: z.object({ query: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) }),
                })];
            _add_decorators = [register('cron.add', {
                    description: 'Add a new scheduled cron task.',
                    schema: z.object({
                        name: z.string(),
                        schedule: z.string(),
                        task: z.string(),
                        notify: z.array(z.string()).optional(),
                    }),
                })];
            _remove_decorators = [register('cron.remove', {
                    description: 'Remove a scheduled cron task.',
                    schema: z.object({ id: z.string() }),
                })];
            _update_decorators = [register('cron.update', {
                    description: 'Update a scheduled cron task.',
                    schema: z.object({
                        id: z.string(),
                        name: z.string().optional(),
                        schedule: z.string().optional(),
                        task: z.string().optional(),
                        enabled: z.boolean().optional(),
                        notify: z.array(z.string()).optional(),
                    }),
                })];
            _run_decorators = [register('cron.run', {
                    description: 'Manually trigger a cron task immediately.',
                    schema: z.object({ id: z.string() }),
                })];
            __esDecorate(this, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _add_decorators, { kind: "method", name: "add", static: false, private: false, access: { has: obj => "add" in obj, get: obj => obj.add }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _remove_decorators, { kind: "method", name: "remove", static: false, private: false, access: { has: obj => "remove" in obj, get: obj => obj.remove }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _run_decorators, { kind: "method", name: "run", static: false, private: false, access: { has: obj => "run" in obj, get: obj => obj.run }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        bus = __runInitializers(this, _instanceExtraInitializers);
        config;
        jobs = new Map();
        ephemeralIds = new Set();
        activeTasks = new Set();
        beforeFireHooks = new Map();
        unsubscribeCompleted;
        cronDir;
        constructor(bus, config, cronDir) {
            this.bus = bus;
            this.config = config;
            this.cronDir = cronDir ?? getDataPaths().cronDir;
        }
        async start() {
            // Load tasks from disk
            const diskTasks = await this.loadTasksFromDisk();
            for (const task of diskTasks) {
                this.addJob(task);
            }
            // Register heartbeat if task exists (loaded from disk)
            if (this.jobs.has('heartbeat')) {
                this.registerHeartbeat();
            }
            this.startAll();
            this.unsubscribeCompleted = this.bus.on('agent.onCompleted', (payload) => this.onAgentCompleted(payload));
        }
        stop() {
            this.stopAll();
            this.unsubscribeCompleted?.();
        }
        // ── Callable handlers ─────────────────────────────────────────────────────
        async search(params) {
            const { query } = params;
            const all = Array.from(this.jobs.values())
                .filter(e => !this.ephemeralIds.has(e.task.id))
                .map(e => e.task);
            const filtered = query
                ? all.filter(t => t.name.includes(query) || t.id.includes(query) || t.task.includes(query))
                : all;
            // page/limit are omitted by untyped JSON-RPC callers — paginate() defaults them to 1/20.
            return paginate(filtered, params.page, params.limit);
        }
        async add(params) {
            const id = generateId('cron');
            if (this.jobs.has(id)) {
                throw new Error(`Cron task already exists: ${id}`);
            }
            const task = { ...params, id, enabled: true };
            // Write to disk
            await this.writeTaskToDisk(task);
            // Register in-memory
            this.addJob(task);
            this.jobs.get(task.id).job.start();
            log.info(`task added: ${task.name} (${task.id})`);
        }
        async remove(params) {
            const entry = this.jobs.get(params.id);
            if (!entry)
                return;
            const isEphemeral = this.ephemeralIds.has(params.id);
            entry.job.stop();
            this.jobs.delete(params.id);
            this.ephemeralIds.delete(params.id);
            this.activeTasks.delete(params.id);
            // Delete from disk (only persistent tasks)
            if (!isEphemeral) {
                await this.deleteTaskFromDisk(params.id);
            }
            log.info(`task removed: ${params.id}`);
        }
        async update(params) {
            const entry = this.jobs.get(params.id);
            if (!entry)
                throw new Error(`No task with id: ${params.id}`);
            const updates = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
            const updated = { ...entry.task, ...updates };
            if (params.schedule && params.schedule !== entry.task.schedule) {
                entry.job.stop();
                const job = new CronJob(updated.schedule, () => this.fire(params.id), null, updated.enabled, 'UTC');
                this.jobs.set(params.id, { task: updated, job });
            }
            else {
                entry.task = updated;
                if (params.enabled === false)
                    entry.job.stop();
                else if (params.enabled === true)
                    entry.job.start();
            }
            // Write to disk (only persistent tasks)
            const isEphemeral = this.ephemeralIds.has(params.id);
            if (!isEphemeral) {
                await this.writeTaskToDisk(updated);
            }
            log.info(`task updated: ${params.id}`);
        }
        async run(params) {
            const entry = this.jobs.get(params.id);
            if (!entry)
                throw new Error(`No task with id: ${params.id}`);
            // Fire without awaiting — long-running tasks must not block the RPC socket
            this.executeTask(entry.task).catch(err => log.error(`manual run failed: ${params.id}: ${toMessage(err)}`));
        }
        // ── Internal scheduling ───────────────────────────────────────────────────
        addJob(task, opts) {
            const job = new CronJob(task.schedule, () => this.fire(task.id), null, false);
            this.jobs.set(task.id, { task, job });
            if (opts?.ephemeral)
                this.ephemeralIds.add(task.id);
        }
        startAll() {
            let count = 0;
            for (const { task, job } of this.jobs.values()) {
                if (task.enabled) {
                    log.debug(`starting job: ${task.id} (${task.schedule})`);
                    job.start();
                    count++;
                }
                else {
                    log.debug(`skipping disabled job: ${task.id}`);
                }
            }
            log.info(`${count} jobs started`);
        }
        stopAll() {
            for (const { job } of this.jobs.values())
                job.stop();
        }
        fire(id) {
            if (this.activeTasks.has(id)) {
                log.info(`skipping fire — task still active: ${id}`);
                return;
            }
            const entry = this.jobs.get(id);
            if (!entry) {
                log.warn(`fire() called for unknown task: ${id}`);
                return;
            }
            if (!entry.task.enabled) {
                log.debug(`task disabled, not firing: ${id}`);
                return;
            }
            // Check activeHours for all tasks (not just heartbeat)
            if (entry.task.activeHours &&
                !isWithinActiveHours(entry.task.activeHours, entry.task.activeHoursTimezone)) {
                log.debug(`task outside active hours, not firing: ${id}`);
                return;
            }
            const hook = this.beforeFireHooks.get(id);
            const check = hook ? hook() : Promise.resolve(true);
            check.then(async (shouldFire) => {
                if (!shouldFire) {
                    log.debug(`hook check returned false for ${id}, not firing`);
                    return;
                }
                this.activeTasks.add(id);
                try {
                    await this.executeTask(entry.task);
                }
                catch (err) {
                    log.error('task execution error', { id, error: err instanceof Error ? err.message : String(err) });
                }
            }).catch(err => log.error(`hook check error: ${id}: ${err}`));
        }
        onAgentCompleted(payload) {
            const parsed = parseSessionKey(payload.sessionKey);
            if (parsed.type !== 'cron')
                return;
            // Strip date suffix to recover taskId (e.g. "daily-backup:2026-03-29" → "daily-backup")
            const taskId = parsed.id.replace(/:\d{4}-\d{2}-\d{2}$/, '');
            if (this.activeTasks.delete(taskId)) {
                log.debug(`concurrency lock released: ${taskId}`);
            }
        }
        // ── Task execution ────────────────────────────────────────────────────────
        async executeTask(task) {
            const sessionKey = cronSessionKey(task.id);
            log.info(`⏰ ${task.name} (${task.id})`);
            const result = await this.bus.call('agent.execute', {
                sessionKey,
                task: task.task,
                ...(task.model && { model: task.model }),
            });
            if (!result.response)
                return;
            const cleaned = stripHeartbeatToken(result.response);
            if (cleaned === null) {
                log.debug(`heartbeat no-op: ${task.id}`);
                return;
            }
            if (!task.notify?.length)
                return;
            // Heartbeat: plain send (omit fromSessionKey so channel.send skips history injection).
            // Other tasks: pass our cron sessionKey so the target session records the cross-session push.
            const isHeartbeat = task.id === 'heartbeat';
            await Promise.all(task.notify.map(target => this.bus.call('channel.send', {
                sessionKey: target,
                text: cleaned,
                ...(isHeartbeat ? {} : { fromSessionKey: sessionKey }),
            }).catch(err => log.error(`notify send to ${target}: ${toMessage(err)}`))));
        }
        // ── File I/O ──────────────────────────────────────────────────────────────
        parseMarkdownTask(content) {
            const result = parseFrontmatter(content);
            if (!result)
                return null;
            return { frontmatter: result.meta, body: result.body };
        }
        serializeMarkdownTask(task) {
            const { task: taskPrompt, ...metadata } = task;
            return serializeFrontmatter(metadata, taskPrompt);
        }
        async loadTasksFromDisk() {
            const tasks = [];
            try {
                const files = await fs.readdir(this.cronDir);
                const mdFiles = files.filter(f => f.endsWith('.md'));
                if (mdFiles.length === 0) {
                    log.debug(`no tasks found in ${this.cronDir}`);
                    return tasks;
                }
                for (const filename of mdFiles) {
                    try {
                        const filepath = path.join(this.cronDir, filename);
                        const content = await fs.readFile(filepath, 'utf-8');
                        const parsed = this.parseMarkdownTask(content);
                        if (!parsed) {
                            log.warn(`${filename}: missing or invalid YAML frontmatter (expected --- ... ---)}`);
                            continue;
                        }
                        // Build task object
                        const task = {
                            id: String(parsed.frontmatter.id ?? ''),
                            name: String(parsed.frontmatter.title || parsed.frontmatter.name || parsed.frontmatter.id || ''),
                            schedule: String(parsed.frontmatter.schedule ?? ''),
                            task: parsed.body || '',
                            enabled: parsed.frontmatter.enabled === true,
                            notify: Array.isArray(parsed.frontmatter.notify) ? parsed.frontmatter.notify.map(String) : undefined,
                            activeHours: Array.isArray(parsed.frontmatter.activeHours) ? parsed.frontmatter.activeHours.slice(0, 2) : undefined,
                            activeHoursTimezone: parsed.frontmatter.activeHoursTimezone ? String(parsed.frontmatter.activeHoursTimezone) : undefined,
                        };
                        // Validate against schema
                        const validation = CronTaskSchema.safeParse(task);
                        if (!validation.success) {
                            const errors = validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
                            log.error(`${filename}: schema validation failed — ${errors}`);
                            continue;
                        }
                        tasks.push(validation.data);
                        log.debug(`loaded task: ${task.id}`);
                        // Mark heartbeat as ephemeral
                        if (task.id === 'heartbeat') {
                            this.ephemeralIds.add(task.id);
                        }
                    }
                    catch (err) {
                        log.warn(`${filename}: ${toMessage(err)}`);
                    }
                }
            }
            catch (err) {
                if (err.code === 'ENOENT') {
                    log.debug(`cron directory does not exist yet: ${this.cronDir}`);
                }
                else {
                    log.warn(`failed to read cron directory: ${toMessage(err)}`);
                }
            }
            return tasks;
        }
        async writeTaskToDisk(task) {
            if (!task?.id) {
                throw new Error('Cannot write task without id');
            }
            try {
                await fs.mkdir(this.cronDir, { recursive: true });
                const filepath = path.join(this.cronDir, `${task.id}.md`);
                const tmpPath = `${filepath}.tmp`;
                try {
                    const content = this.serializeMarkdownTask(task);
                    if (!content) {
                        throw new Error('Failed to serialize task');
                    }
                    await fs.writeFile(tmpPath, content, 'utf-8');
                    await fs.rename(tmpPath, filepath);
                    log.debug(`wrote task to disk: ${task.id}`);
                }
                catch (err) {
                    try {
                        await fs.unlink(tmpPath);
                    }
                    catch {
                        // Ignore cleanup errors
                    }
                    throw err;
                }
            }
            catch (err) {
                log.error(`failed to write task ${task.id}: ${toMessage(err)}`);
                throw err;
            }
        }
        async deleteTaskFromDisk(taskId) {
            const filepath = path.join(this.cronDir, `${taskId}.md`);
            try {
                await fs.unlink(filepath);
            }
            catch (err) {
                if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
                    throw err;
                }
                // File doesn't exist, that's fine
            }
        }
        // ── Heartbeat ─────────────────────────────────────────────────────────────
        registerHeartbeat() {
            const entry = this.jobs.get('heartbeat');
            if (!entry) {
                log.warn('heartbeat task not found in cron tasks');
                return;
            }
            const { workspaceDir } = getDataPaths();
            const activeHours = entry.task.activeHours;
            const activeHoursTimezone = entry.task.activeHoursTimezone;
            this.beforeFireHooks.set('heartbeat', async () => {
                if (!isWithinActiveHours(activeHours, activeHoursTimezone))
                    return false;
                const { activeRuns } = await this.bus.call('agent.status', {});
                if (activeRuns.length > 0)
                    return false;
                try {
                    const content = await fs.readFile(path.join(workspaceDir, 'HEARTBEAT.md'), 'utf-8');
                    if (isHeartbeatContentEffectivelyEmpty(content))
                        return false;
                }
                catch {
                    return false; // missing file
                }
                return true;
            });
            log.info('heartbeat registered');
        }
    };
})();
export { CronService };
// ── Boot ───────────────────────────────────────────────────────────────────────
export async function boot(bus) {
    const config = await bus.call('config.get', {});
    const svc = new CronService(bus, config);
    await svc.start();
    bus.bootstrap(svc);
    log.info('cron service started');
    return { stop: () => svc.stop() };
}
//# sourceMappingURL=index.js.map