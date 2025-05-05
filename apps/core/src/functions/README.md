# Vargos Functions

> **Dynamic, AI-managed function execution for the Vargos platform.**

---

## 🚀 Quick Start

```bash
# Install dependencies & setup functions repo
pnpm install
pnpm run prebuild
```

- Functions are auto-cloned from [vargos-functions-template](https://github.com/chozzz/vargos-functions-template) if not present.

---

## 🧩 What is This?

- **API for listing, searching, curating and executing functions** (TypeScript/Node.js & Python).
- **Functions are loaded from a local directory** (auto-managed, see below).
- **Metadata-driven**: Each function has a `.meta.json` for discoverability.

---

## 🏗️ How It Works

- On startup, the local functions directory is created (if missing) and populated from the official repo.
- The `LocalDirectoryProvider` loads and manages all available functions.
- Functions are indexed for fast search and can be executed with dynamic parameters.

---

## 🔌 API Endpoints

| Method | Endpoint                                 | Description                        |
|--------|------------------------------------------|------------------------------------|
| GET    | `/functions/reindex`                     | Reindex all functions              |
| GET    | `/functions/search?query=KEYWORD&limit=` | Search for functions               |
| POST   | `/functions/:functionId/execute`         | Execute a function with parameters |

**Example:**
```bash
curl http://localhost:3000/functions/search?query=weather
curl -X POST http://localhost:3000/functions/FUNCTION_ID/execute -H 'Content-Type: application/json' -d '{"params": {"location": "New York"}}'
```

---

## 🛠️ Adding/Updating Functions

- Functions live in the [external repo](https://github.com/chozzz/vargos-functions-template).
- Each function:
  - Has its own folder in `src/`
  - Must include a `.meta.json` file
  - Can be TypeScript (`.ts`) or Python (`.py`)
- To add or update, edit the external repo and re-pull or restart Vargos.

---

## 📚 Learn More

- [Vargos Functions Template README](https://github.com/chozzz/vargos-functions-template#readme)
- [LocalDirectoryProvider](./providers/local-directory.provider.ts)
- [Prebuild Script](../scripts/prebuild.ts)

---

## 📝 Notes

- Functions are indexed for fast search and discovery.
- Required environment variables are managed via the [`env` module](../env/README.md).
- The local functions directory is auto-managed at startup.

---

## 🤝 Contributing

PRs and issues welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) or open an issue. 