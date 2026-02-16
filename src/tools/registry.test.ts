import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from './registry.js';
import { Tool } from '../contracts/tool.js';

function makeTool(name: string): Tool {
  return {
    name,
    description: `${name} tool`,
    parameters: z.object({}),
    execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  };
}

describe('ToolRegistry', () => {
  it('starts empty', () => {
    const reg = new ToolRegistry();
    expect(reg.list()).toEqual([]);
  });

  it('registers and retrieves a tool', () => {
    const reg = new ToolRegistry();
    const tool = makeTool('echo');
    reg.register(tool);
    expect(reg.get('echo')).toBe(tool);
  });

  it('lists all registered tools', () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('a'));
    reg.register(makeTool('b'));
    const names = reg.list().map(t => t.name);
    expect(names).toEqual(['a', 'b']);
  });

  it('has() returns true for registered, false for unregistered', () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('exists'));
    expect(reg.has('exists')).toBe(true);
    expect(reg.has('nope')).toBe(false);
  });

  it('get() returns undefined for unknown tool', () => {
    const reg = new ToolRegistry();
    expect(reg.get('missing')).toBeUndefined();
  });

  it('throws on null/undefined tool', () => {
    const reg = new ToolRegistry();
    expect(() => reg.register(null as unknown as Tool)).toThrow('Invalid tool');
    expect(() => reg.register(undefined as unknown as Tool)).toThrow('Invalid tool');
  });

  it('throws on tool with no name', () => {
    const reg = new ToolRegistry();
    const bad = { description: 'no name', parameters: z.object({}), execute: async () => ({ content: [] }) };
    expect(() => reg.register(bad as unknown as Tool)).toThrow('Invalid tool');
  });

  it('overwrites tool with same name (last wins)', () => {
    const reg = new ToolRegistry();
    const first = makeTool('dup');
    const second = makeTool('dup');
    reg.register(first);
    reg.register(second);
    expect(reg.get('dup')).toBe(second);
    expect(reg.list()).toHaveLength(1);
  });
});
