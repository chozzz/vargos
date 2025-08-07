/**
 * Shared types for Mastra API
 * These types are used by both Node.js apps and Rust CLI (via JSON schemas)
 */

export interface Agent {
  name: string;
  description: string;
  tools?: string[];
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
}

export interface ChatResponse {
  type: 'text' | 'tool_call' | 'done';
  content?: string;
  tool?: string;
  status?: string;
}

export interface StreamEvent {
  event: 'message' | 'tool_call' | 'done';
  data: ChatResponse;
}

export interface Config {
  mastra_url: string;
  default_agent?: string;
  default_session?: string;
  theme?: Theme;
}

export interface Theme {
  // Theme configuration (to be defined)
  [key: string]: unknown;
}

