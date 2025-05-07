# Env Module

> Effortless, dynamic, and secure environment management for Vargos agents, functions, and shell commands.

---

## Why Env?

The Env module is the **central source of truth for environment variables** in Vargos. It powers both:

- 🖥️ **Shell Executions**: Every shell command gets the latest environment variables.
- ⚙️ **Function Executions**: Functions receive up-to-date secrets, API keys, and configs - automatically injected.

---

## How It Works

- **Seamless Local Provider:** Out of the box, Env uses a robust local `.env` file provider - no setup required. All changes are instantly reflected in both the file and the running process.

  > *See implementation here [EnvFilePathProvider](./providers/env-filepath.provider.ts)*
- **Extensible by Design:** The provider system is modular - future support for cloud secret managers or custom backends is just an implementation away.

---

## Features
- 🔍 **Search & List**: Instantly find any variable, with sensitive values automatically censored.
- ⚡ **Get & Set**: Read or update variables on the fly - no server restart needed.
- 🔒 **Secure by Default**: Secrets are protected and never exposed by accident.

---

## API Endpoints
- `GET /env?search=KEYWORD` - Search or list environment variables.
- `GET /env/:key` - Get a specific variable.
- `POST /env` - Set or update a variable.  
  _Body:_ `{ key, value }`

---

## Quick Usage

**In Code:**
```ts
const allVars = envService.getAll();
const value = envService.get('MY_KEY');
envService.set('MY_KEY', 'new_value');
```

**Via API:**
```bash
curl http://localhost:3000/env?search=API
curl http://localhost:3000/env/MY_VAR
curl -X POST http://localhost:3000/env -H 'Content-Type: application/json' -d '{"key":"MY_VAR","value":"my_value"}'
```

---

## Why You'll Love It
- **Unified:** One env for all agents, shells, and functions.
- **Zero config:** Works out of the box - just start Vargos.
- **Instant updates:** No more manual file edits or restarts.
- **Extensible:** Plug in new storage or secret backends as your needs grow.

---

_The Env module keeps your secrets safe and your agents running smoothly - across every execution._ 