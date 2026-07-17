# MCP Fallbacks — What To Do When a Tool Is Missing

**All MCPs are optional.** Every pass has fs + git as its always-available floor. When an MCP is enabled and reachable, the pass uses it to enrich its output. When it isn't, the pass proceeds with what remains.

## Which MCPs each pass *can* use

| Pass          | github | jira | confluence | sonar | fs (always) | git (always) |
|---------------|:------:|:----:|:----------:|:-----:|:-----------:|:------------:|
| codebase-map  |   ·    |  ·   |     ·      |   ·   |      ✓      |      ·       |
| architecture  |   +    |  ·   |     +      |   ·   |      ✓      |      ✓       |
| history       |   +    |  +   |     ·      |   ·   |      ✓      |      ✓       |
| conventions   |   +    |  ·   |     +      |   +   |      ✓      |      ·       |
| context       |   +    |  +   |     +      |   ·   |      ✓      |      ·       |
| integrations  |   ·    |  ·   |     +      |   ·   |      ✓      |      ·       |
| operations    |   ·    |  ·   |     +      |   ·   |      ✓      |      ✓       |
| known-issues  |   +    |  +   |     ·      |   +   |      ✓      |      ✓       |
| glossary      |   ·    |  +   |     +      |   ·   |      ✓      |      ·       |
| runbooks      |   ·    |  ·   |     +      |   ·   |      ✓      |      ·       |

`✓` = always used. `+` = used when available, safely skipped otherwise. `·` = not used.

## Rules

1. **A pass never blocks on an MCP.** If preferred sources are unavailable, it uses fs + git and emits what it can.
2. **Note the gap in the output.** In the MD top matter, record which MCPs were unavailable:
   ```markdown
   > Sources: 23 code refs, 14 PRs, N/A (confluence disabled), 3 sonar findings
   ```
   Use `N/A (disabled)` when the config had `enabled: false`, and `N/A (unavailable)` when a health check failed. Distinguishing helps future runs.
3. **Do not fabricate to fill gaps.** `_(none found)_` is honest. Guessing poisons CPT.
4. **Widen fs mining when MCPs are missing.** If confluence is disabled, look harder in `docs/`, `README.md`, `ADR/`, `.claude/`, `.vargos/`, `.notes/` for the same information. If github is disabled, mine git commit messages, `CHANGELOG.md`, and `RELEASES.md`. If jira is disabled, look for `TODO`, `FIXME`, and issue templates in the repo.
5. **Git is a partial substitute for github/jira** on history and known-issues:
   - `git log --grep=fix` for bug patterns
   - `git log --grep='(feat|feature)'` for feature history
   - `git log --stat -20 <hot-file>` for churn
   - `git blame` for "who owned this" (if repo has multiple contributors)
6. **If a pass has NO usable sources** (rare — every pass has at least fs), emit a stub MD noting this and mark the pass as `failed: no-sources-available` in the run journal.

## Config-declared MCP identifiers

The subagent MUST NOT guess MCP config. It reads them from `config.mcps.<name>` in the resolved `distill-config.json`:

- `github.repo` (or `github.repos` for multi-repo projects)
- `jira.project_key` (or `jira.project_keys`)
- `confluence.space_key`, `confluence.search_root`
- `sonarqube.project_key`

If the MCP is enabled but its identifier is missing, ask the user before proceeding — never guess a project id.

## Multi-repo / multi-project variants

Some projects span multiple repos or jira projects. Config may declare lists:

```json
"github": {
  "enabled": true,
  "repos": ["org/repo-a", "org/repo-b", "org/repo-c"]
},
"jira": {
  "enabled": true,
  "project_keys": ["KEYA", "KEYB"]
}
```

Passes iterate the list when mining. The Sources footer should cite each repo/project explicitly so it's clear which repo a PR/ticket belongs to.
