/**
 * Manual Test Script for Phase 2 Function Creation
 *
 * This script allows manual testing of the function creation pipeline.
 * Run with: pnpm tsx scripts/test-function-creation-manual.ts
 */

import { mastra } from '../src/mastra/index';

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function header(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.bright + colors.cyan);
  console.log('='.repeat(60) + '\n');
}

function success(message: string) {
  log(`✅ ${message}`, colors.green);
}

function error(message: string) {
  log(`❌ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ️  ${message}`, colors.blue);
}

function warning(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

async function testSimpleFunction() {
  header('Test 1: Simple Function Creation');

  const functionSpec = 'Create a function that adds two numbers together';
  info(`Function Spec: ${functionSpec}`);

  try {
    info('Executing function creation workflow...');
    const result = await mastra.workflows.functionCreationWorkflow.execute({
      functionSpec,
    });

    if (result.success) {
      success('Function created successfully!');
      info(`Function ID: ${result.functionId}`);
      console.log('\nResult Message:');
      console.log(result.message);
    } else {
      error('Function creation failed');
      console.log('\nError Message:');
      console.log(result.message);
    }

    return result;
  } catch (err) {
    error(`Exception during creation: ${err}`);
    throw err;
  }
}

async function testFunctionWithEnvVars() {
  header('Test 2: Function with Environment Variables');

  const functionSpec = 'Create a function to send an email via SendGrid API';
  info(`Function Spec: ${functionSpec}`);

  try {
    info('Executing function creation workflow...');
    const result = await mastra.workflows.functionCreationWorkflow.execute({
      functionSpec,
    });

    if (result.success) {
      success('Function created successfully!');
      info(`Function ID: ${result.functionId}`);
      console.log('\nResult Message:');
      console.log(result.message);

      // Check if env vars were identified
      info('Expected: Function should require SENDGRID_API_KEY environment variable');
    } else {
      error('Function creation failed');
      console.log('\nError Message:');
      console.log(result.message);
    }

    return result;
  } catch (err) {
    error(`Exception during creation: ${err}`);
    throw err;
  }
}

async function testComplexFunction() {
  header('Test 3: Complex Function Creation');

  const functionSpec = 'Create a function to fetch weather data from OpenWeatherMap API, with parameters for city, units (metric/imperial), and language';
  info(`Function Spec: ${functionSpec}`);

  try {
    info('Executing function creation workflow...');
    const result = await mastra.workflows.functionCreationWorkflow.execute({
      functionSpec,
    });

    if (result.success) {
      success('Function created successfully!');
      info(`Function ID: ${result.functionId}`);
      console.log('\nResult Message:');
      console.log(result.message);
    } else {
      error('Function creation failed');
      console.log('\nError Message:');
      console.log(result.message);
    }

    return result;
  } catch (err) {
    error(`Exception during creation: ${err}`);
    throw err;
  }
}

async function testAgentDirectly() {
  header('Test 4: Direct Agent Invocation');

  const functionSpec = 'Create a function to validate email addresses';
  info(`Function Spec: ${functionSpec}`);

  try {
    const creatorAgent = mastra.getAgent('functionCreatorAgent');

    info('Calling Function Creator Agent directly...');
    const response = await creatorAgent.generate(functionSpec, {
      structuredOutput: {
        schema: (await import('../src/mastra/agents/function-creator-agent')).FunctionGenerationSchema
      }
    });

    const functionData = response.object;

    success('Agent generated function successfully!');
    info(`Name: ${functionData.name}`);
    info(`Description: ${functionData.description}`);
    info(`Category: ${functionData.category}`);
    info(`Tags: ${functionData.tags.join(', ')}`);
    info(`Required Env Vars: ${functionData.requiredEnvVars.join(', ') || 'none'}`);
    info(`Inputs: ${functionData.input.length}`);
    info(`Outputs: ${functionData.output.length}`);

    console.log('\n--- Generated Code Preview ---');
    console.log(functionData.code.substring(0, 500) + '...\n');

    console.log('--- Generated Tests Preview ---');
    console.log(functionData.tests.substring(0, 500) + '...\n');

    return functionData;
  } catch (err) {
    error(`Exception during agent call: ${err}`);
    throw err;
  }
}

async function runAllTests() {
  header('Phase 2 Manual Testing Suite');

  const results = {
    simple: null as any,
    envVars: null as any,
    complex: null as any,
    direct: null as any,
  };

  // Test 1: Simple function
  try {
    results.simple = await testSimpleFunction();
  } catch (err) {
    error('Test 1 failed with exception');
  }

  // Test 2: Function with env vars
  try {
    results.envVars = await testFunctionWithEnvVars();
  } catch (err) {
    error('Test 2 failed with exception');
  }

  // Test 3: Complex function
  try {
    results.complex = await testComplexFunction();
  } catch (err) {
    error('Test 3 failed with exception');
  }

  // Test 4: Direct agent
  try {
    results.direct = await testAgentDirectly();
  } catch (err) {
    error('Test 4 failed with exception');
  }

  // Summary
  header('Test Summary');

  const successCount = Object.values(results).filter(r => r?.success || r?.name).length;
  const totalTests = Object.keys(results).length;

  if (successCount === totalTests) {
    success(`All ${totalTests} tests completed successfully! 🎉`);
  } else if (successCount > 0) {
    warning(`${successCount}/${totalTests} tests completed successfully`);
  } else {
    error('All tests failed');
  }

  info('\nDetailed Results:');
  console.log(`  Test 1 (Simple):    ${results.simple?.success ? '✅' : '❌'}`);
  console.log(`  Test 2 (Env Vars):  ${results.envVars?.success ? '✅' : '❌'}`);
  console.log(`  Test 3 (Complex):   ${results.complex?.success ? '✅' : '❌'}`);
  console.log(`  Test 4 (Direct):    ${results.direct?.name ? '✅' : '❌'}`);

  header('Testing Complete');
}

// Run tests
runAllTests().catch(err => {
  error(`Fatal error: ${err}`);
  process.exit(1);
});
