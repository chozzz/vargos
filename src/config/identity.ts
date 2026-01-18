/**
 * Identity setup — prompts user for name/timezone on first run
 * when USER.md still has placeholder values
 */

import readline from 'node:readline';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PLACEHOLDERS = ['[Your name]', '[Preferred name]', '[they/them, he/him, she/her, etc.]', '[e.g., UTC, EST, PST]'];

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function hasPlaceholderIdentity(workspaceDir: string): Promise<boolean> {
  try {
    const content = await fs.readFile(path.join(workspaceDir, 'USER.md'), 'utf-8');
    return PLACEHOLDERS.some((p) => content.includes(p));
  } catch {
    return false;
  }
}

/**
 * If USER.md has placeholders and stdin is a TTY, run interactive identity prompts.
 * Non-TTY (MCP stdio mode) skips silently.
 */
export async function checkIdentitySetup(workspaceDir: string): Promise<void> {
  if (!process.stdin.isTTY) return;
  if (!(await hasPlaceholderIdentity(workspaceDir))) return;

  console.error('');
  console.error('  Identity Setup');
  console.error('  ──────────────────────────');
  console.error('  USER.md has placeholder values. Let\'s fill them in.');
  console.error('');

  const name = await prompt('  Your name: ');
  const preferred = await prompt('  What should the agent call you? ');
  const pronouns = await prompt('  Pronouns (e.g. he/him): ');
  const timezone = await prompt('  Timezone (e.g. UTC, EST): ');
  const agentName = await prompt('  Agent name (default: Vargos): ');
  const agentVibe = await prompt('  Agent vibe (e.g. chill, professional): ');

  // Patch USER.md
  const userPath = path.join(workspaceDir, 'USER.md');
  let userContent = await fs.readFile(userPath, 'utf-8');

  if (name) userContent = userContent.replace('[Your name]', name);
  if (preferred) userContent = userContent.replace('[Preferred name]', preferred);
  if (pronouns) userContent = userContent.replace('[they/them, he/him, she/her, etc.]', pronouns);
  if (timezone) userContent = userContent.replace('[e.g., UTC, EST, PST]', timezone);

  await fs.writeFile(userPath, userContent, 'utf-8');
  console.error('  Updated USER.md');

  // Patch SOUL.md vibe section if agent name or vibe provided
  if (agentName || agentVibe) {
    const soulPath = path.join(workspaceDir, 'SOUL.md');
    try {
      let soulContent = await fs.readFile(soulPath, 'utf-8');
      const vibeLines: string[] = [];

      if (agentName) {
        vibeLines.push(`Your name is ${agentName}.`);
      }
      if (agentVibe) {
        vibeLines.push(`Your vibe: ${agentVibe}.`);
      }

      const vibeSection = vibeLines.join('\n');
      // Insert after ## Vibe header
      soulContent = soulContent.replace(
        /## Vibe\n\n/,
        `## Vibe\n\n${vibeSection}\n\n`,
      );
      await fs.writeFile(soulPath, soulContent, 'utf-8');
      console.error('  Updated SOUL.md');
    } catch { /* SOUL.md missing — skip */ }
  }

  console.error('');
}
