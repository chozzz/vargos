# CPT Versus SFT Routing

Most conversation-derived knowledge should become Markdown for CPT/RAG. SFT is only for clean behavior patterns.

## Route To CPT Markdown

Use Markdown for:

- Project facts.
- Architecture and history.
- User preferences.
- Runbooks and commands.
- Lessons learned.
- Distillation strategy.
- Model evaluation findings.
- Tool behavior notes.

Markdown can preserve nuance, citations, conflicts, and uncertainty.

## Route To SFT JSONL

Use SFT only when all are true:

- The user request is clear and self-contained.
- The assistant answer is correct or can be minimally cleaned without changing meaning.
- The exchange does not depend on hidden files or unavailable state.
- There are no secrets or sensitive details.
- The example teaches a reusable behavior, not a private fact dump.

## Never Route To SFT

- Hallucinated assistant claims.
- Failed attempts unless teaching recovery behavior explicitly.
- Tool outputs containing private data.
- Long multi-hour sessions with many topic changes.
- User preferences stated indirectly.

## SFT JSONL Shape

Emit one JSON object per line:

```json
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}],"source":"conversation-distill","confidence":"high","notes":"redacted and normalized"}
```

Prefer fewer high-quality rows over many noisy rows.
