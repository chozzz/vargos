import * as fs from "fs";
import * as path from "path";
import { EnvProvider } from "../interfaces/env.interface";

export interface FilepathEnvProviderConfig {
  /** Path to the .env file. Defaults to `.env` in the current working directory. */
  envFilePath?: string;
  /**
   * Additional key patterns to censor when displaying environment variables.
   * These patterns are appended to the default list of sensitive key patterns.
   * 
   * Keys ending with these patterns will have their values partially masked
   * (showing only the first 5% of characters) when using `search()` with `censor=true`.
   * 
   * **Default patterns** (always included):
   * - `_KEY`
   * - `_SECRET`
   * - `_PASSWORD`
   * - `_TOKEN`
   * - `_CREDENTIALS`
   * 
   * **Example:**
   * ```typescript
   * // Add custom patterns - defaults are still included
   * const provider = new FilepathEnvProvider({
   *   censoredKeys: ["_PRIVATE", "_SENSITIVE"]
   * });
   * // Now censors: _KEY, _SECRET, _PASSWORD, _TOKEN, _CREDENTIALS, _PRIVATE, _SENSITIVE
   * 
   * // Search with censoring enabled
   * const env = provider.search("api", true);
   * // API_KEY="abc****************" (only first 5% visible)
   * ```
   */
  censoredKeys?: string[];
}

/**
 * Environment variable provider that reads/writes from a `.env` file.
 * 
 * Supports automatic censoring of sensitive values when displaying environment variables.
 * Keys ending with sensitive patterns (like `_KEY`, `_SECRET`, `_PASSWORD`, etc.) will
 * have their values partially masked to prevent accidental exposure.
 * 
 * @example
 * ```typescript
 * // Basic usage with default censoring
 * const provider = new FilepathEnvProvider();
 * provider.set("API_KEY", "secret123");
 * 
 * // Search without censoring
 * const all = provider.search("api", false);
 * // Returns: { API_KEY: "secret123" }
 * 
 * // Search with censoring enabled
 * const censored = provider.search("api", true);
 * // Returns: { API_KEY: "s*******" } (only first 5% visible)
 * 
 * // Add custom censored patterns
 * const customProvider = new FilepathEnvProvider({
 *   censoredKeys: ["_PRIVATE", "_SENSITIVE"]
 * });
 * // Default patterns + custom patterns are all censored
 * ```
 */
export class FilepathEnvProvider implements EnvProvider {
  private readonly envFilePath: string;
  private readonly censoredKeys: string[];

  /**
   * Default sensitive key patterns that are always censored.
   * These patterns are automatically included and cannot be disabled.
   * User-provided patterns via `censoredKeys` config are appended to this list.
   */
  private static readonly DEFAULT_CENSORED_KEYS = [
    "_KEY",
    "_SECRET",
    "_PASSWORD",
    "_TOKEN",
    "_CREDENTIALS",
  ];

  /**
   * Creates a new FilepathEnvProvider instance.
   * 
   * @param config - Configuration options
   * @param config.envFilePath - Path to the .env file (defaults to `.env` in cwd)
   * @param config.censoredKeys - Additional key patterns to censor (appended to defaults)
   * 
   * @example
   * ```typescript
   * // Use default .env file with default censoring
   * const provider1 = new FilepathEnvProvider();
   * 
   * // Custom .env file location
   * const provider2 = new FilepathEnvProvider({
   *   envFilePath: "/path/to/custom/.env"
   * });
   * 
   * // Add custom censored patterns
   * const provider3 = new FilepathEnvProvider({
   *   censoredKeys: ["_PRIVATE", "_SENSITIVE"]
   * });
   * ```
   */
  constructor(config: FilepathEnvProviderConfig = {}) {
    this.envFilePath = config.envFilePath || path.resolve(process.cwd(), ".env");
    
    // Merge default censored keys with user-provided ones, avoiding duplicates
    const defaultKeys = FilepathEnvProvider.DEFAULT_CENSORED_KEYS;
    const userKeys = config.censoredKeys || [];
    this.censoredKeys = [
      ...defaultKeys,
      ...userKeys.filter((key) => !defaultKeys.includes(key)),
    ];
  }

  initialize(): Promise<void> {
    if (!fs.existsSync(this.envFilePath)) {
      fs.writeFileSync(this.envFilePath, "");
    }
    return Promise.resolve();
  }

  getPath(): string {
    return this.envFilePath;
  }

  private parseEnv(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    content.split("\n").forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match) {
        const [, key, value] = match;
        if (typeof key !== "string" || typeof value !== "string") return;
        const cleanValue = value.replace(/^['"]|['"]$/g, "");
        env[key] = cleanValue;
      }
    });
    return env;
  }

  private serializeEnv(env: Record<string, string>): string {
    return Object.entries(env)
      .map(([key, value]) => `${key}="${value.replace(/"/g, '\\"')}"`)
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

  /**
   * Search for environment variables by keyword and optionally censor sensitive values.
   * 
   * When `censor=true`, values for keys ending with sensitive patterns (defined in `censoredKeys`)
   * will be partially masked, showing only the first 5% of characters followed by asterisks.
   * This helps prevent accidental exposure of secrets in logs or UI displays.
   * 
   * @param keyword - Search term to filter by (searches both key names and values). Empty string returns all.
   * @param censor - Whether to censor sensitive values (default: false)
   * @returns Filtered environment variables, with sensitive values censored if `censor=true`
   * 
   * @example
   * ```typescript
   * provider.set("API_KEY", "sk_live_1234567890abcdef");
   * provider.set("DATABASE_URL", "postgres://user:pass@host/db");
   * 
   * // Search without censoring
   * const all = provider.search("api", false);
   * // Returns: { API_KEY: "sk_live_1234567890abcdef" }
   * 
   * // Search with censoring - sensitive values are masked
   * const censored = provider.search("api", true);
   * // Returns: { API_KEY: "s**********************" }
   * 
   * // Search all with censoring
   * const allCensored = provider.search("", true);
   * // Returns: { API_KEY: "s*******", DATABASE_URL: "postgres://user:pass@host/db" }
   * // (DATABASE_URL is not censored as it doesn't match any censored pattern)
   * ```
   */
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
  }
}

