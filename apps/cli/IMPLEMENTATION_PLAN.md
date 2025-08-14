# CLI Implementation Plan

## Overview

This document outlines a phased approach to implementing the CLI app, with each phase being independently testable. We'll also identify shared utilities that can be consumed by Node.js projects in the monorepo.

## Shared Utilities Strategy

### Shared Package: `@vargos/mastra-client`

Create a shared package that both Rust CLI and Node.js apps can use:

**Location:** `packages/mastra-client/`

**Contents:**
- TypeScript types for Mastra API (consumed by Node.js)
- JSON schemas for API contracts (consumed by Rust via codegen)
- API endpoint definitions
- Error types
- Config schemas

**Benefits:**
- Single source of truth for API contracts
- Type safety across languages
- Easier maintenance
- Rust can generate types from JSON schemas using `schemars` + `ts-rs`

## Phase 0: Foundation & Shared Types

**Goal:** Set up project structure and shared API contracts

**Duration:** 1-2 days

### Tasks

1. **Create Rust project structure**
   ```bash
   cd apps/cli
   cargo init --name vargos-cli
   ```

2. **Create shared package**
   ```bash
   mkdir -p packages/mastra-client/src
   ```

3. **Define API types in TypeScript** (`packages/mastra-client/src/types.ts`)
   ```typescript
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
   ```

4. **Generate JSON schemas** (using `typescript-json-schema`)
   ```bash
   npm install -D typescript-json-schema
   ```

5. **Rust codegen setup** (generate Rust types from schemas)
   - Use `schemars` for schema validation
   - Use `ts-rs` or manual conversion for type generation

6. **Basic Cargo.toml setup**
   - Add dependencies
   - Configure build profiles

### Deliverables

- ✅ Rust project structure
- ✅ Shared TypeScript types package
- ✅ JSON schemas for API contracts
- ✅ Rust types generated from schemas
- ✅ Basic build configuration

### Testing

- [ ] TypeScript types compile
- [ ] JSON schemas validate
- [ ] Rust types compile
- [ ] Shared package can be imported in Node.js apps

---

## Phase 1: Configuration & Basic CLI

**Goal:** Implement configuration management and basic CLI argument parsing

**Duration:** 1-2 days

### Tasks

1. **Config manager** (`src/config/manager.rs`)
   - Load/save YAML config
   - Default config creation
   - Environment variable overrides

2. **CLI argument parsing** (`src/cli.rs`)
   - Using `clap`
   - Support: `vargos-cli [message]`, `vargos-cli --agent <name>`, etc.

3. **State store** (`src/state/store.rs`)
   - Basic state structure
   - State persistence (optional)

4. **Error handling** (`src/utils/errors.rs`)
   - Custom error types
   - Error formatting

### Deliverables

- ✅ Config file management (`~/.config/vargos-cli/config.yaml`)
- ✅ CLI argument parsing
- ✅ Basic state management
- ✅ Error handling framework

### Testing

```bash
# Test config creation
vargos-cli --help
vargos-cli --version

# Test config loading
vargos-cli --config-path /tmp/test-config.yaml

# Test environment overrides
VARGOS_CLI_MASTRA_URL=http://localhost:9999 vargos-cli
```

---

## Phase 2: Agent Communication (Non-Streaming)

**Goal:** Implement basic HTTP client for Mastra API (non-streaming)

**Duration:** 2-3 days

### Tasks

1. **HTTP client** (`src/agent/client.rs`)
   - Basic reqwest setup
   - Agent discovery (`GET /agents`)
   - Agent info (`GET /agents/:name`)
   - Chat endpoint (`POST /agents/:name/chat`) - non-streaming

2. **Session management** (`src/agent/session.rs`)
   - Session ID handling
   - Session creation/retrieval

3. **Agent discovery** (`src/agent/discovery.rs`)
   - List available agents
   - Validate agent exists

4. **Error handling for network**
   - Connection errors
   - Timeout handling
   - Retry logic (basic)

### Deliverables

- ✅ HTTP client for Mastra API
- ✅ Agent discovery
- ✅ Non-streaming chat requests
- ✅ Session management

