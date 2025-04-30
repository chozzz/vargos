# Env Module

## Purpose

The `env` module provides a unified API and service for managing environment variables in the Vargos platform. It allows reading, searching, getting, and setting environment variables, both in the `.env` file and in the running process (`process.env`).

This is essential for Vargos because environment variables are used to configure shell and function executions, ensuring that all required secrets, API keys, and configuration values are available and up-to-date.

## Features
- **List/Search Environment Variables**: Query all environment variables or search by key/value.
- **Get Environment Variable**: Retrieve the value of a specific environment variable.
- **Set/Update Environment Variable**: Add or update a variable in the `.env` file and in the running process.

## API Endpoints
- `GET /env?search=KEYWORD` — List or search environment variables.
- `GET /env/:key` — Get a specific environment variable by key.
- `POST /env` — Set or update an environment variable. Body: `{ key, value }`

## Usage in Vargos
- **Shell Executions**: Ensures that all shell commands have access to the latest environment variables.
- **Function Executions**: Functions can require specific environment variables, which are managed and injected via this module.

## Example
```bash
# List all environment variables
curl http://localhost:3000/env

# Search for variables containing 'API'
curl http://localhost:3000/env?search=API

# Get a specific variable
curl http://localhost:3000/env/MY_VAR

# Set a variable
curl -X POST http://localhost:3000/env -H 'Content-Type: application/json' -d '{"key":"MY_VAR","value":"my_value"}'
```

## Notes
- Changes to environment variables via this module are persisted to the `.env` file and immediately available to the running process.
- This module is critical for dynamic configuration and secure secret management in Vargos. 