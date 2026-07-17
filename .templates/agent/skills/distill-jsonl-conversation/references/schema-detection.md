# Schema Detection

JSONL conversation logs vary. Detect structure from records instead of assuming one provider.

## Common Fields

Look for content in:

- `message.content`
- `content`
- `text`
- `body`
- `turn.text`
- `messages[].content`
- `request.messages[]`
- `response.choices[].message.content`

Look for role/speaker in:

- `role`
- `message.role`
- `speaker`
- `author`
- `type`
- `from`

Look for tools in:

- `tool_calls`
- `message.tool_calls`
- `function_call`
- `tool_results`
- `observations`
- `turns[].tool`

Look for time/session in:

- `timestamp`
- `created_at`
- `time`
- `session_id`
- `conversation_id`
- `thread_id`
- `chat_id`

## Classification

Classify each file as one of:

- `single-record-per-turn`
- `single-record-per-session`
- `openai-chat-record`
- `copilot-transcript`
- `claude-transcript`
- `vargos-session`
- `unknown-jsonl`

## Confidence

Use:

- `high`: role, content, and session boundaries are clear.
- `medium`: content is clear but roles or sessions need inference.
- `low`: records parse but meaning is ambiguous.

Low-confidence records can contribute to schema notes, but should not create durable facts without corroboration.
