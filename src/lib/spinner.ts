import chalk from 'chalk';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Start a terminal spinner. Returns a stop function that clears the line. */
export function startSpinner(label: string): () => void {
  if (!process.stderr.isTTY) return () => {};
  const dim = chalk.dim;
  let i = 0;
  process.stderr.write(dim(`  ${FRAMES[0]} ${label}`));
  const timer = setInterval(() => {
    i = (i + 1) % FRAMES.length;
    process.stderr.write(`\r${dim(`  ${FRAMES[i]} ${label}`)}`);
  }, 80);
  return () => {
    clearInterval(timer);
    process.stderr.write('\r\x1b[K');
  };
}
