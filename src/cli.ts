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
import { loadPiSettings, getPiApiKey, listPiProviders, isPiConfigured, formatPiConfigDisplay } from './config/pi-config.js';

const VERSION = '0.0.1';

/**
 * Detect if a directory is a project (has project markers)
 * Like OpenClaw's workspace detection
 */
async function isProjectDir(dir: string): Promise<boolean> {
  const markers = [
    'package.json',
    '.git',
    'AGENTS.md',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
    'Makefile',
    'README.md',
  ];

  for (const marker of markers) {
    try {
      await fs.access(path.join(dir, marker));
      return true;
    } catch {
      // Marker not found, continue
    }
  }
  return false;
}

/**
 * Get default workspace directory
 * Uses current dir if it's a project, otherwise ~/.vargos/workspace
 */
async function getDefaultWorkspace(): Promise<string> {
  const cwd = process.cwd();
  if (await isProjectDir(cwd)) {
    return cwd;
  }
  return path.join(os.homedir(), '.vargos', 'workspace');
}

const program = new Command();

program
  .name('vargos')
  .description('Vargos - Agentic MCP server with OpenClaw-style tools')
  .version(VERSION);

program
  .command('chat')
  .description('Start an interactive chat session with the Vargos agent')
  .option('-w, --workspace <dir>', 'Workspace directory (default: auto-detect project or ~/.vargos/workspace)')
  .option('-m, --model <model>', 'Model to use (overrides saved config)')
  .option('-p, --provider <provider>', 'Provider to use (overrides saved config)')
  .option('--memory <backend>', 'Memory backend (file|qdrant|postgres)', 'file')
  .option('--sessions <backend>', 'Sessions backend (file|postgres)', 'file')
  .option('--no-interactive', 'Skip interactive configuration prompts')
  .action(async (options) => {
    // Determine workspace (auto-detect project or use default)
    const workspaceDir = options.workspace || await getDefaultWorkspace();

    // Check and prompt for configuration (interactive by default)
    const { valid: configValid } = checkConfig();
    if (!configValid && options.interactive !== false) {
      await interactiveConfig(workspaceDir);
    }

    // Set CLI options as env vars for service initialization
    process.env.VARGOS_MEMORY_BACKEND = options.memory;
    process.env.VARGOS_SESSIONS_BACKEND = options.sessions;
    process.env.VARGOS_WORKSPACE = workspaceDir;

    // Initialize workspace if needed
    const workspaceExists = await isWorkspaceInitialized(workspaceDir);
    if (!workspaceExists) {
      console.log(chalk.yellow('📁 Initializing workspace...'));
      await initializeWorkspace({ workspaceDir });
      console.log(chalk.green('  ✓ Created default workspace files'));
    }

    // Load context files
    const contextFiles: Array<{ name: string; content: string }> = [];
    const contextFileNames = ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md'];
    for (const name of contextFileNames) {
      try {
        const content = await fs.readFile(path.join(workspaceDir, name), 'utf-8');
        contextFiles.push({ name, content });
      } catch {
        // File doesn't exist
      }
    }

    // Load Pi agent configuration
    const piSettings = await loadPiSettings(workspaceDir);
    const piProviders = await listPiProviders(workspaceDir);
    const piStatus = await isPiConfigured(workspaceDir);

    // Use CLI options or fall back to Pi config
    const provider = options.provider || piSettings.defaultProvider || 'openai';
    const model = options.model || piSettings.defaultModel || 'gpt-4o-mini';

    // Print startup banner
    printStartupBanner({
      mode: 'cli',
      version: VERSION,
      workspace: workspaceDir,
      memoryBackend: options.memory,
      sessionsBackend: options.sessions,
      contextFiles: contextFiles.map(f => f.name),
      toolsCount: toolRegistry.list().length,
    });

    // Print Pi agent configuration
    console.error('');
    console.error(formatPiConfigDisplay({
      provider: piSettings.defaultProvider,
      model: piSettings.defaultModel,
      apiKeys: piProviders,
    }));
    console.error('');

    // Check if we have API key for the selected provider
    const apiKey = await getPiApiKey(workspaceDir, provider);
    if (!apiKey) {
      console.error(chalk.yellow(`⚠️  No API key found for ${provider}`));
      console.error(chalk.gray(`   Set ${provider.toUpperCase()}_API_KEY or run 'vargos config'\n`));
    }

    // Initialize services
    const serviceConfig: ServiceConfig = {
      memory: options.memory as 'file' | 'qdrant' | 'postgres',
      sessions: options.sessions as 'file' | 'postgres',
      fileMemoryDir: workspaceDir,
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
    const sessionFile = path.join(workspaceDir, '.vargos', 'sessions', `${sessionKey}.jsonl`);
    
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });

    // Create the session in Vargos session service
    const { getSessionService } = await import('./services/factory.js');
    const sessions = getSessionService();
    await sessions.create({
      sessionKey,
      kind: 'main',
      label: 'CLI Chat Session',
      metadata: {
        model,
        provider,
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
          workspaceDir,
          model,
          provider,
          apiKey: await getPiApiKey(workspaceDir, provider) || process.env.OPENAI_API_KEY,
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
  .option('-w, --workspace <dir>', 'Workspace directory (default: auto-detect project or ~/.vargos/workspace)')
  .option('-m, --model <model>', 'Model to use (overrides saved config)')
  .option('-p, --provider <provider>', 'Provider to use (overrides saved config)')
  .option('--no-interactive', 'Skip interactive configuration prompts')
  .action(async (task, options) => {
    // Determine workspace (auto-detect project or use default)
    const workspaceDir = options.workspace || await getDefaultWorkspace();

    // Check and prompt for configuration
    const { valid: configValid } = checkConfig();
    if (!configValid && options.interactive !== false) {
      await interactiveConfig(workspaceDir);
    }

    process.env.VARGOS_WORKSPACE = workspaceDir;

    // Initialize workspace if needed
    const workspaceExists = await isWorkspaceInitialized(workspaceDir);
    if (!workspaceExists) {
      console.log(chalk.yellow('📁 Initializing workspace...'));
      await initializeWorkspace({ workspaceDir });
      console.log(chalk.green('  ✓ Created default workspace files'));
    }

    // Load Pi agent configuration
    const piSettings = await loadPiSettings(workspaceDir);
    const piProviders = await listPiProviders(workspaceDir);

    // Use CLI options or fall back to Pi config
    const provider = options.provider || piSettings.defaultProvider || 'openai';
    const model = options.model || piSettings.defaultModel || 'gpt-4o-mini';

    console.log(chalk.blue.bold('\n🤖 Vargos CLI'));
    console.log(chalk.gray(`Task: ${task}`));
    console.log(chalk.gray(`Workspace: ${workspaceDir}`));
    console.log(chalk.gray(`Model: ${provider}/${model}`));
    console.log();

    // Initialize services
    const serviceConfig: ServiceConfig = {
      memory: 'file',
      sessions: 'file',
      fileMemoryDir: workspaceDir,
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
    const sessionFile = path.join(workspaceDir, '.vargos', 'sessions', `${sessionKey}.jsonl`);
    
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });

    // Create session and add task
    const { getSessionService } = await import('./services/factory.js');
    const sessions = getSessionService();
    await sessions.create({
      sessionKey,
      kind: 'main',
      label: `Task: ${task.slice(0, 30)}...`,
      metadata: {
        model,
        provider,
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
        workspaceDir,
        model,
        provider,
        apiKey: await getPiApiKey(workspaceDir, provider) || process.env.OPENAI_API_KEY,
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
  .option('-w, --workspace <dir>', 'Workspace directory (default: auto-detect project or ~/.vargos/workspace)')
  .action(async (options) => {
    const workspaceDir = options.workspace || await getDefaultWorkspace();
    await interactiveConfig(workspaceDir);
  });

program
  .command('server')
  .description('Start the MCP server (stdio mode)')
  .action(async () => {
    // Import and run the server
    await import('./index.js');
  });

program.parse();
