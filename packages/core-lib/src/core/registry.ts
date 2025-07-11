export class ProviderRegistry {
  private providers = new Map<string, Map<string, any>>();

  register<T>(type: string, name: string, provider: T): void {
    if (!this.providers.has(type)) {
      this.providers.set(type, new Map());
    }
    this.providers.get(type)!.set(name, provider);
  }

  get<T>(type: string, name: string): T | undefined {
    return this.providers.get(type)?.get(name) as T | undefined;
  }

  list(type: string): string[] {
    return Array.from(this.providers.get(type)?.keys() || []);
  }

  has(type: string, name: string): boolean {
    return this.providers.get(type)?.has(name) || false;
  }
}

