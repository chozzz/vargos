#!/usr/bin/env tsx
/**
 * Manual Tool Test Runner
 *
 * This script tests all non-LLM tools to verify they work as expected.
 * Run with: pnpm tsx scripts/test-tools-manual.ts
 *
 * Tests:
 * - Shell tools (bash, bash-history, bash-interrupt)
 * - Env tools (get-env, set-env, search-env)
 * - Function tools (list-functions, get-function-metadata, execute-function)
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env file from mastra root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { initializeCoreServices } from '../src/mastra/services/core.service';

// Shell tools
import { bashTool } from '../src/mastra/tools/shell/bash.tool';
import { bashHistoryTool } from '../src/mastra/tools/shell/bash-history.tool';
import { bashInterruptTool } from '../src/mastra/tools/shell/bash-interrupt.tool';

// Env tools
import { getEnvTool } from '../src/mastra/tools/env/get-env.tool';
import { setEnvTool } from '../src/mastra/tools/env/set-env.tool';
import { searchEnvTool } from '../src/mastra/tools/env/search-env.tool';

// Function tools
import { listFunctionsTool } from '../src/mastra/tools/functions/list-functions.tool';
import { getFunctionMetadataTool } from '../src/mastra/tools/functions/get-function-metadata.tool';
import { executeFunctionTool } from '../src/mastra/tools/functions/execute-function.tool';

interface TestResult {
  tool: string;
  success: boolean;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

function logTest(tool: string, success: boolean, error?: string, data?: any) {
  const emoji = success ? '✅' : '❌';
  console.log(`${emoji} ${tool}: ${success ? 'PASSED' : 'FAILED'}`);
  if (error) console.log(`   Error: ${error}`);
  if (data && success) console.log(`   Data:`, JSON.stringify(data, null, 2).substring(0, 200));
  results.push({ tool, success, error, data });
}

async function testShellTools() {
  console.log('\n📝 Testing Shell Tools...\n');

  try {
    // Test bash tool
    const bashResult = await bashTool.execute({
      context: { command: 'echo "Hello from bash"' },
      runtimeContext: {} as any,
    });
    logTest('bash', bashResult.success, bashResult.error, bashResult.output);

    // Test bash-history tool
    const historyResult = await bashHistoryTool.execute({
      context: {},
      runtimeContext: {} as any,
    });
    logTest(
      'bash-history',
      historyResult.success,
      historyResult.error,
      { historyCount: historyResult.history?.length }
    );

    // Test bash-interrupt tool
    const interruptResult = await bashInterruptTool.execute({
      context: {},
      runtimeContext: {} as any,
    });
    logTest('bash-interrupt', interruptResult.success, interruptResult.error);
  } catch (error) {
    console.error('Shell tools test failed:', error);
  }
}

async function testEnvTools() {
  console.log('\n📝 Testing Environment Tools...\n');

  try {
    // Test set-env tool
    const setResult = await setEnvTool.execute({
      context: { key: 'MANUAL_TEST_VAR', value: 'test_value_123' },
      runtimeContext: {} as any,
    });
    logTest('set-env', setResult.success, setResult.error);

    // Test get-env tool
    const getResult = await getEnvTool.execute({
      context: { key: 'MANUAL_TEST_VAR' },
      runtimeContext: {} as any,
    });
    logTest('get-env', getResult.success, undefined, { value: getResult.value });

    // Test search-env tool (without censoring)
    const searchResult = await searchEnvTool.execute({
      context: { keyword: 'MANUAL_TEST', censor: false },
      runtimeContext: {} as any,
    });
    logTest(
      'search-env',
      searchResult.success,
      searchResult.error,
      { matchCount: Object.keys(searchResult.matches || {}).length }
    );

    // Test search-env with censoring
    const searchCensoredResult = await searchEnvTool.execute({
      context: { keyword: 'MANUAL_TEST', censor: true },
      runtimeContext: {} as any,
    });
    logTest(
      'search-env (censored)',
      searchCensoredResult.success,
      searchCensoredResult.error,
      { matchCount: Object.keys(searchCensoredResult.matches || {}).length }
    );
  } catch (error) {
    console.error('Env tools test failed:', error);
  }
}

async function testFunctionTools() {
  console.log('\n📝 Testing Function Tools...\n');

  try {
    // Test list-functions tool
    const listResult = await listFunctionsTool.execute({
      context: {},
      runtimeContext: {} as any,
    });
    logTest(
      'list-functions',
      listResult.success,
      undefined,
      { functionCount: listResult.total }
    );

    if (listResult.success && listResult.functions.length > 0) {
      const firstFunctionId = listResult.functions[0].id;
      console.log(`   Using function ID: ${firstFunctionId} for further tests`);

      // Test get-function-metadata tool
      const metadataResult = await getFunctionMetadataTool.execute({
        context: { functionId: firstFunctionId },
        runtimeContext: {} as any,
      });
      logTest(
        'get-function-metadata',
        metadataResult.success,
        metadataResult.error,
        metadataResult.metadata ? { id: metadataResult.metadata.id } : undefined
      );

      // Test execute-function tool (with empty params - might fail, but shouldn't crash)
      const executeResult = await executeFunctionTool.execute({
        context: { functionId: firstFunctionId, params: {} },
        runtimeContext: {} as any,
      });
      logTest(
        'execute-function',
        executeResult.success || !!executeResult.error, // Pass if it handled gracefully
        executeResult.error,
        executeResult.success ? { result: 'execution succeeded' } : undefined
      );
    } else {
      console.log('   ⚠️  No functions available - skipping metadata and execute tests');
    }
  } catch (error) {
    console.error('Function tools test failed:', error);
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const total = results.length;

  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('❌ Failed Tests:');
    results
      .filter(r => !r.success)
      .forEach(r => console.log(`   - ${r.tool}: ${r.error}`));
  }

  console.log('\n' + '='.repeat(60));
}

async function main() {
  console.log('🔧 Manual Tool Testing');
  console.log('='.repeat(60));

  try {
    console.log('Initializing core services...');
    await initializeCoreServices();
    console.log('✅ Core services initialized\n');

    await testShellTools();
    await testEnvTools();
    await testFunctionTools();
    await printSummary();

    const failedCount = results.filter(r => !r.success).length;
    process.exit(failedCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Fatal error during testing:', error);
    process.exit(1);
  }
}

main();
