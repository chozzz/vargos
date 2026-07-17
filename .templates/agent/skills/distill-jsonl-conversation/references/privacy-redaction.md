# Privacy And Redaction

Conversation logs often contain sensitive material. Redact before producing reusable corpora.

## Always Redact

- API keys, tokens, passwords, cookies, private keys, passphrases.
- Authorization headers and session IDs.
- Personal phone numbers, personal emails, addresses, and government identifiers.
- Raw customer records or production data samples.
- Secrets embedded in terminal output, config files, URLs, or stack traces.

## Configurable Redaction

The config controls whether to redact:

- internal URLs.
- individual names.
- organization names.
- short quotes.

If unsure, redact and summarize.

## Redaction Style

Use stable placeholders:

- `[REDACTED_SECRET]`
- `[REDACTED_PERSON]`
- `[REDACTED_EMAIL]`
- `[REDACTED_URL]`
- `[REDACTED_CUSTOMER_DATA]`

Do not store the original value in any output file.

## Redaction Report

Write `redaction-report.md` with counts and categories:

- number of files scanned.
- number of records with redactions.
- categories redacted.
- paths skipped due to sensitivity.
- uncertainty notes.

Never include raw sensitive values in the report.
