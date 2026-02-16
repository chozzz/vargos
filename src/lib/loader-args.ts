/**
 * Extract --require and --import flags from process.execArgv
 * so child processes inherit TypeScript loaders (tsx, ts-node, etc.)
 */
export function extractLoaderArgs(execArgv: string[]): string[] {
  const args: string[] = [];
  for (let i = 0; i < execArgv.length; i++) {
    const flag = execArgv[i];
    if (flag === '--require' || flag === '--import') {
      args.push(flag, execArgv[++i]);
    }
  }
  return args;
}
