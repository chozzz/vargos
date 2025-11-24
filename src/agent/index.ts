/**
 * Agent module exports
 */

export {
  buildSystemPrompt,
  resolvePromptMode,
} from './prompt.js';

export {
  SessionMessageQueue,
  getSessionMessageQueue,
  initializeSessionMessageQueue,
  type QueueMode,
  type QueuedMessage,
} from './queue.js';

export {
  AgentLifecycle,
  getAgentLifecycle,
  initializeAgentLifecycle,
  type AgentStreamEvent,
  type LifecycleEvent,
  type AssistantStreamEvent,
  type ToolStreamEvent,
  type CompactionStreamEvent,
  type LifecyclePhase,
} from './lifecycle.js';
