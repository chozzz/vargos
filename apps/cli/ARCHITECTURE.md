# CLI App Architecture

## Overview

The CLI app follows a layered architecture with clear separation of concerns. It acts as a thin UI layer that communicates with Mastra agents via HTTP/SSE streaming.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Application                       │
├─────────────────────────────────────────────────────────┤
│  UI Layer (Terminal Interface)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Input Stream │  │ Output Box   │  │ Hint Area    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────┤
│  Command Layer (REPL & CLI Commands)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ REPL Handler │  │ Command      │  │ History      │ │
│  │              │  │ Parser       │  │ Manager      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────┤
│  Agent Communication Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ API Client   │  │ Stream       │  │ Session      │ │
│  │              │  │ Handler      │  │ Manager      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────┤
│  Configuration & State                                  │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │ Config       │  │ State        │                    │
│  │ Manager      │  │ Store        │                    │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Mastra Server (Port 4862)                  │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │ Agents       │  │ MCP Tools    │                    │
│  │ Memory       │  │ Streaming    │                    │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

## Component Structure

### 1. UI Layer

**Purpose:** Terminal interface with three-panel layout

**Components:**
- `ui/input_panel.rs` - Input stream area with multi-line support
- `ui/output_panel.rs` - Output box with markdown rendering
- `ui/hint_panel.rs` - Hint area with contextual information
- `ui/layout.rs` - Three-panel layout manager (ratatui Layout)
- `ui/renderer.rs` - Markdown and syntax highlighting (pulldown-cmark + syntect)

**Terminal UI Library:** `ratatui` (recommended) or `crossterm` (minimal)
- **ratatui**: High-level TUI framework with widgets, layouts, and state management
- **crossterm**: Low-level terminal control (more manual work, but lighter)

**Recommendation:** `ratatui` for three-panel layout with built-in widgets

### 2. Command Layer

**Purpose:** Handle REPL commands and user input

**Components:**
- `commands/repl.rs` - Main REPL loop (ratatui event handling)
- `commands/parser.rs` - Parse REPL commands (`.help`, `.agent`, etc.)
- `commands/executor.rs` - Execute commands
- `commands/history.rs` - Command history (up/down arrows)

**Flow:**
```
User Input → CommandParser → Is REPL Command? 
  ├─ Yes → CommandExecutor → Update UI/State
  └─ No → Send to Agent Communication Layer
```

### 3. Agent Communication Layer

**Purpose:** Communicate with Mastra server

**Components:**
- `agent/client.rs` - HTTP client for Mastra API (reqwest)
- `agent/stream.rs` - Handle SSE streaming responses (eventsource-stream)
- `agent/session.rs` - Manage conversation sessions
- `agent/discovery.rs` - List and select agents

**API Endpoints (to be confirmed with Mastra):**
- `GET /agents` - List available agents
- `GET /agents/:name` - Get agent info
- `POST /agents/:name/chat` - Send message (with session ID)
- `GET /agents/:name/chat/stream` - Stream response (SSE)

**Streaming Format:**
```rust
// SSE event stream
event: message
data: {"type": "text", "content": "..."}

event: tool_call
data: {"tool": "weatherTool", "status": "calling"}

event: done
data: {}
```

**Rust Implementation:**
```rust
// Using eventsource-stream for SSE parsing
use eventsource_stream::Eventsource;
use futures_util::StreamExt;

let response = reqwest::get(url).await?;
let mut stream = response.bytes_stream().eventsource();

while let Some(event) = stream.next().await {
    match event? {
        Event::Message(msg) => {
            // Handle message
        }
        _ => {}
    }
}
```

### 4. Configuration & State

**Purpose:** Manage configuration and application state

**Components:**
- `config/manager.rs` - Load/save configuration (serde_yaml)
- `state/store.rs` - Application state (current agent, session, etc.)

**State Structure:**
```rust
pub struct AppState {
    pub current_agent: Option<String>,
    pub current_session: Option<String>,
    pub mastra_url: String,
    pub is_connected: bool,
    pub history: Vec<String>,
}
```

## Data Flow

### Interactive Mode Flow

```
1. User types in Input Panel
   ↓
2. CommandParser checks if REPL command
   ├─ REPL Command → Execute locally
   └─ User Message → Continue
   ↓
3. AgentClient.sendMessage(message, sessionId)
   ↓
4. Mastra Server processes via agent
   ↓
5. StreamHandler receives SSE events
   ↓
6. OutputPanel renders streaming content
   ↓
7. HintPanel updates with status
```

### Command Mode Flow

```
1. CLI argument or stdin input
   ↓
2. AgentClient.sendMessage(message)
   ↓
3. StreamHandler receives response
   ↓
4. Output to stdout (no UI)
```

## File Structure

```
apps/cli/
├── src/
│   ├── main.rs                  # Entry point
│   ├── cli.rs                   # CLI argument parsing (clap)
│   │
│   ├── ui/                      # UI Layer
│   │   ├── mod.rs
│   │   ├── layout.rs            # Three-panel layout
│   │   ├── input_panel.rs       # Input stream area
│   │   ├── output_panel.rs      # Output box
│   │   ├── hint_panel.rs        # Hint area
│   │   └── renderer.rs          # Markdown rendering
│   │
│   ├── commands/                # Command Layer
│   │   ├── mod.rs
│   │   ├── repl.rs              # REPL handler
│   │   ├── parser.rs            # Command parser
│   │   ├── executor.rs          # Command executor
│   │   └── history.rs           # History manager
│   │
│   ├── agent/                   # Agent Communication
│   │   ├── mod.rs
│   │   ├── client.rs            # HTTP client (reqwest)
│   │   ├── stream.rs            # SSE stream handler
│   │   ├── session.rs           # Session manager
│   │   └── discovery.rs         # Agent discovery
│   │
│   ├── config/                  # Configuration
│   │   ├── mod.rs
│   │   ├── manager.rs           # Config manager
│   │   └── types.rs             # Config types
│   │
│   ├── state/                   # State Management
│   │   ├── mod.rs
│   │   └── store.rs             # Application state
│   │
│   └── utils/                   # Utilities
│       ├── mod.rs
│       ├── logger.rs
│       └── errors.rs
│
├── Cargo.toml
└── README.md
```

