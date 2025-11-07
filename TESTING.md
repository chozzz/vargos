# Testing Vargos CLI

## Quick Start

### 1. Set up environment
```bash
# Copy test config
cp .env.test .env

# Edit with your API key (OpenRouter or OpenAI)
nano .env
```

**For OpenRouter (recommended for testing):**
```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
VARGOS_PROVIDER=openrouter
VARGOS_MODEL=openai/gpt-4o-mini
```

**Get OpenRouter key:** https://openrouter.ai/keys

### 2. Test Basic Chat
```bash
pnpm cli chat
```

**Try these prompts:**
```
You: What tools do you have available?
Expected: Lists all 15 tools including sessions_spawn

You: Read the README.md file
Expected: Shows file contents

You: Spawn a subagent to analyze this codebase
Expected: 🔧 Using sessions_spawn... (shows tool call)
```

### 3. Test One-Shot Mode
```bash
pnpm cli run "List all files in the current directory"
```

### 4. Test with Different Models
```bash
# OpenRouter with different models
VARGOS_PROVIDER=openrouter VARGOS_MODEL=anthropic/claude-3.5-sonnet pnpm cli chat

# Or configure interactively
pnpm cli config:set
```

## Expected Behavior

### Good Signs ✅
- "🔧 Using read..." appears when reading files
- "🔧 Using sessions_spawn..." appears when spawning subagents
- Agent remembers context from AGENTS.md, SOUL.md
- Can execute multiple tools in sequence

### Bad Signs ❌
- Generic responses like "I don't have access to tools"
- No tool call indicators
- "Hello! How can I help you?" (means Pi SDK still active)

## Debug Mode

If it's not working, check:

```bash
# 1. Verify .env is loaded
echo $OPENAI_API_KEY

# 2. Check which runtime is being used
# Look for "VargosAgentRuntime" in the code, not "PiAgentRuntime"
grep -r "VargosAgentRuntime" src/cli.ts

# 3. Test with explicit provider
VARGOS_PROVIDER=openai VARGOS_MODEL=gpt-4o-mini pnpm cli run "echo hello"
```

## Manual Test Script

Create `test.md`:
```markdown
# Test Checklist

- [ ] Agent responds with tool calls visible
- [ ] Can read files (shows 🔧 Using read...)
- [ ] Can spawn subagents (shows 🔧 Using sessions_spawn...)
- [ ] Context files are loaded (AGENTS.md mentioned)
- [ ] Can execute shell commands
- [ ] Can search memory
```

## Common Issues

### "Unknown tool: sessions_spawn"
→ CLI is still using Pi SDK. Make sure you've pulled latest changes.

### "No API key found"
→ Check .env file exists and has correct key format (starts with sk-)

### "Model not found"
→ For OpenRouter, use full model path: `openai/gpt-4o-mini` or `anthropic/claude-3.5-sonnet`

### Generic responses
→ Runtime not updated. Check `src/cli.ts` imports `VargosAgentRuntime` not `PiAgentRuntime`.

## Success Criteria

When you type: `Spawn a subagent to analyze this codebase`

You should see:
```
Thinking...
  🔧 Using sessions_spawn...
🤖 Agent: Spawned subagent agent:default:subagent:123456...
         The subagent is analyzing the codebase. Check 
         sessions_history to see results.
```

If you see generic responses, the unified runtime isn't active.