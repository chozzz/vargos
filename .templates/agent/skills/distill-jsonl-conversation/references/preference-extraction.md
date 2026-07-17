# Preference Extraction

User preferences are valuable, but false positives are costly. Extract only durable preferences.

## Strong Signals

Treat these as high-confidence when sourced:

- The user says they prefer, want, dislike, always, never, or explicitly corrects behavior.
- The user repeats the same instruction across sessions.
- The user rejects an approach and explains why.
- The user names a default path, tool, workflow, style, or training strategy.

## Weak Signals

Treat as medium or low confidence:

- A one-off choice made under time pressure.
- A preference inferred from the assistant's behavior.
- A correction that applies only to one file/project.
- A statement contradicted later.

## Preference Output Format

For each preference, write:

```markdown
- Preference: <short statement>
  Scope: <global|project|workflow|training-data|communication|coding>
  Confidence: <high|medium|low>
  Evidence: <file/session/line/timestamp pointer>
  Notes: <constraints, exceptions, conflicts>
```

## What To Avoid

- Do not convert every request into a preference.
- Do not preserve secrets, personal details, or private identifiers as preferences.
- Do not keep stale preferences when a newer correction supersedes them; keep the conflict note instead.
