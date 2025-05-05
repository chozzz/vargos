import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EnvService {
  private readonly logger = new Logger(EnvService.name);
  private readonly envPath: string;

  constructor() {
    this.envPath = path.resolve(process.cwd(), '.env');
    this.logger.log(`Env path: ${this.envPath}`);
  }

  private parseEnv(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match) {
        let [, key, value] = match;
        if (typeof key !== 'string' || typeof value !== 'string') return;
        value = value.replace(/^['"]|['"]$/g, '');
        env[key] = value;
      }
    });
    return env;
  }

  private serializeEnv(env: Record<string, string>): string {
    return Object.entries(env)
      .map(([key, value]) => `${key}="${value.replace(/"/g, '\"')}"`)
      .join('\n');
  }

  getAll(): Record<string, string> {
    if (!fs.existsSync(this.envPath)) return {};
    const content = fs.readFileSync(this.envPath, 'utf-8');
    return this.parseEnv(content);
  }

  search(keyword: string): Record<string, string> {
    const env = this.getAll();
    if (!keyword) return env;
    const lower = keyword.toLowerCase();
    return Object.fromEntries(
      Object.entries(env).filter(
        ([k, v]) => k.toLowerCase().includes(lower) || v.toLowerCase().includes(lower)
      )
    );
  }

  get(key: string): string | undefined {
    const env = this.getAll();
    return env[key];
  }

  set(key: string, value: string): void {
    const env = this.getAll();
    env[key] = value;
    fs.writeFileSync(this.envPath, this.serializeEnv(env), 'utf-8');
    process.env[key] = value;
    this.logger.log(`Set env ${key}=${value}`);
  }
} 