### Testing

```bash
# Prerequisites: Mastra server running on port 4862

# Test agent discovery
vargos-cli --list-agents

# Test agent info
vargos-cli --agent-info vargosAgent

# Test non-streaming chat
vargos-cli --agent vargosAgent "Hello, what can you do?"
```

### Integration Test

```rust
#[tokio::test]
async fn test_agent_discovery() {
    let client = AgentClient::new("http://localhost:4862");
    let agents = client.list_agents().await.unwrap();
    assert!(!agents.is_empty());
}
```

---

## Phase 3: Command Mode (One-Shot)

**Goal:** Implement command mode for one-shot queries

**Duration:** 1-2 days

### Tasks

1. **Command mode handler** (`src/main.rs`)
   - Detect command mode (has message argument or stdin)
   - Send message to agent
   - Display response to stdout
   - Exit after response

2. **Stdin support**
   - Read from stdin
   - Handle piped input

3. **Output formatting**
   - Basic text output
   - Markdown rendering (simple)
   - Error output to stderr

### Deliverables

- ✅ Command mode working
- ✅ Stdin support
- ✅ Basic output formatting

### Testing

```bash
# Test one-shot command
vargos-cli "What's the weather in San Francisco?"

# Test stdin
echo "Hello" | vargos-cli

# Test with agent selection
vargos-cli --agent weatherAgent "What's the weather?"

# Test error handling
vargos-cli --agent nonexistent "Hello"
```

---

## Phase 4: Streaming Support

**Goal:** Implement SSE streaming for real-time responses

**Duration:** 2-3 days

### Tasks

1. **SSE stream handler** (`src/agent/stream.rs`)
   - Parse SSE events using `eventsource-stream`
   - Handle different event types (message, tool_call, done)
   - Error handling for stream interruptions

2. **Update HTTP client**
   - Add streaming endpoint (`GET /agents/:name/chat/stream`)
   - Handle streaming responses

3. **Stream processing**
   - Buffer chunks
   - Handle tool call events
   - Display progress indicators

4. **Command mode with streaming**
   - Update command mode to use streaming
   - Real-time output display

### Deliverables

- ✅ SSE streaming support
- ✅ Real-time response display
- ✅ Tool call event handling
- ✅ Streaming in command mode

### Testing

```bash
# Test streaming in command mode
vargos-cli "Tell me a long story"

# Verify chunks appear in real-time
# Verify tool calls are displayed
```

### Integration Test

```rust
#[tokio::test]
async fn test_streaming_chat() {
    let client = AgentClient::new("http://localhost:4862");
    let mut stream = client.chat_stream("vargosAgent", "Hello", None).await.unwrap();
    
    let mut received = false;
    while let Some(event) = stream.next().await {
        received = true;
        // Verify event structure
    }
    assert!(received);
}
```

---

## Phase 5: Basic REPL (No UI)

**Goal:** Implement REPL loop without UI (simple input/output)

**Duration:** 2-3 days

### Tasks

1. **REPL handler** (`src/commands/repl.rs`)
   - Basic read-eval-print loop
   - Read from stdin line by line
   - Parse commands vs messages
   - Exit on `.exit` or Ctrl+C

2. **Command parser** (`src/commands/parser.rs`)
   - Parse REPL commands (`.help`, `.agent`, `.exit`)
   - Validate command syntax

3. **Command executor** (`src/commands/executor.rs`)
   - Execute REPL commands
   - Update state
   - Display results

4. **History manager** (`src/commands/history.rs`)
   - Basic history storage
   - Up/down arrow navigation (if possible without UI)

### Deliverables

- ✅ Basic REPL loop
- ✅ REPL commands working
- ✅ Command history (basic)

### Testing

```bash
# Test REPL mode
vargos-cli

# In REPL:
> .help
> .agents
> .agent vargosAgent
> Hello, how are you?
> .exit
```

---

## Phase 6: Terminal UI - Basic Layout

**Goal:** Implement three-panel layout with ratatui

**Duration:** 3-4 days

### Tasks

