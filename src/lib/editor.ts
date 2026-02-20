import { spawn } from 'node:child_process';

/** Open a file in the user's preferred editor and wait for it to close */
export async function editFile(filePath: string): Promise<void> {
  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';
  const child = spawn(editor, [filePath], { stdio: 'inherit' });
  await new Promise<void>((resolve, reject) => {
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${editor} exited with ${code}`)));
    child.on('error', reject);
  });
}
