# Debugging Guide

## Debug Modes

### Agent Debug Mode

Enable detailed agent execution logging:

```bash
export AGENT_DEBUG=true
vargos start
```

This logs:
- Every turn of the agent
- Tools called and their results
- Final response before delivery
- Token counts

### Service Debug Logging

Set log level for detailed service traces:

```bash
export LOG_LEVEL=debug
vargos start
```

Levels: `trace`, `debug`, `info`, `warn`, `error`

### Channel Adapter Debugging

For channel-specific issues:

```bash
export LOG_LEVEL=debug
export CHANNEL_DEBUG=whatsapp
vargos start
```

Watch for:
- Message normalization issues
- Whitelist matching failures
- Send failures and retries

## Log Locations

| File | Content |
|------|---------|
| `~/.vargos/logs/errors.jsonl` | All errors (structured JSON) |
| `systemd` | Service output (journalctl -u vargos) |
| `/var/log/syslog` | System-wide logs |
| `.vargos/sessions/<key>/` | Session transcript and memory |

## Log Format

```
[HH:MM:SS] [service-name] [LEVEL] message | payload
```

Example:
```
[14:23:45] [agent] [DEBUG] tool.execute | {"tool":"read","args":{"path":"/tmp/test.txt"}}
[14:23:46] [agent] [DEBUG] tool.result | {"success":true,"lines":42}
[14:23:47] [agent] [INFO] execution.complete | {"sessionKey":"user:123","success":true}
```

## Common Debug Scenarios

### Agent Not Responding

1. Check agent service is running:
```bash
curl -X POST http://localhost:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"agent.execute","params":{"sessionKey":"test","task":"hello"},"id":1}'
```

2. Enable AGENT_DEBUG and check logs
3. Check if API key is valid: `export OPENAI_API_KEY=sk-...`
4. Check session file: `ls -la ~/.vargos/sessions/test/`

### Tool Failing

1. Check tool is registered:
```bash
curl -X POST http://localhost:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"config.get","params":{},"id":1}' | jq '.result.tools'
```

2. Enable AGENT_DEBUG to see tool parameters
3. Test tool directly: `vargos tool test <tool-name> '{"arg":"value"}'`

### Channel Not Receiving Messages

1. Check channel is connected:
```bash
journalctl -u vargos | grep -i whatsapp
```

2. Enable CHANNEL_DEBUG=whatsapp
3. Check whitelist: is sender in `allowFrom`?
4. Check adaptor status: restart channel service

### Session Timeout

Sessions default to 30 minutes idle. Check:
```bash
ls -la ~/.vargos/sessions/
ls -la ~/.vargos/sessions/<key>/
```

Recent files = active session. Old files = timeout candidates.

### Memory Search Not Working

1. Check workspace is indexed:
```bash
ls -la ~/.vargos/workspace/
```

2. Test search directly:
```bash
curl -X POST http://localhost:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"memory.search","params":{"query":"test"},"id":1}'
```

3. Check database: `sqlite3 ~/.vargos/vargos.db "SELECT COUNT(*) FROM documents;"`

## Structured Logging

Vargos emits structured logs. Parse with `jq`:

```bash
# All errors
tail -f ~/.vargos/logs/errors.jsonl | jq 'select(.level=="error")'

# Errors from specific service
tail -f ~/.vargos/logs/errors.jsonl | jq 'select(.service=="agent")'

# Last 10 errors
tail ~/.vargos/logs/errors.jsonl | jq -s 'reverse | .[0:10] | reverse[]'
```

## Performance Profiling

Check response times:

```bash
time curl -X POST http://localhost:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"agent.execute","params":{"sessionKey":"test","task":"hello"},"id":1}'
```

Expected: <5 seconds for simple tasks, <30 seconds for complex tasks.

If slow:
- Check database size: `du -sh ~/.vargos/vargos.db`
- Check session count: `find ~/.vargos/sessions -type d | wc -l`
- Run vacuum: `sqlite3 ~/.vargos/vargos.db "VACUUM;"`

## Inspecting Sessions

View session transcript:

```bash
cat ~/.vargos/sessions/user:123/user:123.jsonl | jq '.[] | "\(.role): \(.content)"'
```

View session metadata:

```bash
ls -la ~/.vargos/sessions/user:123/
cat ~/.vargos/sessions/user:123/.meta.json | jq
```

## Testing Components

### Test Agent Directly

```bash
node -e "
const { boot } = require('./services/agent');
const { EventEmitterBus } = require('./gateway/emitter');

const bus = new EventEmitterBus();
await boot(bus);
const result = await bus.call('agent.execute', {
  sessionKey: 'test',
  task: 'What is 2+2?'
});
console.log(result);
"
```

### Test Channel Adapter

```bash
node -e "
const { WhatsAppAdapter } = require('./services/channels/providers/whatsapp');
const adapter = new WhatsAppAdapter('test', { botToken: '...' });
await adapter.start();
const normalized = await adapter.normalizeInbound(rawMessage);
console.log(normalized);
"
```

## See Also

- [Architecture](./architecture/bus-design.md) — Understanding service communication
- [Deployment](./deployment.md) — Production setup and monitoring
