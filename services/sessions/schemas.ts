// Session types are defined in gateway/events.ts (bus contract layer).
// Re-export from there so services can import from a local path.
export type { Session, Message, MessageRole } from '../../gateway/events.js';
