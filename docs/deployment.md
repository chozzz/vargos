# Deployment Guide

## Docker Compose

Deploy Vargos as a container for production use:

```yaml
version: '3.9'
services:
  vargos:
    image: chozzz/vargos:latest
    restart: unless-stopped
    ports:
      - "9000:9000"      # JSON-RPC gateway
      - "9001:9001"      # MCP server
    volumes:
      - ./config.json:/home/vargos/.vargos/config.json:ro
      - vargos-data:/home/vargos/.vargos
      - vargos-workspace:/home/vargos/.vargos/workspace
    environment:
      VARGOS_DATA_DIR: /home/vargos/.vargos
      LOG_LEVEL: info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  vargos-data:
  vargos-workspace:
```

## Systemd Service

Run Vargos as a system service on Linux:

```ini
# /etc/systemd/system/vargos.service
[Unit]
Description=Vargos Agent OS
After=network.target
StartLimitInterval=600
StartLimitBurst=3

[Service]
Type=simple
User=vargos
WorkingDirectory=/opt/vargos
ExecStart=/usr/local/bin/vargos start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable vargos
sudo systemctl start vargos
sudo systemctl status vargos
journalctl -u vargos -f  # Follow logs
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VARGOS_DATA_DIR` | `~/.vargos` | Data directory location |
| `LOG_LEVEL` | `info` | Logging level (trace, debug, info, warn, error) |
| `AGENT_DEBUG` | `false` | Enable agent-level debugging |
| `NODE_ENV` | `production` | Node.js environment |

## Configuration

1. Create `~/.vargos/config.json`:

```json
{
  "providers": {
    "openai": {
      "baseUrl": "https://api.openai.com",
      "apiKey": "$OPENAI_API_KEY",
      "models": [
        { "id": "gpt-4", "name": "GPT-4" }
      ]
    }
  },
  "agent": {
    "model": "openai:gpt-4"
  },
  "channels": [
    {
      "type": "whatsapp",
      "id": "whatsapp-main",
      "enabled": true,
      "allowFrom": ["+1234567890"]
    }
  ],
  "storage": {
    "type": "sqlite"
  },
  "paths": {
    "dataDir": "$VARGOS_DATA_DIR"
  }
}
```

2. Set file permissions:

```bash
chmod 600 ~/.vargos/config.json  # Only owner can read
```

3. Create workspace directory:

```bash
mkdir -p ~/.vargos/workspace
cp -r .templates/vargos/workspace/* ~/.vargos/workspace/
```

## Production Checklist

- [ ] Config file permissions set to 0o600
- [ ] API keys in environment variables, not config
- [ ] Log rotation configured (journalctl handles auto-rotation)
- [ ] Backups of `~/.vargos/` scheduled (contains sessions, memory, config)
- [ ] Monitoring alerts for service restarts
- [ ] Network access restricted (9000/9001 behind firewall)
- [ ] Database backups for PostgreSQL (if using)

## Monitoring

### Check Service Status

```bash
curl -X POST http://localhost:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"config.get","params":{},"id":1}'
```

### View Logs

```bash
# systemd
journalctl -u vargos -n 100

# Docker
docker logs vargos -f

# File (if configured)
tail -f ~/.vargos/logs/errors.jsonl
```

### Health Checks

Add monitoring for:
- Service restart rate (should be 0)
- API response time (should be <5s)
- Session error rate (should be <1%)

## Scaling

Vargos is single-process. For multiple instances:

1. **Load balance** using reverse proxy (nginx, HAProxy)
2. **Share storage** using PostgreSQL instead of SQLite
3. **Shared workspace** on network filesystem (NFS, S3)

Example nginx config:

```nginx
upstream vargos {
  server localhost:9000;
  server localhost:9001;
}

server {
  listen 80;
  location / {
    proxy_pass http://vargos;
    proxy_http_version 1.1;
  }
}
```

## Troubleshooting

**Service won't start:**
```bash
vargos start --verbose
# Check for config errors, permission issues
```

**Out of memory:**
- Check session count: `du -sh ~/.vargos/sessions/`
- Delete old sessions: `rm -rf ~/.vargos/sessions/old_*`

**Slow API responses:**
- Check database size: `sqlite3 ~/.vargos/vargos.db ".tables"`
- Run maintenance: `vargos db vacuum`

## See Also

- [Configuration Guide](./configuration.md) — Full config reference
- [Debugging Guide](./debugging.md) — Debug modes and logging
