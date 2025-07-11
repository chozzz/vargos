import { spawn, ChildProcessWithoutNullStreams } from "child_process";

export interface ShellServiceConfig {
  dataDir?: string;
  shellPath?: string;
}

export class ShellService {
  private shell: ChildProcessWithoutNullStreams;
  private history: { command: string; output: string }[] = [];
  private buffer = "";
  private ready = true;
  private lastCommand: string | null = null;
  private config: Required<ShellServiceConfig>;

  constructor(config: ShellServiceConfig = {}) {
    this.config = {
      dataDir: config.dataDir || process.env.DATA_DIR || "/tmp",
      shellPath: config.shellPath || "/bin/bash",
    };

    this.shell = spawn(this.config.shellPath, [], {
      cwd: this.config.dataDir,
      env: process.env,
      stdio: "pipe",
    });

    this.shell.stdout.on("data", (data) => {
      this.buffer += data.toString();
    });

    this.shell.stderr.on("data", (data) => {
      this.buffer += data.toString();
    });
  }

  async execute(command: string): Promise<string> {
    if (!this.ready) {
      throw new Error(
        `Shell is busy. Last running command: '${this.lastCommand ?? "unknown"}'. Please wait for it to finish or interrupt.`,
      );
    }
    this.ready = false;
    this.buffer = "";
    this.lastCommand = command;
    this.shell.stdin.write(command + "\n");
    await new Promise((resolve) => setTimeout(resolve, 300));
    this.ready = true;
    this.history.push({ command, output: this.buffer.trim() });
    this.lastCommand = null;
    return this.buffer.trim();
  }

  getHistory(): { command: string; output: string }[] {
    return [...this.history];
  }

  interrupt(): void {
    if (!this.ready) {
      this.shell.kill("SIGINT");
      this.ready = true;
      this.lastCommand = null;
    }
  }

  async initialize(): Promise<void> {
    // Shell is ready after construction
  }
}

