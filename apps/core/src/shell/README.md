# Vargos Shell Module

> Persistent, programmatic shell access for the Vargos platform.

---

## 🚀 Quick Start

- The Shell module exposes a persistent shell session via API endpoints.
- Useful for running commands, scripts, and automations from Vargos or agents.

---

## 🧩 What is This?

- **Persistent Bash shell** managed by the backend.
- **API to execute commands** and retrieve output/history.
- **Interrupt support**: Cancel a long-running or stuck command.

---

## 🔌 API Endpoints

| Method | Endpoint         | Description                        |
|--------|------------------|------------------------------------|
| POST   | `/shell/execute` | Execute a shell command            |
| GET    | `/shell/history` | Get command execution history      |
| POST   | `/shell/interrupt` | Interrupt the currently running command |

**Example:**
```bash
curl -X POST http://localhost:3000/shell/execute -H 'Content-Type: application/json' -d '{"command": "ls -la"}'
curl http://localhost:3000/shell/history
curl -X POST http://localhost:3000/shell/interrupt
```

---

## 🏗️ How It Works

- A single Bash shell is spawned and kept alive.
- Commands are sent to the shell and output is captured.
- If a command is running, new commands are rejected (with details on the running command).
- You can interrupt (SIGINT) the running command via the API.

---

## 📝 Notes

- Useful for automation, scripting, and agent-driven workflows.
- Command history is available for auditing/debugging.
- Only one command can run at a time (per shell instance).

---

## 🤝 Contributing

PRs and issues welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) or open an issue. 