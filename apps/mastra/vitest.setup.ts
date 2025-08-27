import { beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { config as dotenvConfig } from 'dotenv';

/**
 * Vitest setup file
 * Sets up required environment variables for tool tests with proper isolation
 */

beforeAll(() => {
  // Load .env.test file for test configuration
  // NODE_ENV is already set to 'test' in vitest.globalSetup.ts
  dotenvConfig({ path: path.resolve(process.cwd(), '.env.test') });

  // Set up required environment variables if not already set
  const testDataDir = path.join(os.tmpdir(), 'vargos-test-data');
  const testFunctionsDir = path.join(os.tmpdir(), 'vargos-test-functions');

  // Create test directories if they don't exist
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  if (!fs.existsSync(testFunctionsDir)) {
    fs.mkdirSync(testFunctionsDir, { recursive: true });
  }

  // Create the src subdirectory required by LocalDirectoryProvider
  const testFunctionsSrcDir = path.join(testFunctionsDir, 'src');
  if (!fs.existsSync(testFunctionsSrcDir)) {
    fs.mkdirSync(testFunctionsSrcDir, { recursive: true });
  }

  // Set environment variables for testing
  if (!process.env.FUNCTIONS_DIR) {
    process.env.FUNCTIONS_DIR = testFunctionsDir;
  }

  if (!process.env.DATA_DIR) {
    process.env.DATA_DIR = testDataDir;
  }

  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = 'test-api-key';
  }

  if (!process.env.QDRANT_URL) {
    process.env.QDRANT_URL = 'http://localhost:6333';
  }

  if (!process.env.QDRANT_API_KEY) {
    process.env.QDRANT_API_KEY = 'test-qdrant-key';
  }

  if (!process.env.DATABASE_URL) {
    // Provide a mock DATABASE_URL for tests (won't actually connect)
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  }

  console.log('✅ Test environment initialized');
  console.log(`   FUNCTIONS_DIR: ${process.env.FUNCTIONS_DIR}`);
  console.log(`   DATA_DIR: ${process.env.DATA_DIR}`);
});
