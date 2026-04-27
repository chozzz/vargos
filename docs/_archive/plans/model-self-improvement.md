# Plan: Model Self-Improvement (Finetuning + Swapping)

> ⚠️ **ARCHIVED** — This plan references source files that do not exist in the current codebase (`src/training/`, `src/tools/agent/model-*.ts`, `src/lib/model-registry.ts`). The concepts here remain valuable but should be re-evaluated against the current architecture before implementation. See [ROADMAP.md](../ROADMAP.md) for current status.

## Vision

Vargos observes its own performance, curates training data from conversation history, finetunes local models (via Ollama/LocalAI), evaluates results, and swaps to better models automatically — closing a self-improvement loop without operator intervention.

---

## Two Distinct Capabilities

### 1. Model Swapping

Dynamically select the best available model for a task — based on task type, latency budget, quality signals, and cost.

**Examples:**
- Cron/background tasks → fast cheap model (Qwen 7B)
- Voice real-time loop → fastest local model (<400ms budget)
- Deep research/reasoning → best available (Claude or large local)
- Code tasks → code-specialized model

**How:** A `ModelRegistry` in config lists available models with capability tags. Agent uses `model_swap` tool to change its own model mid-session for the next LLM call. Cron tasks declare a `preferredModel` in their config.

### 2. Self-Finetuning

Extract conversation history as training data, run a finetuning job on a local model, register the result in Ollama, evaluate against baseline, swap if improved.

**Finetuning loop:**
```
session history → curate samples → format (JSONL/alpaca) → ollama create → evaluate → swap if better
```

---

## Model Registry

```json
{
  "models": {
    "default": "claude-sonnet-4-6",
    "registry": [
      {
        "id": "qwen2.5-7b",
        "provider": "ollama",
        "tags": ["fast", "cheap", "cron"],
        "contextWindow": 32768,
        "latencyMs": 150
      },
      {
        "id": "qwen2.5-72b",
        "provider": "ollama",
        "tags": ["reasoning", "research"],
        "contextWindow": 131072,
        "latencyMs": 800
      },
      {
        "id": "claude-sonnet-4-6",
        "provider": "anthropic",
        "tags": ["best", "code", "reasoning"],
        "contextWindow": 200000,
        "latencyMs": 2000
      }
    ]
  }
}
```

---

## Tools

### `model_swap`

Changes the model for the current session or a named session.

```typescript
model_swap({ model: "qwen2.5-7b", scope: "session" | "run" })
```

### `model_list`

Lists registered models with tags, latency, and current selection.

### `model_finetune`

Orchestrates a finetuning run:

```typescript
model_finetune({
  baseModel: "qwen2.5-7b",
  outputName: "vargos-qwen-v1",
  sessionFilter: { since: "7d", minQuality: "good" },
  epochs: 3,
})
```

1. Queries session history for high-quality exchanges (user confirmed, no errors, no retries)
2. Formats as Alpaca/JSONL training data
3. Writes a `Modelfile` and runs `ollama create`
4. Registers new model in registry
5. Runs eval suite (configurable prompts with expected outputs)
6. If eval passes threshold, swaps default model for the task tag

### `model_eval`

Runs a named eval suite against a model and returns pass/fail scores.

---

## Training Data Curation

Not all conversation history is good training data. Curation rules:

- **Include:** user messages + assistant responses with no retry, no error, no correction follow-up
- **Exclude:** messages with `run.error`, sessions with > 2 retries, cron sessions (no user signal)
- **Quality signal:** user continued the conversation (implicit positive) vs. user corrected ("no, not that")
- **Format:** system prompt + user message + assistant response (Alpaca instruction-following format)

Data pipeline: `src/training/curator.ts` — reads from session JSONL files, applies rules, outputs training JSONL.

---

## Evaluation Suite

A set of prompt → expected output pairs stored in `~/.vargos/workspace/evals/`. The agent can author new evals the same way it authors skills.

```yaml
# ~/.vargos/workspace/evals/basic-tools.yaml
- prompt: "What files are in the current directory?"
  expects_tool: fs_list
  expects_response_contains: ["file", "directory"]
```

`model_eval` runs each eval, scores pass/fail, returns aggregate.

---

## Finetuning Cron

A weekly cron that runs the full loop autonomously:

```json
{
  "id": "model-finetune-weekly",
  "name": "Weekly Model Finetuning",
  "schedule": "0 2 * * 0",
  "task": "Curate training data from the past 7 days of conversations. Finetune qwen2.5-7b as vargos-qwen-weekly. Run eval suite. If eval score > 0.85, register as default for cron tasks. Report results.",
  "notify": ["whatsapp:61423222658"]
}
```

---

## New Files

```
src/training/curator.ts        Session history → training JSONL
src/training/eval.ts           Eval runner
src/tools/agent/model-swap.ts  model_swap tool
src/tools/agent/model-list.ts  model_list tool
src/tools/agent/model-finetune.ts  model_finetune tool (orchestrates curator + ollama + eval)
src/tools/agent/model-eval.ts  model_eval tool
src/lib/model-registry.ts      ModelRegistry: load from config, resolve by tag
```

---

## Phases

### Phase A — Model Swapping (no finetuning yet)

- [ ] `ModelRegistry` from config
- [ ] `model_list` + `model_swap` tools
- [ ] `preferredModel` field on cron tasks
- [ ] Cron tasks auto-select fast model if no preference set

### Phase B — Evaluation

- [ ] `~/.vargos/workspace/evals/` scanner
- [ ] `model_eval` tool
- [ ] Baseline evals authored in workspace

### Phase C — Finetuning Pipeline

- [ ] `src/training/curator.ts`
- [ ] `model_finetune` tool (Ollama Modelfile + `ollama create`)
- [ ] Weekly finetuning cron task
- [ ] Auto-swap if eval passes threshold

---

## Open Decisions

| # | Question | Stakes |
|---|----------|--------|
| F1 | Training data format — Alpaca vs. ChatML vs. ShareGPT | Depends on target model's expected format |
| F2 | Quality signal for curation — implicit (continuation) vs. explicit (thumbs up tool) | Explicit is more reliable but requires user action |
| F3 | Finetuning via Ollama Modelfile (`FROM` + `ADAPTER`) vs. direct LocalAI training API | Ollama is simpler; LocalAI supports more training options |
| F4 | Eval suite ownership — agent-authored vs. operator-curated | Agent can bootstrap evals from existing conversations |
| F5 | Model rollback — keep previous version if new model regresses | Need versioned model names in Ollama registry |
