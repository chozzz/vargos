#!/usr/bin/env node
/**
 * Vargos CLI
 * Interactive command-line interface for chatting with the Vargos agent
 * Like OpenClaw's CLI mode
 */

import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PiAgentRuntime } from './pi/runtime.js';
import { initializeServices, ServiceConfig } from './services/factory.js';
import { toolRegistry } from './mcp/tools/index.js';
import { buildSystemPrompt, resolvePromptMode } from './agent/prompt.js';
import { interactiveConfig, printStartupBanner, checkConfig } from './config/interactive.js';
import { initializeWorkspace, isWorkspaceInitialized } from './config/workspace.js';

const VERSION = '0.0.1';

const program = new Command();

program
  .name('vargos')
  .description('Vargos - Agentic MCP server with OpenClaw-style tools')
  .version(VERSION);

program
  .command('chat')
  .description('Start an interactive chat session with the Vargos agent')
  .option('-w, --workspace <dir>', 'Workspace directory', path.join(os.homedir(), '.vargos', 'workspace'))
  .option('-m, --model <model>', 'Model to use', 'gpt-4o-mini')
  .option('-p, --provider <provider>', 'Provider to use', 'openai')
  .option('--memory <backend>', 'Memory backend (file|qdrant|postgres)', 'file')
  .option('--sessions <backend>', 'Sessions backend (file|postgres)', 'file')
  .action(async (options) => {
    // Check and prompt for configuration
    const { valid: configValid } = checkConfig();
    if (!configValid) {
      await interactiveConfig();
    }

    // Set CLI options as env vars for service initialization
    process.env.VARGOS_MEMORY_BACKEND = options.memory;
    process.env.VARGOS_SESSIONS_BACKEND = options.sessions;
    process.env.VARGOS_WORKSPACE = options.workspace;

    // Initialize workspace if needed
    const workspaceExists = await isWorkspaceInitialized(options.workspace);
    if (!workspaceExists) {
      console.log(chalk.yellow('📁 Initializing workspace...'));
      await initializeWorkspace({ workspaceDir: options.workspace });
      console.log(chalk.green('  ✓ Created default workspace files'));
    }

    // Load context files
    const contextFiles: Array<{ name: string; content: string }> = [];
    const contextFileNames = ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md'];
    for (const name of contextFileNames) {
      try {
        const content = await fs.readFile(path.join(options.workspace, name), 'utf-8');
        contextFiles.push({ name, content });
      } catch {
        // File doesn't exist
      }
    }

    // Print startup banner
    printStartupBanner({
      mode: 'cli',
      version: VERSION,
      workspace: options.workspace,
      memoryBackend: options.memory,
      sessionsBackend: options.sessions,
      contextFiles: contextFiles.map(f => f.name),
      toolsCount: toolRegistry.list().length,
    });

    // Initialize services
    const serviceConfig: ServiceConfig = {
      memory: options.memory as 'file' | 'qdrant' | 'postgres',
      sessions: options.sessions as 'file' | 'postgres',
      fileMemoryDir: options.workspace,
    };

    try {
      await initializeServices(serviceConfig);
      console.error(chalk.green('  ✓ Services initialized'));
    } catch (err) {
      console.error(chalk.red('  ✗ Service initialization failed'));
      console.error(chalk.red(`   ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    // Create session
    const sessionKey = `cli:${Date.now()}`;
    const sessionFile = path.join(options.workspace, '.vargos', 'sessions', `${sessionKey}.jsonl`);
    
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });

    // Create the session in Vargos session service
    const { getSessionService } = await import('./services/factory.js');
    const sessions = getSessionService();
    await sessions.create({
      sessionKey,
      kind: 'main',
      label: 'CLI Chat Session',
      metadata: {
        model: options.model,
        provider: options.provider,
        startedAt: new Date().toISOString(),
      },
    });

    // Create readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('You: '),
    });

    console.log(chalk.yellow('\nType your message, or "exit" to quit.\n'));

    const runtime = new PiAgentRuntime();
    let messageCount = 0;

    const askQuestion = () => {
      rl.prompt();
    };

    rl.on('line', async (line) => {
      const input = line.trim();

      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log(chalk.blue('\nGoodbye! 👋'));
        rl.close();
        return;
      }

      if (!input) {
        askQuestion();
        return;
      }

      messageCount++;
      console.log(chalk.gray('\nThinking...'));

      // Add user message to session before running agent
      await sessions.addMessage({
        sessionKey,
        content: input,
        role: 'user',
        metadata: { type: 'task' },
      });

      try {
        const result = await runtime.run({
          sessionKey,
          sessionFile,
          workspaceDir: options.workspace,
          model: options.model,
          provider: options.provider,
          apiKey: process.env.OPENAI_API_KEY,
          contextFiles,
        });

        if (result.success) {
          console.log(chalk.cyan('\n🤖 Agent:'));
          console.log(result.response || '(no response)');
        } else {
          console.log(chalk.red(`\n❌ Error: ${result.error}`));
        }
      } catch (err) {
        console.log(chalk.red(`\n❌ Error: ${err instanceof Error ? err.message : String(err)}`));
      }

      console.log();
      askQuestion();
    });

    askQuestion();
  });

program
  .command('run <task>')
  .description('Run a single task and exit')
  .option('-w, --workspace <dir>', 'Workspace directory', path.join(os.homedir(), '.vargos', 'workspace'))
  .option('-m, --model <model>', 'Model to use', 'gpt-4o-mini')
  .option('-p, --provider <provider>', 'Provider to use', 'openai')
  .action(async (task, options) => {
    // Check and prompt for configuration
    const { valid: configValid } = checkConfig();
    if (!configValid) {
      await interactiveConfig();
    }

    process.env.VARGOS_WORKSPACE = options.workspace;

    // Initialize workspace if needed
    const workspaceExists = await isWorkspaceInitialized(options.workspace);
    if (!workspaceExists) {
      console.log(chalk.yellow('📁 Initializing workspace...'));
      await initializeWorkspace({ workspaceDir: options.workspace });
      console.log(chalk.green('  ✓ Created default workspace files'));
    }

    console.log(chalk.blue.bold('\n🤖 Vargos CLI'));
    console.log(chalk.gray(`Task: ${task}`));
    console.log(chalk.gray(`Workspace: ${options.workspace}`));
    console.log();

    // Initialize services
    const serviceConfig: ServiceConfig = {
      memory: 'file',
      sessions: 'file',
      fileMemoryDir: options.workspace,
    };

    try {
      await initializeServices(serviceConfig);
      console.log(chalk.green('✓ Services initialized'));
    } catch (err) {
      console.error(chalk.red('✗ Service initialization failed'));
      console.error(chalk.red(`  ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    const sessionKey = `cli-run:${Date.now()}`;
    const sessionFile = path.join(options.workspace, '.vargos', 'sessions', `${sessionKey}.jsonl`);
    
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });

    // Create session and add task
    const { getSessionService } = await import('./services/factory.js');
    const sessions = getSessionService();
    await sessions.create({
      sessionKey,
      kind: 'main',
      label: `Task: ${task.slice(0, 30)}...`,
      metadata: {
        model: options.model,
        provider: options.provider,
      },
    });

    await sessions.addMessage({
      sessionKey,
      content: task,
      role: 'user',
      metadata: { type: 'task' },
    });

    const runtime = new PiAgentRuntime();

    console.log(chalk.gray('Running task...\n'));

    try {
      const result = await runtime.run({
        sessionKey,
        sessionFile,
        workspaceDir: options.workspace,
        model: options.model,
        provider: options.provider,
        apiKey: process.env.OPENAI_API_KEY,
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
    await interactiveConfig();
  });

program
  .command('server')
  .description('Start the MCP server (stdio mode)')
  .action(async () => {
    // Import and run the server
    await import('./index.js');
  });

program.parse();
