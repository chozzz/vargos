import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { BaseTool } from './base.js';
import { ToolContext, ToolResult, textResult } from '../contracts/tool.js';

const ctx: ToolContext = { sessionKey: 'test', workingDir: '/tmp' };

const schema = z.object({ message: z.string() });

class TestTool extends BaseTool {
  fn = vi.fn<(args: unknown, context: ToolContext) => Promise<ToolResult>>();

  constructor(params?: z.ZodSchema) {
    super({ name: 'test-tool', description: 'A test tool', parameters: params ?? schema });
    this.fn.mockResolvedValue(textResult('done'));
  }

  async executeImpl(args: unknown, context: ToolContext) {
    return this.fn(args, context);
  }
}

describe('BaseTool', () => {
  it('executes with valid args and returns result', async () => {
    const tool = new TestTool();
    const result = await tool.execute({ message: 'hi' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({ type: 'text', text: 'done' });
  });

  it('returns error result on invalid args', async () => {
    const tool = new TestTool();
    const result = await tool.execute({ message: 123 }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect((result.content[0] as { text: string }).text).toContain('Parameter validation failed');
  });

  it('catches executeImpl errors and returns error result', async () => {
    const tool = new TestTool();
    tool.fn.mockRejectedValue(new Error('boom'));
    const result = await tool.execute({ message: 'hi' }, ctx);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('test-tool failed: boom');
  });

  it('calls beforeExecute hook before execution', async () => {
    const order: string[] = [];
    const tool = new TestTool();
    tool.fn.mockImplementation(async () => { order.push('execute'); return textResult('ok'); });
    tool['beforeExecute'] = async () => { order.push('before'); };
    await tool.execute({ message: 'hi' }, ctx);
    expect(order).toEqual(['before', 'execute']);
  });

  it('calls afterExecute hook after execution', async () => {
    const order: string[] = [];
    const tool = new TestTool();
    tool.fn.mockImplementation(async () => { order.push('execute'); return textResult('ok'); });
    tool['afterExecute'] = async () => { order.push('after'); };
    await tool.execute({ message: 'hi' }, ctx);
    expect(order).toEqual(['execute', 'after']);
  });

  it('passes validated (not raw) args to executeImpl', async () => {
    const strict = z.object({ message: z.string() }).strict();
    const tool = new TestTool(strict);
    // Zod strict() will reject extra keys, confirming parse runs first
    const result = await tool.execute({ message: 'hi', extra: true }, ctx);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Parameter validation failed');
  });

  it('formats Zod errors with field paths', async () => {
    const nested = z.object({ user: z.object({ name: z.string() }) });
    const tool = new TestTool(nested);
    const result = await tool.execute({ user: { name: 42 } }, ctx);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('user.name');
  });
});
