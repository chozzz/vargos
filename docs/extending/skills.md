# Creating Agent Skills

Skills are reusable sets of instructions that guide the agent's behavior. They live in your workspace as markdown files with YAML frontmatter.

## Skill Structure

```yaml
---
name: code-review
description: Review code for quality, security, and best practices
tags: [development, review]
priority: high
---

# Your Instructions

When asked to review code:
1. Check for security vulnerabilities (SQL injection, XSS, etc.)
2. Verify error handling is present
3. Look for performance issues
4. Suggest improvements
5. Keep reviews constructive

Never approve code without thorough review. Ask clarifying questions about intent before critiquing.
```

## Skill File Locations

Vargos discovers skills from:
- `~/.vargos/workspace/skills/` — user skills
- `~/.vargos/workspace/` — files like AGENTS.md, SOUL.md
- Project `.skill/` directories (if specified in config)

## Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier (used in file name: `{name}.md`) |
| `description` | string | One-line summary shown in manifest |
| `tags` | array | Categories for organization (development, analysis, writing, etc.) |
| `priority` | string | optional — high, medium, low (default: medium) |
| `enabled` | boolean | optional — whether skill is active (default: true) |

## How Agents Use Skills

When the agent starts a session, it:
1. Discovers all available skills from the workspace
2. Loads their descriptions and tags
3. Reads relevant skill files based on task context
4. Injects skill instructions into the system prompt

The agent decides which skills are relevant for the current task.

## Example Skills

### Code Review Skill

Create `~/.vargos/workspace/skills/code-review.md`:

```yaml
---
name: code-review
description: Provide thorough code review feedback
tags: [development, review]
---

When reviewing code:
- Check for security vulnerabilities
- Verify error handling
- Look for performance issues
- Suggest improvements
- Reference best practices

Format feedback as:
1. Summary of findings
2. Issues (if any)
3. Suggestions
4. Approved/Request Changes
```

### Writing Style Skill

Create `~/.vargos/workspace/skills/writing.md`:

```yaml
---
name: writing
description: Maintain consistent writing style and tone
tags: [writing, communication]
---

Write in an approachable, friendly tone:
- Use active voice
- Keep sentences short
- Avoid jargon when possible
- Provide examples
- Anticipate reader questions
```

### Research Skill

Create `~/.vargos/workspace/skills/research.md`:

```yaml
---
name: research
description: Conduct thorough research and synthesize findings
tags: [research, analysis]
---

When researching a topic:
1. Check multiple sources
2. Verify information is recent
3. Note source credibility
4. Identify gaps or conflicting views
5. Synthesize into clear summary

Cite sources. Distinguish facts from opinions.
```

## Best Practices

1. **Keep skills focused** — one skill, one clear purpose
2. **Write for clarity** — agents read and follow these literally
3. **Be specific** — "check for SQL injection" not "check for bugs"
4. **Organize with tags** — tags help agents find relevant skills
5. **Version your skills** — add date if you significantly revise
6. **Test with agent** — ask agent to use skill and refine based on results
7. **Document assumptions** — what environment, tools, or context does this expect?

## Skill Discovery

Check what skills the agent found:

```bash
# Via config command
vargos config skills

# Or ask the agent
"What skills do you have available?"
```

The agent will list loaded skills and their descriptions.

## See Also

- [Workspace Files](../usage/workspace-files.md) — Full workspace structure
- [System Prompts](../usage/runtime.md) — How skills are injected into prompts
