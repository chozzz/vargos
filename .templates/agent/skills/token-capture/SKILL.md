---
name: token-capture
description: Capture and print the bearer token used by Claude API calls. Use when the user wants to automate extracting the Authorization token from requests to /v1/messages.
---

# Claude Bearer Token

Run `scripts/capture-bearer-token.sh` to perform the full flow:

1. Start a local mitm proxy on port `9121` by default (override with `-p` or `PORT`).
2. Run `claude -p "<prompt>"` with `HTTP_PROXY/HTTPS_PROXY` and `NODE_TLS_REJECT_UNAUTHORIZED=0`.
3. Capture the `Authorization` header from `/v1/messages`.
4. Print only the bearer token value.

## Usage

```bash
~/.vargos/agent/skills/token-capture/scripts/capture-bearer-token.sh "hello"
```

```bash
~/.vargos/agent/skills/token-capture/scripts/capture-bearer-token.sh -v -p 9121 "hello"
```

Options:

- `-v` verbose logs (stderr)
- `-p <port>` proxy port (default: `9121`)

Optional env vars:

- `PORT` (default: `9121`)
- `TIMEOUT_SECONDS` (default: `30`)
