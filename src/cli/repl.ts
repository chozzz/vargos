/**
 * REPL for interactive bus event calls
 */

import { createInterface } from 'node:readline';
import { createLogger } from '../../lib/logger.js';
import type { TCPBusClient } from './client.js';

const log = createLogger('cli');

export async function startREPL(client: TCPBusClient): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'vargos> ',
  });

  log.info('Connected to bus');
  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();

    // Built-in commands
    if (trimmed === '.help') {
      console.log(`
Commands:
  .help                — show this help
  .inspect             — list all available events
  .inspect <event>     — show event details
  .quit                — exit

Usage:
  <event> [json-params]
  Example: agent.execute {"sessionKey":"main:test","task":"hello"}
      `);
      rl.prompt();
      continue;
    }

    if (trimmed === '.quit') break;

    // Inspect commands
    if (trimmed === '.inspect') {
      try {
        const events = await client.call('bus.search' as never, {} as never);
        const eventList = (events as Array<{ event: string; description: string; type: string }>);
        console.log('\n📡 Available Events:\n');
        eventList.forEach(e => {
          const icon = e.type === 'callable' ? '🔧' : '📢';
          console.log(`${icon} ${e.event.padEnd(30)} ${e.description}`);
        });
        console.log();
      } catch (err) {
        console.log(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      rl.prompt();
      continue;
    }

    if (trimmed.startsWith('.inspect ')) {
      const eventName = trimmed.slice(9).trim();
      try {
        const result = await client.call('bus.inspect' as never, { event: eventName } as never);
        if (!result) {
          console.log(`❌ Event not found: ${eventName}`);
        } else {
          const meta = result as { event: string; description: string; type: string; schema?: { params?: unknown } };
          console.log(`\n📋 ${meta.event} (${meta.type})`);
          console.log(`   ${meta.description}`);
          if (meta.schema?.params) {
            console.log(`\n   Schema:`);
            console.log(`   ${JSON.stringify(meta.schema.params, null, 4).split('\n').join('\n   ')}`);
          }
          console.log();
        }
      } catch (err) {
        console.log(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      rl.prompt();
      continue;
    }

    // Parse event and params
    const parts = trimmed.split(/\s+/);
    if (parts.length === 0) {
      rl.prompt();
      continue;
    }

    const eventName = parts[0];
    const paramStr = parts.slice(1).join(' ');

    let params: unknown;
    try {
      params = paramStr ? JSON.parse(paramStr) : undefined;
    } catch (err) {
      console.log(`❌ Invalid JSON: ${err}`);
      rl.prompt();
      continue;
    }

    // Call event and listen for results
    await callEventWithListeners(client, eventName, params);

    rl.prompt();
  }

  rl.close();
  client.disconnect();
}

async function callEventWithListeners(
  client: TCPBusClient,
  eventName: string,
  params: unknown,
): Promise<void> {
  const sessionKeys = new Set<string>();

  // Extract sessionKey from params for listening
  if (params && typeof params === 'object' && 'sessionKey' in params) {
    const sk = (params as Record<string, unknown>).sessionKey;
    if (typeof sk === 'string') {
      sessionKeys.add(sk);
    }
  }

  const unsubscribers: (() => void)[] = [];

  try {
    // Set up listeners for agent.onTool and agent.onCompleted
    const onTool = (payload: Record<string, unknown>) => {
      const sk = payload.sessionKey as string;
      if (sessionKeys.has(sk)) {
        const phase = payload.phase ?? 'unknown';
        const tool = payload.toolName ?? '?';
        console.log(`🔧 [${sk}] tool ${phase}: ${tool}`);
        // Track subagents if triggered
        if (payload.result && typeof payload.result === 'object') {
          const result = payload.result as Record<string, unknown>;
          if (typeof result.sessionKey === 'string') {
            sessionKeys.add(result.sessionKey);
          }
        }
      }
    };

    const onCompleted = (payload: Record<string, unknown>) => {
      const sk = payload.sessionKey as string;
      if (sessionKeys.has(sk)) {
        const success = payload.success ?? true;
        const icon = success ? '✅' : '❌';
        console.log(`${icon} [${sk}] completed`);
        sessionKeys.delete(sk);
      }
    };

    unsubscribers.push(client.on('agent.onTool' as never, onTool as never));
    unsubscribers.push(client.on('agent.onCompleted' as never, onCompleted as never));

    // Make the call
    console.log(`\n→ calling ${eventName}...`);
    const result = await client.call(eventName as never, params as never);
    console.log(`\n← result: ${JSON.stringify(result, null, 2)}\n`);

    // Wait for all subagents to complete
    let waitMs = 0;
    const maxWaitMs = 120_000; // 2 min timeout
    while (sessionKeys.size > 0 && waitMs < maxWaitMs) {
      await new Promise(r => setTimeout(r, 100));
      waitMs += 100;
    }

    if (waitMs >= maxWaitMs) {
      console.warn(`⚠️ Timeout waiting for subagents to complete`);
    }
  } catch (err) {
    console.log(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    unsubscribers.forEach(unsub => unsub());
  }
}
