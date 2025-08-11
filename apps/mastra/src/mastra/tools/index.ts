/**
 * Vargos Tools - Centralized Export
 *
 * All tools organized by domain for better discoverability and maintainability.
 *
 * Domains:
 * - functions: Function discovery, execution, and management
 * - env: Environment variable management
 * - shell: Bash command execution and shell management
 * - memory: Vector memory for RAG and semantic recall
 * - orchestration: Workflow and agent orchestration
 */

// Function Management Tools
export * from './functions';

// Environment Tools
export * from './env';

// Shell Tools
export * from './shell';

// Memory & RAG Tools
export * from './memory';

// Orchestration Tools
export * from './orchestration';

// Legacy weather tool (consider moving to a 'misc' or 'external' domain)
export { weatherTool } from './weather-tool';

/**
 * Get all tools as an array for dynamic registration
 * Useful for agents that need access to all available tools
 */
export function getAllTools() {
  return [
    // Functions
    ...Object.values(require('./functions')),
    // Env
    ...Object.values(require('./env')),
    // Shell
    ...Object.values(require('./shell')),
    // Memory
    ...Object.values(require('./memory')),
    // Orchestration
    ...Object.values(require('./orchestration')),
    // Misc
    require('./weather-tool').weatherTool,
  ].filter(tool => tool && typeof tool === 'object');
}

/**
 * Get tools by domain
 */
export function getToolsByDomain(domain: 'functions' | 'env' | 'shell' | 'memory' | 'orchestration') {
  const domainExports = require(`./${domain}`);
  return Object.values(domainExports).filter(tool => tool && typeof tool === 'object');
}
