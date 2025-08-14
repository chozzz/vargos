import { describe, it, expect } from 'vitest';
import { functionCuratorAgent } from './function-curator-agent';

describe('functionCuratorAgent', () => {
  it('should be defined with correct name', () => {
    expect(functionCuratorAgent).toBeDefined();
    expect(functionCuratorAgent.name).toBe('Function Curator');
  });

  it('should have required tools', () => {
    const tools = Object.keys(functionCuratorAgent.tools || {});

    // Function management tools
    expect(tools).toContain('search-functions');
    expect(tools).toContain('get-function-metadata');
    expect(tools).toContain('execute-function');

    // Shell (for file operations via bash commands)
    expect(tools).toContain('bash');

    // Environment
    expect(tools).toContain('get-env');
    expect(tools).toContain('search-env');

    // Total tool count should be 6
    expect(tools.length).toBe(6);
  });
});