1. **UI setup** (`src/ui/layout.rs`)
   - Initialize ratatui terminal
   - Create three-panel layout
   - Basic rendering loop

2. **Input panel** (`src/ui/input_panel.rs`)
   - Text input widget
   - Multi-line support
   - Basic editing

3. **Output panel** (`src/ui/output_panel.rs`)
   - Scrollable text area
   - Basic text rendering
   - Scroll handling

4. **Hint panel** (`src/ui/hint_panel.rs`)
   - Static hint display
   - Connection status
   - Basic info

5. **Event handling**
   - Keyboard events
   - Terminal resize
   - Quit handling

### Deliverables

- ✅ Three-panel layout visible
- ✅ Basic input/output working
- ✅ Terminal event handling

### Testing

```bash
# Test UI startup
vargos-cli

# Verify:
# - Three panels are visible
# - Can type in input panel
# - Output panel displays text
# - Hint panel shows info
# - Can quit with Ctrl+C or .exit
```

---

## Phase 7: REPL Integration with UI

**Goal:** Integrate REPL commands with UI

**Duration:** 2-3 days

### Tasks

1. **Connect REPL to UI**
   - Wire REPL handler to UI events
   - Display command results in output panel
   - Update hint panel with status

2. **Command execution in UI**
   - Execute REPL commands
   - Update UI state
   - Display command output

3. **History in UI**
   - Up/down arrow navigation
   - History display
   - History persistence

4. **Input handling**
   - Multi-line input
   - Command vs message detection
   - Auto-completion (basic)

### Deliverables

- ✅ REPL commands work in UI
- ✅ History navigation
- ✅ Command output in UI

### Testing

```bash
# Test REPL commands in UI
vargos-cli

# In UI:
# - Type .help, see help in output panel
# - Type .agents, see agent list
# - Use up/down arrows for history
# - Switch agents with .agent command
```

---

## Phase 8: Streaming in UI

**Goal:** Integrate streaming responses into UI

**Duration:** 2-3 days

### Tasks

1. **Streaming to output panel**
   - Update output panel as chunks arrive
   - Handle scrolling during streaming
   - Display tool call indicators

2. **Progress indicators**
   - Loading spinner
   - Tool call status
   - Connection status

3. **Stream interruption**
   - Handle Ctrl+C during streaming
   - Clean up on error
   - Display error messages

4. **Performance optimization**
   - Efficient rendering
   - Debounce updates if needed
   - Memory management

### Deliverables

- ✅ Streaming responses in UI
- ✅ Real-time updates
- ✅ Tool call indicators
- ✅ Progress feedback

### Testing

```bash
# Test streaming in UI
vargos-cli

# In UI:
# - Type a message
# - See response stream in real-time
# - See tool calls when agent uses tools
# - Verify smooth scrolling
```

---

## Phase 9: Markdown Rendering

**Goal:** Implement markdown rendering in output panel

**Duration:** 2-3 days

### Tasks

1. **Markdown parser** (`src/ui/renderer.rs`)
   - Parse markdown with `pulldown-cmark`
   - Convert to ratatui widgets
   - Handle code blocks

2. **Syntax highlighting** (`src/ui/renderer.rs`)
   - Use `syntect` for syntax highlighting
   - Support common languages
   - Fallback for unknown languages

3. **Text formatting**
   - Headers
   - Lists
   - Bold/italic
   - Links (display as text)

4. **Code block rendering**
   - Syntax highlighted code
   - Scrollable code blocks
   - Language labels

### Deliverables

- ✅ Markdown rendering
- ✅ Syntax highlighting
- ✅ Formatted text display

### Testing

```bash
# Test markdown rendering
vargos-cli

# Ask agent to return markdown:
# - Headers
# - Code blocks
# - Lists
# - Bold/italic text
```

---

## Phase 10: Polish & Error Handling

**Goal:** Polish UI, improve error handling, add edge cases

**Duration:** 2-3 days

### Tasks

1. **Error handling improvements**
   - Network error recovery
   - Retry logic with exponential backoff
   - Clear error messages
   - Error display in UI

