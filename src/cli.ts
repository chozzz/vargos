#!/usr/bin/env node
/**
 * Vargos CLI — interactive chat and task runner
 */

import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getPiAgentRuntime } from './agent/runtime.js';
import { interactivePiConfig } from './config/onboard.js';
import { loadConfig } from './config/pi-config.js';
import { resolveWorkspaceDir, resolveSessionFile, resolveDataDir } from './config/paths.js';
import { boot, type BootResult } from './boot.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json');

async function isProjectDir(dir: string): Promise<boolean> {
  const markers = ['package.json', '.git', 'tsconfig.json', 'Cargo.toml', 'go.mod', 'pyproject.toml'];
  for (const marker of markers) {
    try {
      await fs.access(path.join(dir, marker));
      return true;
    } catch { /* not found */ }
  }
  return false;
}

async function getDefaultWorkspace(): Promise<string> {
  const cwd = process.cwd();
  if (await isProjectDir(cwd)) return cwd;
  return resolveWorkspaceDir();
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

interface CliBootResult extends BootResult {
  workingDir: string;
}

async function bootstrapCli(options: {
  workspace?: string;
  model?: string;
  provider?: string;
  interactive?: boolean;
}): Promise<CliBootResult> {
  if (options.workspace) process.env.VARGOS_WORKSPACE = options.workspace;

  const result = await boot({ interactive: options.interactive });

  return {
    ...result,
    workingDir: options.workspace || process.cwd(),
    provider: options.provider || result.provider,
    model: options.model || result.model,
  };
}

const program = new Command();

program
  .name('vargos')
  .description('Vargos - Agentic MCP server')
  .version(VERSION);

program
  .command('chat')
  .description('Start an interactive chat session with the Vargos agent')
  .option('-w, --workspace <dir>', 'Workspace directory')
  .option('-m, --model <model>', 'Model to use')
  .option('-p, --provider <provider>', 'Provider to use')
  .option('-s, --session <id>', 'Session ID (default: main)')
  .option('--no-interactive', 'Skip interactive configuration prompts')
  .action(async (options) => {
    const b = await bootstrapCli(options);

    const sessionKey = options.session ? `cli:${options.session}` : 'cli:main';
    const { getSessionService } = await import('./services/factory.js');
    const sessions = getSessionService();

    let session = await sessions.get(sessionKey);
    if (!session) {
      session = await sessions.create({
        sessionKey,
        kind: 'main',
        label: `CLI Chat (${options.session || 'main'})`,
        metadata: { model: b.model, provider: b.provider, workspaceDir: b.workingDir, createdAt: new Date().toISOString() },
      });
      console.error(chalk.dim(`  New session: ${sessionKey}`));
    } else {
      console.error(chalk.dim(`  Resuming session: ${sessionKey}`));
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('You: '),
    });

    console.log(chalk.yellow('\nType your message, or "exit" to quit.\n'));

    const runtime = getPiAgentRuntime();
    const sessionFile = resolveSessionFile(sessionKey);
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });

    const askQuestion = () => rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log(chalk.blue('\nGoodbye!'));
        rl.close();
        return;
      }
      if (!input) { askQuestion(); return; }

      console.log(chalk.gray('\nThinking...'));

      await sessions.addMessage({ sessionKey, content: input, role: 'user', metadata: { type: 'task' } });

      try {
        const result = await runtime.run({
          sessionKey,
          sessionFile,
          workspaceDir: b.workingDir,
          model: b.model,
          provider: b.provider,
          apiKey: b.apiKey,
          baseUrl: b.baseUrl,
          contextFiles: b.contextFiles,
        });

        if (result.success) {
          console.log(chalk.cyan('\nAgent:'));
          console.log(result.response || '(no response)');
        } else {
          console.log(chalk.red(`\nError: ${result.error}`));
        }
      } catch (err) {
        console.log(chalk.red(`\nError: ${err instanceof Error ? err.message : String(err)}`));
      }

      console.log();
      askQuestion();
    });

    askQuestion();
  });

