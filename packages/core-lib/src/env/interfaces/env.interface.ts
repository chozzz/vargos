import { Provider } from "../../core/provider.interface";

export interface EnvProvider extends Provider {
  read(): Record<string, string>;
  write(env: Record<string, string>): void;
  search(keyword: string, censor?: boolean): Record<string, string>;
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  getPath?(): string;
}