## Technology Stack

### Core Dependencies (Rust)

```toml
[dependencies]
# Terminal UI
ratatui = "0.26"              # TUI framework (built on crossterm)
crossterm = "0.28"            # Low-level terminal control

# Async runtime
tokio = { version = "1.34", features = ["rt", "rt-multi-thread", "macros", "time", "signal"] }
tokio-stream = "0.1"          # Stream utilities

# HTTP client & SSE
reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls"] }
eventsource-stream = "0.3"    # SSE parsing

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
serde_yaml = "0.9"

# CLI argument parsing
clap = { version = "4.4", features = ["derive"] }

# Markdown rendering
pulldown-cmark = "0.9"        # Markdown parser
syntect = "5.0"               # Syntax highlighting

# Utilities
anyhow = "1.0"                # Error handling
dirs = "6.0"                  # Config directory
log = "0.4"                   # Logging
simplelog = "0.12"            # Simple logger

# Text processing
unicode-width = "0.2"         # Unicode width calculation
textwrap = "0.16"             # Text wrapping
```

**Binary Size:** ~3-6MB (statically linked)  
**Startup Time:** ~10-50ms  
**Memory Footprint:** ~5-10MB

## Key Design Decisions

### 1. Terminal UI Library Choice

**ratatui** (Recommended):
- ✅ High-level TUI framework with widgets
- ✅ Built on crossterm (cross-platform)
- ✅ Excellent layout system (Layout, Constraint)
- ✅ State management patterns
- ✅ Good performance
- ✅ Active development and community

**crossterm** (Minimal Alternative):
- ✅ Lower-level, more control
- ✅ Smaller binary size
- ✅ Faster startup
- ❌ More manual work for layouts
- ❌ Need to implement widgets yourself

### 2. Streaming Implementation

**Server-Sent Events (SSE)**:
- Simple text-based protocol
- One-way (server → client)
- Works well with Rust async streams
- Use `eventsource-stream` crate for parsing

**Implementation:**
```rust
use eventsource_stream::Eventsource;
use futures_util::StreamExt;

let response = reqwest::get(url).await?;
let mut stream = response.bytes_stream().eventsource();

while let Some(event) = stream.next().await {
    // Process SSE events
}
```

**WebSocket** (Alternative):
- Bidirectional communication
- More complex setup
- Overkill for this use case

### 3. State Management

**Simple State Struct**:
- Rust struct with interior mutability (Arc<Mutex<>>)
- Event-driven updates via tokio channels
- No external state management needed
- Type-safe with Rust's ownership system

### 4. Configuration

**YAML Config File**:
- Human-readable
- Easy to edit
- Standard format
- Location: `~/.config/vargos-cli/config.yaml`
- Parsed with `serde_yaml`

**Config Structure:**
```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    pub mastra_url: String,
    pub default_agent: Option<String>,
    pub default_session: Option<String>,
    pub theme: Theme,
}
```

## Error Handling

### Error Categories

1. **Connection Errors**
   - Mastra server unavailable
   - Network timeouts
   - Retry with exponential backoff

2. **Agent Errors**
   - Agent not found
   - Invalid session ID
   - Clear error messages in Hint Panel

3. **Input Errors**
   - Invalid REPL commands
   - Malformed input
   - Show help in Hint Panel

## Performance Considerations

1. **Streaming**: Render chunks as they arrive (no buffering) - Rust's zero-cost abstractions
2. **History**: Limit to last 1000 commands (Vec with capacity)
3. **Markdown**: Lazy parse only visible content (pulldown-cmark is fast)
4. **Reconnection**: Exponential backoff (1s, 2s, 4s, max 30s) - tokio::time
5. **Memory**: Efficient string handling with `String` and `&str`
6. **Async**: Tokio runtime for non-blocking I/O
7. **Binary Size**: Release build with LTO and strip (~3-6MB)

## Testing Strategy

1. **Unit Tests**: Command parsing, state management (Rust's built-in test framework)
2. **Integration Tests**: Agent communication (mock Mastra with `wiremock` or `mockito`)
3. **E2E Tests**: Full REPL flow (optional, using `assert_cmd`)

**Example:**
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_command_parser() {
        // Test command parsing
    }
}
```

## Future Extensibility

1. **Plugin System**: Dynamic library loading (dlopen) or subprocess-based plugins
2. **Themes**: Customizable colors/styles (ratatui Style system)
3. **Export**: Conversation export (markdown, JSON) - serde serialization
4. **Multi-agent**: Switch between agents mid-conversation
5. **Native Performance**: Zero-cost abstractions, no runtime overhead

## Build Configuration

**Cargo.toml:**
```toml
[package]
name = "vargos-cli"
version = "0.1.0"
edition = "2021"

[profile.release]
lto = true          # Link-time optimization
strip = true        # Strip symbols
opt-level = "z"     # Optimize for size
codegen-units = 1   # Better optimization
```

**Binary Distribution:**
- Single static binary (no dependencies)
- Cross-compilation support (cargo cross)
- ~3-6MB binary size
- ~10-50ms startup time

