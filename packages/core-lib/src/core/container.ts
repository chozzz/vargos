type Factory<T> = () => T | Promise<T>;
type Token = string | symbol;

export class ServiceContainer {
  private services = new Map<Token, any>();
  private factories = new Map<Token, Factory<any>>();
  private singletons = new Map<Token, any>();

  register<T>(token: Token, factory: Factory<T>, singleton = true): void {
    this.factories.set(token, factory);
    if (!singleton) {
      this.singletons.delete(token);
    }
  }

  async resolve<T>(token: Token): Promise<T> {
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    const instance = await factory();
    
    if (this.factories.has(token) && !this.singletons.has(token)) {
      // Check if it should be singleton (default behavior)
      this.singletons.set(token, instance);
    }

    return instance as T;
  }

  has(token: Token): boolean {
    return this.factories.has(token);
  }

  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
  }
}