2. **UI polish**
   - Better colors/themes
   - Improved layouts
   - Better spacing
   - Status indicators

3. **Edge cases**
   - Very long responses
   - Network interruptions
   - Invalid agent names
   - Missing config

4. **Performance**
   - Optimize rendering
   - Reduce memory usage
   - Faster startup

### Deliverables

- ✅ Robust error handling
- ✅ Polished UI
- ✅ Edge cases handled
- ✅ Performance optimized

### Testing

```bash
# Test error scenarios
# - Stop Mastra server, verify error handling
# - Use invalid agent name
# - Test with missing config
# - Test network interruption during streaming
```

---

## Phase 11: Documentation & Release

**Goal:** Finalize documentation and prepare for release

**Duration:** 1-2 days

### Tasks

1. **Documentation**
   - README with examples
   - Command reference
   - Configuration guide
   - Troubleshooting

2. **Build optimization**
   - Release profile tuning
   - Binary size optimization
   - Cross-compilation setup

3. **Testing**
   - End-to-end tests
   - Integration tests
   - Manual testing checklist

4. **Release preparation**
   - Version tagging
   - Changelog
   - Distribution setup

### Deliverables

- ✅ Complete documentation
- ✅ Optimized builds
- ✅ Test coverage
- ✅ Release ready

---

## Dependencies Between Phases

```
Phase 0 (Foundation)
    ↓
Phase 1 (Config/CLI)
    ↓
Phase 2 (Agent Communication)
    ↓
Phase 3 (Command Mode) ──┐
    ↓                    │
Phase 4 (Streaming)      │
    ↓                    │
Phase 5 (Basic REPL)     │
    ↓                    │
Phase 6 (UI Layout)      │
    ↓                    │
Phase 7 (REPL + UI)      │
    ↓                    │
Phase 8 (Streaming + UI) │
    ↓                    │
Phase 9 (Markdown)       │
    ↓                    │
Phase 10 (Polish)        │
    ↓                    │
Phase 11 (Release)       │
    └────────────────────┘
```

## Shared Package Integration

### For Node.js Apps

```typescript
// In apps/mastra or apps/core
import { Agent, ChatRequest, ChatResponse } from '@vargos/mastra-client';

// Use types for API contracts
async function listAgents(): Promise<Agent[]> {
  // Implementation
}
```

### For Rust CLI

```rust
// Generated from JSON schemas
use vargos_mastra_client::types::{Agent, ChatRequest, ChatResponse};

// Use types for API communication
async fn list_agents() -> Result<Vec<Agent>> {
  // Implementation
}
```

## Testing Strategy

### Unit Tests
- Each module has unit tests
- Test in isolation with mocks

### Integration Tests
- Test against real Mastra server (if available)
- Test network scenarios
- Test error cases

### Manual Testing
- Each phase has manual testing checklist
- Test on different terminals
- Test on different OS (Linux, macOS)

## Success Criteria

Each phase is considered complete when:
1. ✅ All tasks completed
2. ✅ All tests passing
3. ✅ Manual testing successful
4. ✅ Code reviewed
5. ✅ Documentation updated

## Risk Mitigation

### Phase Dependencies
- Each phase can be tested independently
- Mock dependencies when needed
- Keep phases small and focused

### API Changes
- Shared types package provides single source of truth
- Version shared package if API changes
- Update both Rust and Node.js consumers

### Performance
- Profile at each phase
- Optimize early if issues found
- Keep binary size in check

## Timeline Estimate

- **Phase 0-1:** 2-4 days (Foundation)
- **Phase 2-3:** 3-5 days (Basic communication)
- **Phase 4-5:** 4-6 days (Streaming & REPL)
- **Phase 6-7:** 5-7 days (UI integration)
- **Phase 8-9:** 4-6 days (Streaming UI & Markdown)
- **Phase 10-11:** 3-5 days (Polish & Release)

**Total:** ~21-33 days (4-6 weeks)

## Next Steps

1. Review and approve this plan
2. Set up Phase 0 (Foundation)
3. Create shared package structure
4. Begin Phase 1 implementation

