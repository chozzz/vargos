# CLI App Requirements

## Overview

A lightweight CLI application that provides an interactive interface for chatting with Mastra agents. The CLI acts as a thin UI layer - all chat logic, memory, and tool execution is handled by the Mastra agent.

**Reference:** Claude CLI interface structure with three main areas: input stream, output box, and hint area.

## User Interface

### Three-Panel Layout (Claude CLI Style)

1. **Input Stream Area**
   - Multi-line text input for user messages
   - Command history (up/down arrows)
   - Auto-completion for REPL commands
   - Visual indicator when sending to agent

2. **Output Box**
   - Displays agent responses with streaming support
   - Markdown rendering (headers, lists, code blocks)
   - Syntax highlighting for code blocks
   - Tool call indicators when agent invokes MCP tools
   - Scrollable for long responses

3. **Hint Area**
   - Contextual hints and suggestions
   - Available REPL commands
   - Keyboard shortcuts
   - Connection status

## Core Features

### Interactive REPL Mode
- Continuous conversation loop
- Multi-line input support
- Command history navigation
- Streaming response display

### Command Mode
- One-shot queries: `vargos-cli "query"`
- Stdin support: `echo "query" | vargos-cli`

### Agent Communication
- Connect to Mastra server (default: `http://localhost:4862`)
- Stream responses in real-time
- Display tool calls and execution status
- Handle connection errors gracefully

### Session Management
- Continue previous conversations (handled by agent memory)
- Start new sessions
- Switch between sessions

## REPL Commands

Minimal command set (Claude CLI style):

- `.help` - Show help
- `.agent [name]` - Switch agent
- `.agents` - List available agents
- `.session [id]` - Switch session
- `.new` - New session
- `.clear` - Clear screen
- `.exit` / `.quit` - Exit

## Configuration

- Config file: `~/.config/vargos-cli/config.yaml`
- Settings: Mastra URL, default agent, theme
- Environment variables: `VARGOS_CLI_MASTRA_URL`, `VARGOS_CLI_AGENT`

## Technical Stack

- **Language**: TypeScript/Node.js
- **Terminal UI**: Terminal library for three-panel layout
- **Streaming**: HTTP/SSE for real-time responses
- **Markdown**: Renderer for agent output
- **Build**: Integrate with pnpm workspace

## Non-Requirements

All handled by Mastra agent:
- ❌ Chat logic
- ❌ Memory management
- ❌ Tool execution
- ❌ Model/role configuration

