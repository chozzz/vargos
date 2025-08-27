/**
 * Vitest global setup - runs once before all test files
 * Sets NODE_ENV=test BEFORE any modules are imported
 * This causes FilepathEnvProvider to use .env.test instead of .env
 */
export function setup() {
  process.env.NODE_ENV = 'test';
}

export function teardown() {
  // Cleanup if needed
}
