#!/usr/bin/env node
/**
 * Vargos CLI — interactive chat and task runner
 */

import 'dotenv/config';

import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PiAgentRuntime } from './agent/runtime.js';
import { toolRegistry } from './tools/index.js';
import { printStartupBanner } from './config/banner.js';
import { interactiveConfig } from './config/onboard.js';
import { loadPiSettings, getPiApiKey, listPiProviders, formatPiConfigDisplay } from './config/pi-config.js';
import { resolveWorkspaceDir, resolveSessionFile } from './config/paths.js';
import { boot, type BootResult } from './boot.js';

const VERSION = '0.0.1';

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
  provider: string;
  model: string;
  apiKey: string | undefined;
}

async function bootstrapCli(options: {
  workspace?: string;
  model?: string;
  provider?: string;
  memory?: string;
  sessions?: string;
  interactive?: boolean;
}): Promise<CliBootResult> {
  if (options.memory) process.env.VARGOS_MEMORY_BACKEND = options.memory;
  if (options.sessions) process.env.VARGOS_SESSIONS_BACKEND = options.sessions;
  if (options.workspace) process.env.VARGOS_WORKSPACE = options.workspace;

  const result = await boot({ interactive: options.interactive });

  const piSettings = await loadPiSettings(result.workspaceDir);
  const provider = options.provider || piSettings.defaultProvider || 'openai';
  const model = options.model || piSettings.defaultModel || 'gpt-4o-mini';
  const apiKey = await getPiApiKey(result.workspaceDir, provider) || process.env.OPENAI_API_KEY;

  return {
    ...result,
    workingDir: options.workspace || process.cwd(),
    provider,
    model,
    apiKey,
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
  .option('--memory <backend>', 'Memory backend (file|qdrant|postgres)', 'file')
  .option('--sessions <backend>', 'Sessions backend (file|postgres)', 'file')
  .option('--no-interactive', 'Skip interactive configuration prompts')
  .action(async (options) => {
    const b = await bootstrapCli(options);

    const tools = toolRegistry.list().map(t => ({ name: t.name, description: t.description }));
    const piSettings = await loadPiSettings(b.workspaceDir);
    const piProviders = await listPiProviders(b.workspaceDir);

    printStartupBanner({
      mode: 'cli',
      version: VERSION,
      workspace: b.workingDir,
      contextDir: b.workspaceDir,
      dataDir: b.dataDir,
      memoryBackend: options.memory,
      sessionsBackend: options.sessions,
      contextFiles: b.contextFiles.map(f => ({ name: f.name, path: path.join(b.workspaceDir, f.name) })),
      tools,
    });

    console.error('');
    console.error(formatPiConfigDisplay({
      provider: piSettings.defaultProvider,
      model: piSettings.defaultModel,
      apiKeys: piProviders,
    }));
    console.error('');

    if (!b.apiKey) {
      console.error(chalk.yellow(`No API key found for ${b.provider}`));
      console.error(chalk.gray(`   Set ${b.provider.toUpperCase()}_API_KEY or run 'vargos config'\n`));
    }

    console.error(chalk.green('  Services initialized'));

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

    const runtime = new PiAgentRuntime();
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

    const runtime = new PiAgentRuntime();
    console.log(chalk.gray('Running task...\n'));

    try {
      const result = await runtime.run({
        sessionKey,
        sessionFile,
        workspaceDir: b.workingDir,
        model: b.model,
        provider: b.provider,
        apiKey: b.apiKey,
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

async function interactiveLLMConfig(workspaceDir: string): Promise<void> {
  console.log(chalk.blue('\n LLM Configuration'));
  console.log(chalk.gray(''));

  const settings = await loadPiSettings(workspaceDir);

  console.log(chalk.yellow('\nSelect provider:'));
  console.log('  1. openai (GPT-4o, GPT-4o-mini)');
  console.log('  2. anthropic (Claude)');
  console.log('  3. google (Gemini)');
  console.log('  4. openrouter (Multi-provider)');
  console.log('  5. ollama (Self-hosted)');
  console.log('  6. lmstudio (Self-hosted)');
  console.log('');

  const providerChoice = await prompt('   Choice (1-6): ');
  const providerMap: Record<string, string> = {
    '1': 'openai', '2': 'anthropic', '3': 'google',
    '4': 'openrouter', '5': 'ollama', '6': 'lmstudio',
  };

  const provider = providerMap[providerChoice];
  if (!provider) { console.log(chalk.red('   Invalid choice')); return; }

  let baseUrl: string | undefined;
  let apiKey: string | undefined;

  if (provider === 'ollama' || provider === 'lmstudio') {
    const defaultUrl = provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234';
    console.log(chalk.yellow(`\nEnter ${provider} base URL (default: ${defaultUrl}):`));
    const urlInput = await prompt('   URL: ');
    baseUrl = urlInput || defaultUrl;
  }

  if (provider !== 'ollama') {
    console.log(chalk.yellow('\nEnter API key (leave empty to keep existing):'));
    const keyInput = await prompt('   API Key: ');
    if (keyInput) apiKey = keyInput;
  }

  console.log(chalk.yellow('\nEnter model ID:'));
  const defaultModels: Record<string, string> = {
    openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022', google: 'gemini-1.5-pro',
    openrouter: 'openai/gpt-4o', ollama: 'llama3.2', lmstudio: 'default',
  };
  console.log(chalk.gray(`   Default: ${defaultModels[provider]}`));
  const modelInput = await prompt('   Model: ');
  const model = modelInput || defaultModels[provider];

  const { savePiSettings, loadPiAuth, savePiAuth } = await import('./config/pi-config.js');
  await savePiSettings(workspaceDir, { ...settings, defaultProvider: provider, defaultModel: model });

  if (apiKey) {
    const auth = await loadPiAuth(workspaceDir);
    auth[provider] = { apiKey };
    await savePiAuth(workspaceDir, auth);
  }

  console.log(chalk.green('\nConfiguration saved!'));
  console.log(chalk.gray(`   Provider: ${provider}`));
  console.log(chalk.gray(`   Model: ${model}`));
  if (baseUrl) {
    console.log(chalk.gray(`   URL: ${baseUrl}`));
    console.log(chalk.yellow(`\n   Note: Set base URL in .env as ${provider.toUpperCase()}_URL=${baseUrl}`));
  }
  console.log(chalk.yellow('\n   Restart the server to apply changes:'));
  console.log(chalk.gray('   vargos restart'));
}

program
  .command('config')
  .description('Interactive configuration setup')
  .option('-w, --workspace <dir>', 'Workspace directory')
  .action(async (options) => {
    const workspaceDir = options.workspace || await getDefaultWorkspace();
    await interactiveConfig(workspaceDir);
  });

program
  .command('config:set')
  .description('Interactive LLM configuration (provider, model, API key)')
  .option('-w, --workspace <dir>', 'Workspace directory')
  .action(async (options) => {
    const workspaceDir = options.workspace || await getDefaultWorkspace();
    await interactiveLLMConfig(workspaceDir);
  });

program
  .command('config:get')
  .description('Show current LLM configuration')
  .option('-w, --workspace <dir>', 'Workspace directory')
  .action(async (options) => {
    const workspaceDir = options.workspace || await getDefaultWorkspace();
    const settings = await loadPiSettings(workspaceDir);
    const providers = await listPiProviders(workspaceDir);

    console.log(chalk.blue('\nCurrent LLM Configuration'));
    console.log(chalk.gray(''));
    console.log('');
    console.log(formatPiConfigDisplay({ provider: settings.defaultProvider, model: settings.defaultModel, apiKeys: providers }));
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
