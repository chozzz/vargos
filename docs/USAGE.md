# Vargos Usage Guide

Complete guide to using Vargos: CLI, MCP server, Cron scheduler, and background agents.

---

## Table of Contents

1. [CLI Mode](#cli-mode)
2. [MCP Server Mode](#mcp-server-mode)
3. [Cron Scheduler](#cron-scheduler)
4. [Background Agents](#background-agents)
5. [Session Management](#session-management)
6. [Common Workflows](#common-workflows)

---

## CLI Mode

Interactive command-line interface for chatting with the Vargos agent.

### Start Interactive Chat

```bash
# Basic usage
pnpm cli chat

# With custom session (for continuity)
pnpm cli chat -s myproject

# With specific model
pnpm cli chat -m gpt-4o -p openai

# With custom workspace directory
pnpm cli chat -w ./my-project
```

**What you'll see:**
```
🤖 Vargos CLI
Workspace: /home/user/my-project        # Current directory (tool operations)
Context: ~/.vargos/workspace            # AGENTS.md, SOUL.md, etc.
Data: ~/.vargos                         # Sessions, memory.db
Model: openai/gpt-4o-mini
Memory: file (local)
Sessions: file (local)
Context files: AGENTS.md, TOOLS.md

Type your message, or "exit" to quit.

You: _
```

### Run One-Shot Task

Execute a single task and exit:

```bash
# Analyze codebase
pnpm cli run "Analyze this codebase for security issues"

# Refactor specific file
pnpm cli run "Refactor src/auth.ts to use dependency injection"

# With custom workspace
pnpm cli run "Generate tests for all functions" -w ./src
```

**Flow example:**
```
$ pnpm cli run "List all TODOs in the codebase"

🤖 Vargos CLI
Task: List all TODOs in the codebase
Workspace: /home/user/project
Model: openai/gpt-4o-mini

✓ Services initialized
Running task...

🔧 exec: command="grep -r 'TODO' src/"

🔧 Tool: exec
✅ exec → STDOUT:
src/auth.ts:  // TODO: Implement refresh token
src/db.ts:    // TODO: Add connection pooling
src/api.ts:   // TODO: Rate limiting

Exit code: 0

Found 3 TODOs:
1. src/auth.ts - Implement refresh token
2. src/db.ts - Add connection pooling
3. src/api.ts - Rate limiting
```

---

## MCP Server Mode

Run Vargos as an MCP server for Claude Desktop, Cursor, or other MCP clients.

### Start MCP Server

```bash
# Stdio mode (for Claude Desktop)
pnpm cli server

# Or directly
pnpm dev
```

**What you'll see:**
```
🔧 Vargos MCP Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Version: 0.0.1
Mode: stdio

📁 Configuration:
  Workspace: /home/user/.vargos/workspace
  Memory: file (local)
  Sessions: file (./sessions)

🔌 Services:
  ✓ MemoryContext initialized
  ✓ SessionService initialized
  ✓ PiAgentRuntime initialized

📝 Context Files:
  ✓ AGENTS.md
  ✓ TOOLS.md
  ✗ SOUL.md (optional)
  ✗ USER.md (optional)

📡 Server:
  Transport: stdio
  Tools: 15 registered

✅ Ready for connections
```

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vargos": {
      "command": "pnpm",
      "args": ["--cwd", "/path/to/vargos", "cli", "server"],
      "env": {
        "VARGOS_WORKSPACE": "/path/to/workspace"
      }
    }
  }
}
```

### MCP Tool Usage Flow

**Example 1: File Operations**
```
User: Read the README file

Claude: I'll read the README for you.

🔧 read: path="README.md"
✅ read → # Vargos
Vargos is an MCP server with an embedded agent runtime...
```

**Example 2: Execute Commands**
```
User: Check git status

Claude: Let me check the git status.

🔧 exec: command="git status"
✅ exec → On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

**Example 3: Memory Search**
```
User: What did we discuss about authentication?

Claude: Let me search the memory.

🔧 memory_search: query="authentication"
✅ memory_search → Found 3 matches:
- memory/2026-02-08.md#L45: "Discussed OAuth vs JWT..."
- memory/2026-02-07.md#L12: "Auth middleware design..."
```

---

## Cron Scheduler

Automate periodic tasks with scheduled background agents.

### Start the Scheduler

```bash
pnpm cli scheduler
```

**What you'll see:**
```
📅  Starting Cron Scheduler
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅  Scheduler started

Scheduled Tasks (2):
  • Vargos Morning Analysis (AEST)
    Schedule: 0 23 * * *
    Status: ✅ Enabled

  • Vargos Evening Analysis (AEST)
    Schedule: 0 11 * * *
    Status: ✅ Enabled

Times are in UTC:
  23:00 UTC = 09:00 AEST (morning)
  11:00 UTC = 21:00 AEST (evening)

Press Ctrl+C to stop
```

### How Cron Works

1. **Schedule triggers** → Creates parent session
2. **Spawns subagent** → Agent executes the task
3. **Results stored** → Transcript saved to session
4. **Notification** (future) → Send results via configured channel

**Flow diagram:**
```
Cron Schedule
     ↓
Create Session (cron:task-id:timestamp)
     ↓
Spawn Subagent
     ↓
Execute Task
     ↓
Store Results
     ↓
(Notify User - future)
```

### View Scheduled Tasks

Tasks are defined in `src/cron/tasks/`. Currently configured:

| Task | Schedule | Description |
|------|----------|-------------|
| Morning Analysis | 0 23 * * * | Daily code analysis at 9 AM AEST |
| Evening Analysis | 0 11 * * * | Daily review at 9 PM AEST |

---

## Background Agents

Spawn agents that run independently and report back.

### Spawn from CLI

```bash
# Start interactive chat
pnpm cli chat

# Then in chat:
You: Spawn an agent to analyze our test coverage
```

**What happens:**
```
You: Spawn an agent to analyze our test coverage

🤖 Agent:
I'll spawn a background agent to analyze test coverage.

🔧 sessions_spawn:
  task: "Analyze test coverage in this codebase"
  label: "coverage-analysis"

✅ sessions_spawn → Spawned sub-agent session: agent:default:subagent:123456
Task: Analyze test coverage in this codebase

The sub-agent is running in the background.
You will receive an announcement when it completes.
```

### How Background Agents Work

**Spawn flow:**
```
Parent Session (CLI chat)
     ↓
sessions_spawn called
     ↓
Create Child Session (agent:default:subagent:xxx)
     ↓
Start Pi Runtime with minimal context
     ↓
Agent executes task (independent process)
     ↓
On completion → Announce result to parent
```

**Agent limitations:**
- Cannot spawn other subagents
- Minimal context (AGENTS.md + TOOLS.md only)
- Cannot use session tools (sessions_list, sessions_send, etc.)

### Monitoring Background Agents

**Current:** Check session list
```bash
# In another terminal
pnpm cli chat

You: List all sessions

🔧 sessions_list

Session: cli:main (you)
Session: agent:default:subagent:123456 (running)
  Label: coverage-analysis
  Kind: subagent
  Status: active
```

**Future (with TUI):** Real-time dashboard showing:
- Active agents with progress bars
- Live transcript/output
- Kill/restart controls

### Agent Output Channels

| Channel | Status | How |
|---------|--------|-----|
| Session announcement | ✅ Working | Results posted to parent session |
| File output | ✅ Working | Agent writes to `memory/results/*.md` |
| Console log | ✅ Working | Logs to `~/.vargos/sessions/` |
| WhatsApp | 🚧 Future | Via gateway |
| Discord | 🚧 Future | Via gateway |
| Webhook | 🚧 Easy add | HTTP POST |

**Best practice for file output:**
```markdown
In your spawn task:
"Analyze the codebase and write findings to memory/results/analysis-{{timestamp}}.md"
```

---

## Session Management

Sessions persist conversation history and state.

### Session Types

| Type | Prefix | Use Case |
|------|--------|----------|
| CLI | `cli:` | Interactive terminal sessions |
| MCP | `mcp:` | MCP client connections |
| Subagent | `agent:*:subagent:` | Background tasks |
| Cron | `cron:*` | Scheduled tasks |

### List Sessions

```bash
pnpm cli chat

You: List my sessions

🔧 sessions_list

Found 4 sessions:

Session: cli:main
  Kind: main
  Label: CLI Chat (main)
  Updated: 2026-02-08T14:32:00Z
  Messages: 47

Session: cli:myproject  
  Kind: main
  Label: CLI Chat (myproject)
  Updated: 2026-02-07T09:15:00Z
  Messages: 12

Session: agent:default:subagent:abc123
  Kind: subagent
  Label: Task: coverage analysis...
  Updated: 2026-02-08T14:30:00Z
```

### View Session History

```bash
You: Show history for cli:myproject

🔧 sessions_history: sessionKey="cli:myproject", limit=10

Session: cli:myproject
Total messages: 12
---

[1] 2026-02-07T09:00:00 - user:
  "Start a new React project"

[2] 2026-02-07T09:00:05 - assistant:
  "I'll help you start a React project..."

[3] 2026-02-07T09:00:08 - tool: exec
  "npx create-react-app my-app"
```

### Session Continuity

Sessions persist across restarts:

```bash
# Monday
pnpm cli chat -s myproject
You: Working on feature X...
^C (exit)

# Tuesday - resume same session
pnpm cli chat -s myproject
# Context preserved, can continue conversation
```

---

## Common Workflows

### Workflow 1: Code Review Agent

```bash
# 1. Start chat
pnpm cli chat -s code-review

# 2. Spawn review agent
You: Spawn an agent to review src/auth.ts for security issues
      Write results to memory/reviews/auth-security.md

# 3. Continue working while agent runs...
You: (do other work)

# 4. Check when done
You: List sessions
# See agent completed

# 5. Read results
You: Read memory/reviews/auth-security.md
```

### Workflow 2: Daily Standup Notes

```bash
# 1. Configure morning cron
pnpm cli scheduler

# 2. Or manually generate
pnpm cli chat -s standup

You: Summarize what I worked on yesterday by reading memory/2026-02-07.md
     and generate today's standup notes

# 3. Agent reads memory, generates summary
```

### Workflow 3: MCP + Claude Desktop

```bash
# Terminal 1: Start MCP server
pnpm cli server

# Terminal 2: Or use with Claude Desktop
# (Claude Desktop auto-starts via config)
```

**In Claude Desktop:**
```
User: Analyze the codebase structure

Claude: 🔧 exec: command="find src -type f -name '*.ts' | head -20"
        ✅ Found 18 TypeScript files...
        
        🔧 read: path="src/index.ts"
        ✅ Reading main entry point...
        
        The codebase has a clean structure...
```

### Workflow 4: Multi-Session Project

```bash
# Session 1: Backend work
pnpm cli chat -s backend-api
You: Design the API endpoints...

# Session 2: Frontend work  
pnpm cli chat -s frontend-ui
You: Create React components...

# Session 3: DevOps
pnpm cli chat -s devops-deploy
You: Write deployment scripts...
```

Each session maintains its own context and history.

---

## Quick Reference

### Commands

```bash
# Interactive chat
pnpm cli chat                    # Default session
pnpm cli chat -s <name>          # Named session
pnpm cli chat -m <model>         # Specific model
pnpm cli chat -p <provider>      # Specific provider

# One-shot task
pnpm cli run "<task>"
pnpm cli run "<task>" -w <dir>

# MCP server
pnpm cli server                  # Stdio mode
pnpm dev                         # Same as above

# Scheduler
pnpm cli scheduler               # Start cron jobs

# Configuration
pnpm cli config                  # Interactive config
pnpm cli config:get              # Show current config
pnpm cli config:set              # Set LLM config
```

### Key Environment Variables

```bash
VARGOS_WORKSPACE=<dir>           # Working directory
VARGOS_MEMORY_BACKEND=file       # Memory backend
VARGOS_SESSIONS_BACKEND=file     # Sessions backend
OPENAI_API_KEY=sk-xxx           # For embeddings
QDRANT_URL=http://...            # For vector search
POSTGRES_URL=postgresql://...    # For session storage
```

### Directory Structure

```
~/.vargos/
├── workspace/           # Context files (AGENTS.md, etc.)
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── USER.md
│   ├── TOOLS.md
│   ├── MEMORY.md
│   ├── HEARTBEAT.md
│   ├── BOOTSTRAP.md
│   └── memory/          # Daily notes (YYYY-MM-DD.md)
├── sessions/            # Session JSONL files
└── memory.db            # SQLite embeddings cache
```

---

## Troubleshooting

### Check if services are running

```bash
# List active sessions
pnpm cli chat
You: List all sessions

# Check session details
You: Show history for <session-key>
```

### Reset a stuck session

```bash
# Delete and recreate
pnpm cli chat
You: Send a message to <session-key>: "/reset"

# Or manually delete session file
rm ~/.vargos/sessions/<session-key>.jsonl
```

### View logs

```bash
# Session transcripts are JSONL files
cat ~/.vargos/sessions/cli-main.jsonl

# Pretty print
jq . ~/.vargos/sessions/cli-main.jsonl
```

---

*For more details, see [ARCHITECTURE.md](./ARCHITECTURE.md) and [README.md](./README.md)*
