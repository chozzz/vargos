# Output Format

Use stable Markdown so the output can feed CPT, RAG, or human review.

## Top Matter

```markdown
# <Document Title>

> Distilled <YYYY-MM-DD> via `distill-jsonl-conversation`.
> Inputs: <file count>, <record count estimate>, <date range or unknown>
> Schema confidence: <high|medium|low>
> Redaction: <none|some|heavy>
```

## Item Format

Use this for extracted facts, preferences, lessons, and workflows:

```markdown
## <Category>

### <Short Title>

Confidence: <high|medium|low>
Evidence: <input path, session id, timestamp, or line range>

<Grounded summary. Keep it dense and reusable.>

Conflicts:
- _(none found)_
```

## Sources

End every MD with:

```markdown
## Sources

- `path/to/file.jsonl` — records <range or count>, schema <family>, confidence <level>
```

Do not include raw secrets or long transcript excerpts in sources.
