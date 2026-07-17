# Extraction Taxonomy

Route extracted knowledge into durable categories.

## Project Knowledge

Use for:

- Architecture facts.
- Codebase structure.
- Project history and decisions.
- Integration behavior.
- Training and deployment facts.
- Known bugs and fixes.
- Model/data pipeline lessons tied to the project.

Do not include generic conversation filler.

## User Preferences

Use for stable preferences about:

- Communication style.
- Coding standards.
- Tooling and automation.
- Testing and validation.
- Documentation style.
- Training-data strategy.
- Safety and privacy boundaries.

Only keep preferences that appear explicit or repeated.

## Distillation Strategy

Use for lessons about:

- What corpus types helped or failed.
- CPT versus SFT routing.
- Token expansion choices.
- Raw docs versus synthetic snippets.
- Evaluation prompts and vLLM behavior.
- Future data generation strategy.

## Workflows And Runbooks

Use for repeatable procedures:

- commands.
- notebook execution order.
- services and ports.
- validation checks.
- troubleshooting sequences.

## Issues And Lessons

Use for:

- bugs encountered.
- root causes.
- fixes applied.
- unresolved risks.
- anti-patterns.
- hallucinations or false assumptions that should not be repeated.

## SFT Candidates

Use only when a clean assistant behavior example is visible and safe. Most conversation knowledge belongs in Markdown, not SFT.
