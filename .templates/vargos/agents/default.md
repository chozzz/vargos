---
# Whitelist of bus tools the channel agent can call. Globs supported (e.g. "memory.*").
# Empty/missing = all bus tools allowed.
allowedTools: []
# Built-in Pi tools active at session start (e.g. ["read", "bash", "edit", "write"]).
# Empty/missing = Pi SDK default.
initialActiveTools: []
---

<!-- Channel-specific instructions appended to the merged bootstrap (AGENTS.md/SOUL.md/TOOLS.md). Leave empty to inherit defaults only. -->
