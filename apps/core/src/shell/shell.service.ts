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
        "Shell is busy. Please wait for the previous command to finish.",
      );
    }
    this.ready = false;
    this.buffer = "";
    this.shell.stdin.write(command + "\n");
    // Wait for output to settle
    await new Promise((resolve) => setTimeout(resolve, 300));
    this.ready = true;
    this.history.push({ command, output: this.buffer.trim() });
    return this.buffer.trim();
  }

  getHistory() {
    return this.history;
  }
}
