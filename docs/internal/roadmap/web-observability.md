# Planned: Web Observability Dashboard

## Summary

A browser-based operator dashboard exposing all Vargos state in real time: sessions, agent runs, tool results, cron tasks, channel status, errors, and config.

## Views

| View | Data |
|------|------|
| Sessions | List, message history, tool results per call |
| Agent | Current run status, streaming deltas, tool phases |
| Cron | Schedule, last run, next run, notify targets |
| Channels | Connected adapters, last activity |
| Errors | `errors.jsonl` grouped by pattern |
| Config | Read and patch `config.json` |
| Workspace | File tree browser |

## Architecture

New `WebService` (`services/web/`) — same `ServiceClient` pattern as other services.

- HTTP + SSE on port 9003
- Bearer token auth (`config.web.bearerToken`)
- React + Vite SPA served as static files
- SSE subscribes to gateway events, fans out to browser clients
- Connection handling behind a `ConnectionTransport` interface — designed to swap to WebRTC DataChannel without touching application logic

Most endpoints map to existing gateway RPC methods — no new methods needed except `config.get`, `config.update`, and direct filesystem reads for tool results and workspace tree.

## Requirements

- Phase 2 (Web Service)
- Operator-only vs. end-user chat scope decision

## Notes

- LAN-only deployment assumed; add CSP headers before internet exposure
- Bearer token in localStorage — document hardening steps if exposed publicly
