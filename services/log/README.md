# Log Service — Disabled

`index.ts` has been renamed to `index.disabled.ts` because the log service
intercepts all `log.info()` / `log.warn()` / etc. calls and routes them through
the bus (`log.onLog` events → `console.info`), which introduces an
indirection that breaks with systemd stdout capture:

- **stdout is block-buffered** by Node.js when not a TTY (systemd `StandardOutput=append:`).
- The buffer flushes only when full (~4–8 KB), so the final boot summary and
  edge service startup lines may never appear in `/tmp/vargos-out.log`.

Without the log service, `_bus` stays null and `createLogger()` falls through to
its direct `console.log`/`console.error` path, which matches how the earliest
boot lines (config, log service itself) already work.

To re-enable, rename back to `index.ts` and restart.
