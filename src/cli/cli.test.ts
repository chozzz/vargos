/**
 * Tests for CLI session flow
 * Ensures sessions are created before messages are added/read
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initializeServices, closeServices, getSessionService } from '../services/factory.js';
import { PiAgentRuntime } from '../pi/runtime.js';

describe('CLI session flow', () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-cli-test-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    
    await initializeServices({
      memory: 'file',
      sessions: 'file',
      fileMemoryDir: tempDir,
    });
  });

  afterEach(async () => {
    await closeServices();
    process.env.HOME = originalHome;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should create session before adding messages', async () => {
    const sessions = getSessionService();
    const sessionKey = `cli:${Date.now()}`;
    const sessionFile = path.join(tempDir, 'session.jsonl');

    // Session should not exist initially
    let session = await sessions.get(sessionKey);
    expect(session).toBeNull();

    // Create the session (as CLI does)
    session = await sessions.create({
      sessionKey,
      kind: 'main',
      label: 'Test Session',
      metadata: {},
    });

    expect(session).not.toBeNull();
    expect(session?.sessionKey).toBe(sessionKey);
    expect(session?.kind).toBe('main');

    // Now add a message (as CLI does when user sends input)
    const message = await sessions.addMessage({
      sessionKey,
      content: 'Hello, test message',
      role: 'user',
      metadata: { type: 'task' },
    });

    expect(message).not.toBeNull();
    expect(message.content).toBe('Hello, test message');
    expect(message.role).toBe('user');

    // Load messages (as Pi runtime does)
    const messages = await sessions.getMessages(sessionKey);
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Hello, test message');
  });

  it('should fail gracefully if session does not exist', async () => {
    const sessions = getSessionService();
    const nonExistentKey = 'cli:9999999999999';

    // Trying to add message to non-existent session should fail
    await expect(
      sessions.addMessage({
        sessionKey: nonExistentKey,
        content: 'Test',
        role: 'user',
      })
    ).rejects.toThrow();
  });

  it('should support full CLI workflow', async () => {
    const sessions = getSessionService();
    const sessionKey = `cli-run:${Date.now()}`;
    const task = 'Analyze this codebase';

    // Step 1: Create session (as CLI does)
    const session = await sessions.create({
      sessionKey,
      kind: 'main',
      label: `Task: ${task.slice(0, 30)}...`,
      metadata: { task },
    });
    expect(session).not.toBeNull();

    // Step 2: Add task message (as CLI does)
    const taskMessage = await sessions.addMessage({
      sessionKey,
      content: task,
      role: 'user',
      metadata: { type: 'task' },
    });
    expect(taskMessage.metadata?.type).toBe('task');

    // Step 3: Load messages (as Pi runtime does)
    const messages = await sessions.getMessages(sessionKey);
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe(task);

    // Step 4: Store response (as Pi runtime does after completion)
    const response = await sessions.addMessage({
      sessionKey,
      content: 'Analysis complete',
      role: 'assistant',
      metadata: {},
    });
    expect(response.role).toBe('assistant');

    // Verify final state (order may vary if timestamps are equal)
    const allMessages = await sessions.getMessages(sessionKey);
    expect(allMessages.length).toBe(2);
    const userMessage = allMessages.find(m => m.role === 'user');
    const assistantMessage = allMessages.find(m => m.role === 'assistant');
    expect(userMessage).toBeDefined();
    expect(assistantMessage).toBeDefined();
    expect(userMessage?.content).toBe(task);
    expect(assistantMessage?.content).toBe('Analysis complete');
  });
});
