import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { EnvProvider } from "../../common/interfaces/env.interface";

@Injectable()
export class EnvFilepathProvider implements EnvProvider, OnModuleInit {
  private readonly logger = new Logger(EnvFilepathProvider.name);
  private readonly envFilePath: string;
  private readonly censoredKeys = ["_KEY", "_SECRET", "_PASSWORD", "_TOKEN"];

  constructor() {
    this.envFilePath = path.resolve(process.cwd(), ".env");
    this.logger.log(`Env path: ${this.envFilePath}`);
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.envFilePath)) {
      this.logger.warn(
        `.env file not found at ${this.envFilePath}, creating an empty one.`,
      );
      fs.writeFileSync(this.envFilePath, "");
    }
  }

  getPath(): string {
    return this.envFilePath;
  }

  private parseEnv(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    content.split("\n").forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match) {
        let [, key, value] = match;
        if (typeof key !== "string" || typeof value !== "string") return;
        value = value.replace(/^['"]|['"]$/g, "");
        env[key] = value;
      }
    });
    return env;
  }

  private serializeEnv(env: Record<string, string>): string {
    return Object.entries(env)
      .map(([key, value]) => `${key}="${value.replace(/"/g, '\"')}"`)
      .join("\n");
  }

  read(): Record<string, string> {
    if (!fs.existsSync(this.envFilePath)) return {};
    const content = fs.readFileSync(this.envFilePath, "utf-8");
    return this.parseEnv(content);
  }

  write(env: Record<string, string>): void {
    fs.writeFileSync(this.envFilePath, this.serializeEnv(env), "utf-8");
  }

  search(keyword: string, censor = false): Record<string, string> {
    const env = this.read();
    const filtered = !keyword
      ? env
      : Object.fromEntries(
          Object.entries(env).filter(([k, v]) => {
            const lower = keyword.toLowerCase();
            return (
              k.toLowerCase().includes(lower) || v.toLowerCase().includes(lower)
            );
          }),
        );
    if (!censor) return filtered;
    return Object.fromEntries(
      Object.entries(filtered).map(([key, value]) => {
        if (this.censoredKeys.some((k) => key.endsWith(k))) {
          this.logger.debug(`[Search] Censoring key: ${key}`);
          const keepChars = Math.max(1, Math.floor(value.length * 0.05));
          const censored =
            value.substring(0, keepChars) +
            "*".repeat(value.length - keepChars);
          return [key, censored];
        }
        return [key, value];
      }),
    );
  }

  get(key: string): string | undefined {
    const env = this.read();
    return env[key];
  }

  set(key: string, value: string): void {
    const env = this.read();
    env[key] = value;
    this.write(env);
    process.env[key] = value;
    this.logger.log(`Set env ${key}=${value}`);
  }
}
