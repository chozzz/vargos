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

const program = new Command();

program
  .name('vargos')
  .description('Vargos - Agentic MCP server with OpenClaw-style tools')
  .version('0.0.1');

program
  .command('chat')
  .description('Start an interactive chat session with the Vargos agent')
  .option('-w, --workspace <dir>', 'Workspace directory', path.join(os.homedir(), '.vargos', 'workspace'))
  .option('-m, --model <model>', 'Model to use', 'gpt-4o-mini')
  .option('-p, --provider <provider>', 'Provider to use', 'openai')
  .option('--memory <backend>', 'Memory backend (file|qdrant|postgres)', 'file')
  .option('--sessions <backend>', 'Sessions backend (file|postgres)', 'file')
  .action(async (options) => {
    console.log(chalk.blue.bold('🤖 Vargos CLI'));
    console.log(chalk.gray(`Workspace: ${options.workspace}`));
    console.log(chalk.gray(`Model: ${options.provider}/${options.model}`));
    console.log();

    // Initialize services
    const serviceConfig: ServiceConfig = {
      memory: options.memory as 'file' | 'qdrant' | 'postgres',
      sessions: options.sessions as 'file' | 'postgres',
      fileMemoryDir: options.workspace,
    };

    await initializeServices(serviceConfig);

    // Create session
    const sessionKey = `cli:${Date.now()}`;
    const sessionFile = path.join(options.workspace, '.vargos', 'sessions', `${sessionKey}.jsonl`);
    
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });

    // Create readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('You: '),
    });

    console.log(chalk.yellow('Type your message, or "exit" to quit.\n'));

    const runtime = new PiAgentRuntime();
    let messageCount = 0;

    const askQuestion = () => {
      rl.prompt();
    };

    rl.on('line', async (line) => {
      const input = line.trim();

      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log(chalk.blue('Goodbye! 👋'));
        rl.close();
        return;
      }

      if (!input) {
        askQuestion();
        return;
      }

      messageCount++;
      console.log(chalk.gray('Thinking...'));

      try {
        const result = await runtime.run({
          sessionKey,
          sessionFile,
          workspaceDir: options.workspace,
          model: options.model,
          provider: options.provider,
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
    console.log(chalk.blue.bold('🤖 Vargos CLI'));
    console.log(chalk.gray(`Task: ${task}`));
    console.log();

    // Initialize services
    const serviceConfig: ServiceConfig = {
      memory: 'file',
      sessions: 'file',
      fileMemoryDir: options.workspace,
    };

    await initializeServices(serviceConfig);

    const sessionKey = `cli-run:${Date.now()}`;
    const sessionFile = path.join(options.workspace, '.vargos', 'sessions', `${sessionKey}.jsonl`);
    
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });

    const runtime = new PiAgentRuntime();

    try {
      const result = await runtime.run({
        sessionKey,
        sessionFile,
        workspaceDir: options.workspace,
        model: options.model,
        provider: options.provider,
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
  .command('server')
  .description('Start the MCP server (stdio mode)')
  .action(async () => {
    // Import and run the server
    await import('./index.js');
  });

program.parse();
