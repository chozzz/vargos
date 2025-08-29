import { Injectable, Logger } from "@nestjs/common";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";

@Injectable()
export class ShellService {
  private shell: ChildProcessWithoutNullStreams;
  private history: { command: string; output: string }[] = [];
  private logger = new Logger(ShellService.name);
  private buffer = "";
  private ready = true;
  private lastCommand: string | null = null;

  constructor() {
    const dataDir = process.env.DATA_DIR || "/tmp";
    this.shell = spawn("/bin/bash", [], {
      cwd: dataDir,
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
    // Wait for output to settle
    await new Promise((resolve) => setTimeout(resolve, 300));
    this.ready = true;
    this.history.push({ command, output: this.buffer.trim() });
    this.lastCommand = null;
    return this.buffer.trim();
  }

  getHistory() {
    return this.history;
  }

  /**
   * Interrupt the currently running shell command (SIGINT)
   */
  interrupt() {
    if (!this.ready) {
      this.logger.warn("Interrupting running shell command");
      this.shell.kill("SIGINT");
      this.ready = true;
      this.lastCommand = null;
    } else {
      this.logger.log("No running command to interrupt.");
    }
  }
}
