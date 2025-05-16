import { Provider } from "./provider.interface";

export interface EnvProvider extends Provider {
  getPath(): string;
  read(): Record<string, string>;
  write(env: Record<string, string>): void;
  search(keyword: string, censor?: boolean): Record<string, string>;
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}
