# Chunking

Conversation logs can be large and repetitive. Chunk by session first, then by line range.

## Input Chunking

Prefer these boundaries:

1. conversation/session ID.
2. transcript file.
3. timestamp window.
4. fixed line ranges only as a fallback.

Avoid splitting a request from its answer when creating SFT candidates.

## Output Chunking

Target:

- 15-25 KB per Markdown file.
- 40 KB hard cap.
- 1 topic per section.

If an output exceeds the cap, split by topic:

- `PROJECT_KNOWLEDGE_architecture.md`
- `PROJECT_KNOWLEDGE_training.md`
- `USER_PREFERENCES_coding.md`
- `USER_PREFERENCES_workflow.md`

Update `INDEX.md` with every split file.

## Deduplication

Deduplicate after chunk extraction. Preserve:

- strongest evidence.
- most recent correction.
- conflicts that change interpretation.

Drop repeated assistant summaries unless they add new verified evidence.