program
  .command('run <task>')
  .description('Run a single task and exit')
  .option('-w, --workspace <dir>', 'Workspace directory')
  .option('-m, --model <model>', 'Model to use')
  .option('-p, --provider <provider>', 'Provider to use')
  .option('--no-interactive', 'Skip interactive configuration prompts')
  .action(async (task, options) => {
    const b = await bootstrapCli(options);

    console.log(chalk.blue.bold('\nVargos CLI'));
    console.log(chalk.gray(`Task: ${task}`));
    console.log(chalk.gray(`Workspace: ${b.workingDir}`));
    console.log(chalk.gray(`Model: ${b.provider}/${b.model}`));
    console.log();

    const sessionKey = `cli-run:${Date.now()}`;
    const sessionFile = resolveSessionFile(sessionKey);
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });

    const { getSessionService } = await import('./services/factory.js');
    const sessions = getSessionService();
    await sessions.create({
      sessionKey,
      kind: 'main',
      label: `Task: ${task.slice(0, 30)}...`,
      metadata: { model: b.model, provider: b.provider },
    });

    await sessions.addMessage({ sessionKey, content: task, role: 'user', metadata: { type: 'task' } });

    const runtime = getPiAgentRuntime();
    console.log(chalk.gray('Running task...\n'));

    try {
      const result = await runtime.run({
        sessionKey,
        sessionFile,
        workspaceDir: b.workingDir,
        model: b.model,
        provider: b.provider,
        apiKey: b.apiKey,
        baseUrl: b.baseUrl,
        contextFiles: b.contextFiles,
      });

      if (result.success) {
        console.log(result.response || '(no response)');
        process.exit(0);
      } else {
        console.error(chalk.red(`Error: ${result.error}`));
        process.exit(1);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Interactive configuration setup')
  .action(async () => {
    await interactivePiConfig(resolveDataDir());
  });

program
  .command('config:set')
  .description('Interactive LLM configuration (provider, model, API key)')
  .action(async () => {
    await interactivePiConfig(resolveDataDir());
  });

program
  .command('config:get')
  .description('Show current configuration')
  .action(async () => {
    const config = await loadConfig(resolveDataDir());

    console.log(chalk.blue('\nCurrent Configuration'));
    if (!config) {
      console.log('  Not configured. Run: vargos config');
    } else {
      const { agent } = config;
      console.log(`  Provider: ${agent.provider}`);
      console.log(`  Model:    ${agent.model}`);
      if (agent.baseUrl) console.log(`  Base URL: ${agent.baseUrl}`);
      const envKey = process.env[`${agent.provider.toUpperCase()}_API_KEY`];
      const hasKey = !!(envKey || agent.apiKey);
      console.log(`  API Key:  ${hasKey ? chalk.green('ok') : chalk.gray('not set')}${envKey ? ' (env)' : ''}`);

      if (config.channels && Object.keys(config.channels).length > 0) {
        console.log('');
        console.log(chalk.blue('  Channels'));
        for (const [type, ch] of Object.entries(config.channels)) {
          const status = ch.enabled !== false ? chalk.green('enabled') : chalk.gray('disabled');
          console.log(`    ${type}: ${status}`);
        }
      }
    }
    console.log('');
  });

program
  .command('restart')
  .description('Restart the Vargos server')
  .action(async () => {
    console.log(chalk.yellow('Restarting Vargos...'));

    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync('pgrep -f "tsx src/index.ts" || true');
      const pids = stdout.trim().split('\n').filter(Boolean);

      if (pids.length === 0) {
        console.log(chalk.yellow('   No running Vargos server found'));
        console.log(chalk.gray('   Start with: pnpm dev'));
        process.exit(1);
      }

      for (const pid of pids) {
        try { process.kill(parseInt(pid), 'SIGTERM'); console.log(chalk.gray(`   Stopped process ${pid}`)); }
        catch { /* dead */ }
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      console.log(chalk.green('   Starting new instance...'));
      const { spawn } = await import('node:child_process');
      const child = spawn('pnpm', ['dev'], { cwd: process.cwd(), detached: true, stdio: 'ignore', env: process.env });
      child.unref();
      console.log(chalk.green('Vargos restarted (PID: ' + child.pid + ')'));
      process.exit(0);
    } catch (err) {
      console.error(chalk.red(`   Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

program
  .command('scheduler')
  .description('Start the cron scheduler')
  .option('-w, --workspace <dir>', 'Workspace directory')
  .action(async (options) => {
    const workspaceDir = options.workspace || await getDefaultWorkspace();

    console.log(chalk.blue('\nStarting Cron Scheduler'));
    console.log();

    const { initializeCronScheduler, createTwiceDailyVargosAnalysis } = await import('./cron/index.js');
    const scheduler = initializeCronScheduler(workspaceDir);
    createTwiceDailyVargosAnalysis(scheduler);

    console.log(chalk.green('Scheduler started'));
    console.log();

    const tasks = scheduler.listTasks();
    console.log(chalk.yellow(`Scheduled Tasks (${tasks.length}):`));
    for (const task of tasks) {
      console.log(`  ${task.name}`);
      console.log(`    Schedule: ${task.schedule}`);
      console.log(`    Status: ${task.enabled ? 'Enabled' : 'Disabled'}`);
      console.log();
    }

    console.log(chalk.yellow('Press Ctrl+C to stop'));
    console.log();
    scheduler.startAll();
    process.stdin.resume();
  });

program
  .command('onboard')
  .description('Interactive channel setup (WhatsApp, Telegram)')
  .action(async () => {
    const { runOnboarding } = await import('./channels/onboard.js');
    await runOnboarding();
    process.exit(0);
  });

program
  .command('server')
  .description('Start the MCP server (stdio mode)')
  .action(async () => { await import('./index.js'); });

program.parse();
