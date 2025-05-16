import { Injectable } from "@nestjs/common";
import { EnvFilepathProvider } from "./providers/env-filepath.provider";

@Injectable()
export class EnvService {
  constructor(private readonly envFilepathProvider: EnvFilepathProvider) {}

  getAll(): Record<string, string> {
    return this.envFilepathProvider.read();
  }

  search(keyword: string, censor = false): Record<string, string> {
    return this.envFilepathProvider.search(keyword, censor);
  }

  get(key: string): string | undefined {
    return this.envFilepathProvider.get(key);
  }

  set(key: string, value: string): void {
    this.envFilepathProvider.set(key, value);
  }
}
