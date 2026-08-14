/** MCP servers shipped as Python packages launch via `uvx` (Astral's uv), which npm never installs. */

import { onPath, type Doctor } from './index.js';

const doctor: Doctor = {
  id: '010-uv',
  title: 'uv / uvx',

  async detect({ mcpServers }) {
    const dependents = mcpServers.filter(s => s.command === 'uvx' || s.command === 'uv');
    if (dependents.length === 0) return { state: 'skip', why: 'no MCP server uses uvx' };
    if (onPath('uvx')) return { state: 'ok' };

    return {
      state: 'missing',
      detail: `uvx is not on PATH — ${dependents.map(s => s.name).join(', ')} cannot start`,
    };
  },

  fix: {
    why: 'Installs uv and uvx into ~/.local/bin.',
    command: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
  },
};

export default doctor;
