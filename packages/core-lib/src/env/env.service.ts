import { EnvProvider } from "./interfaces/env.interface";

export class EnvService {
  constructor(private readonly provider: EnvProvider) {}

  getAll(): Record<string, string> {
    return this.provider.read();
  }

  search(keyword: string, censor = false): Record<string, string> {
    return this.provider.search(keyword, censor);
  }

  get(key: string): string | undefined {
    return this.provider.get(key);
  }

  set(key: string, value: string): void {
    this.provider.set(key, value);
  }
}

