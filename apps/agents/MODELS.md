# Supported Models

This document lists the correct model identifiers for use in Vargos LangChain agents.

## Anthropic Claude Models

### Claude 4.5 Sonnet (Recommended - Latest)
- **Model ID**: `claude-sonnet-4-5-20250929`
- **Use for**: Production workloads, complex reasoning, best performance
- **Context**: 200K tokens
- **Cost**: Medium-High
- **Note**: Latest and most capable Claude model

### Claude 3.5 Sonnet
- **Model ID**: `anthropic/claude-3-5-sonnet-20241022`
- **Use for**: Production workloads, complex reasoning
- **Context**: 200K tokens
- **Cost**: Medium

### Claude 3.5 Haiku
- **Model ID**: `anthropic/claude-3-5-haiku-latest`
- **Use for**: Fast queries, simple tasks, query routing
- **Context**: 200K tokens
- **Cost**: Low

### Claude 3 Opus
- **Model ID**: `anthropic/claude-3-opus-20240229`
- **Use for**: Most complex tasks, highest quality
- **Context**: 200K tokens
- **Cost**: High

## OpenAI Models

### GPT-4o
- **Model ID**: `openai/gpt-4o`
- **Use for**: Multimodal tasks, general purpose
- **Context**: 128K tokens
- **Cost**: Medium

### GPT-4o Mini
- **Model ID**: `openai/gpt-4o-mini`
- **Use for**: Fast, cost-effective tasks
- **Context**: 128K tokens
- **Cost**: Low

### GPT-4 Turbo
- **Model ID**: `openai/gpt-4-turbo`
- **Use for**: Legacy workflows
- **Context**: 128K tokens
- **Cost**: High

## Configuration

### Default Models by Agent

| Agent | Default Model | Can Override? |
|-------|--------------|---------------|
| **react-agent** | `claude-sonnet-4-5-20250929` | ✅ Yes |
| **memory-agent** | `claude-sonnet-4-5-20250929` | ✅ Yes |
| **retrieval-agent** (response) | `claude-sonnet-4-5-20250929` | ✅ Yes |
| **retrieval-agent** (query) | `anthropic/claude-3-5-haiku-latest` | ✅ Yes |
| **research-agent** (response) | `claude-sonnet-4-5-20250929` | ✅ Yes |
| **research-agent** (query) | `anthropic/claude-3-5-haiku-latest` | ✅ Yes |

### Override via Configuration

**Via apps/web frontend:**
```typescript
// Pass model in URL params
http://localhost:3000?assistantId=agent&model=openai/gpt-4o
```

**Via LangGraph SDK:**
```typescript
const response = await client.runs.stream(
  thread.thread_id,
  "agent",
  {
    input: { messages: [...] },
    config: {
      configurable: {
        model: "openai/gpt-4o-mini"
      }
    }
  }
);
```

**Via Environment Variable:**
```bash
# In .env
DEFAULT_MODEL="openai/gpt-4o"
```

Then update configuration.ts:
```typescript
model: configurable.model ?? process.env.DEFAULT_MODEL ?? "claude-3-5-sonnet-20241022"
```

## Model Selection Guide

### Use Claude 3.5 Sonnet when:
- ✅ You need high-quality reasoning
- ✅ Working with complex multi-step tasks
- ✅ Cost is not the primary concern
- ✅ You want best-in-class performance

### Use Claude 3.5 Haiku when:
- ✅ You need fast response times
- ✅ Simple query routing or classification
- ✅ Cost optimization is important
- ✅ Tasks are straightforward

### Use GPT-4o when:
- ✅ You need multimodal capabilities (vision)
- ✅ You're already on OpenAI infrastructure
- ✅ You need JSON mode or function calling
- ✅ Familiar with OpenAI's ecosystem

## Common Errors

### ❌ Invalid Model Name
```
model: claude-sonnet-4-5-20250929  // WRONG - doesn't exist
```

**Fix:**
```
model: claude-sonnet-4-5-20250929  // CORRECT (Latest)
// OR
model: claude-3-5-sonnet-20241022  // CORRECT (Stable)
```

### ❌ Missing Provider Prefix
```
model: claude-sonnet-4-5-20250929  // Works - no prefix needed for new models
model: claude-3-5-sonnet-20241022  // Works for react-agent
model: anthropic/claude-3-5-sonnet-20241022  // Works for all agents
```

**Note:** Claude 4.5 Sonnet doesn't require provider prefix. Older models may need `anthropic/` prefix depending on the agent.

### ❌ Wrong API Key
```
Error: 401 Unauthorized
```

**Fix:** Ensure correct API key is set:
- Claude models → `ANTHROPIC_API_KEY`
- OpenAI models → `OPENAI_API_KEY`

## Model Pricing (as of 2024)

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Claude 3.5 Sonnet | $3.00 | $15.00 |
| Claude 3.5 Haiku | $0.25 | $1.25 |
| Claude 3 Opus | $15.00 | $75.00 |
| GPT-4o | $2.50 | $10.00 |
| GPT-4o Mini | $0.15 | $0.60 |

**Cost Optimization Tip:** Use Haiku for query routing/classification, Sonnet for final responses.

## Testing Models

```typescript
// Test in isolation
import { graph } from "./src/react-agent/graph.js";

const result = await graph.invoke(
  {
    messages: [{ role: "user", content: "Test message" }]
  },
  {
    configurable: {
      model: "openai/gpt-4o-mini" // Test different models
    }
  }
);
```

## References

- [Anthropic Model Documentation](https://docs.anthropic.com/en/docs/models-overview)
- [OpenAI Model Documentation](https://platform.openai.com/docs/models)
- [LangChain Model Providers](https://js.langchain.com/docs/integrations/chat/)
