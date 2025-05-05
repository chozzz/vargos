import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class EnvService {
  private readonly logger = new Logger(EnvService.name);
  private readonly envPath: string;
  private readonly censoredKeys = ["_KEY", "_SECRET", "_PASSWORD", "_TOKEN"];

  constructor() {
    this.envPath = path.resolve(process.cwd(), ".env");
    this.logger.log(`Env path: ${this.envPath}`);
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

  getAll(): Record<string, string> {
    if (!fs.existsSync(this.envPath)) return {};
    const content = fs.readFileSync(this.envPath, "utf-8");
    return this.parseEnv(content);
  }

  /**
   * Search environment variables by keyword and optionally censor sensitive values
   * @param keyword - Search term to filter env vars by key or value
   * @param censor - Whether to censor sensitive values (defaults to false)
   * @returns Record of matching environment variables
   */
  search(keyword: string, censor = false): Record<string, string> {
    // Get all env vars and filter if keyword provided
    const env = this.getAll();
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

    // Return as-is if no censoring needed
    if (!censor) return filtered;

    // Censor sensitive values
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
    const env = this.getAll();
    return env[key];
  }

  set(key: string, value: string): void {
    const env = this.getAll();
    env[key] = value;
    fs.writeFileSync(this.envPath, this.serializeEnv(env), "utf-8");
    process.env[key] = value;
    this.logger.log(`Set env ${key}=${value}`);
  }
}
