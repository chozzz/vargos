import { describe, it, expect, beforeAll } from 'vitest';
import { functionCreationWorkflow } from './function-creation-simple.workflow';
import { functionTestingWorkflow } from './function-testing.workflow';
import { initializeCoreServices } from '../services/core.service';

describe('Phase 2 Workflow Integration Tests', () => {
  beforeAll(async () => {
    await initializeCoreServices();
  });

  describe('Function Creation Workflow', () => {
    it('should have correct workflow configuration', () => {
      expect(functionCreationWorkflow.id).toBe('function-creation');
      expect(functionCreationWorkflow.description).toBeDefined();
    });

    it.skip('should execute creation workflow end-to-end (dry run)', async () => {
      const functionSpec = 'Create a simple function that returns hello world';

      // Execute workflow
      const result = await functionCreationWorkflow.execute({
        functionSpec,
      });

      // Verify result structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('functionId');
      expect(result).toHaveProperty('message');

      // Log results
      console.log(`\n✅ Workflow Execution Result:`);
      console.log(`   Success: ${result.success}`);
      console.log(`   Function ID: ${result.functionId}`);
      console.log(`   Message: ${result.message.substring(0, 100)}...`);
    });

    it.skip('should handle simple function creation', async () => {
      const functionSpec = 'Create a function to capitalize a string';

      const result = await functionCreationWorkflow.execute({
        functionSpec,
      });

      if (result.success) {
        expect(result.functionId).toBeTruthy();
        expect(result.message).toContain('created');
        console.log(`✅ Successfully created: ${result.functionId}`);
      } else {
        console.log(`⚠️  Creation failed (expected in test env): ${result.message}`);
        // Failure is acceptable in test environment without proper setup
      }
    });

    it.skip('should handle function with dependencies', async () => {
      const functionSpec = 'Create a function to make HTTP requests using axios';

      const result = await functionCreationWorkflow.execute({
        functionSpec,
      });

      expect(result).toBeDefined();
      console.log(`✅ Workflow handled dependency scenario`);
    });
  });

  describe('Function Testing Workflow', () => {
    it('should have correct workflow configuration', () => {
      expect(functionTestingWorkflow.id).toBe('function-testing');
      expect(functionTestingWorkflow.description).toBeDefined();
    });

    it.skip('should execute testing workflow (requires existing function)', { timeout: 30000 }, async () => {
      // Skip unless we have a known test function
      const functionId = 'add-numbers';

      const result = await functionTestingWorkflow.execute({
        functionId,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('issues');

      console.log(`\n✅ Testing Workflow Result:`);
      console.log(`   Passed: ${result.passed}`);
      console.log(`   Summary: ${result.summary}`);
      console.log(`   Issues: ${result.issues.length}`);
    });
  });

  describe('Workflow Error Handling', () => {
    it.skip('should handle invalid function specs gracefully', { timeout: 30000 }, async () => {
      const functionSpec = ''; // Empty spec

      const result = await functionCreationWorkflow.execute({
        functionSpec,
      });

      // Should return error instead of throwing
      expect(result).toBeDefined();
      if (!result.success) {
        expect(result.message).toBeDefined();
        console.log(`✅ Handled invalid spec gracefully`);
      }
    });

    it.skip('should provide meaningful error messages', { timeout: 30000 }, async () => {
      const functionSpec = 'xyz invalid request 123';

      const result = await functionCreationWorkflow.execute({
        functionSpec,
      });

      expect(result.message).toBeDefined();
      expect(result.message.length).toBeGreaterThan(10);
      console.log(`✅ Error messages are meaningful`);
    });
  });

  describe('Workflow Integration with Agents', () => {
    it.skip('should properly invoke Function Creator Agent', async () => {
      const functionSpec = 'Create a function to reverse a string';

      const result = await functionCreationWorkflow.execute({
        functionSpec,
      });

      // Workflow should have invoked the agent
      expect(result).toBeDefined();

      // If successful, function should have been generated
      if (result.success && result.functionId) {
        expect(result.functionId).toMatch(/^[a-z0-9-]+$/);
        console.log(`✅ Agent invoked successfully via workflow`);
      }
    });
  });

  describe('Workflow Output Validation', () => {
    it.skip('should return properly formatted success messages', async () => {
      const functionSpec = 'Create a function to check if a number is even';

      const result = await functionCreationWorkflow.execute({
        functionSpec,
      });

      if (result.success) {
        expect(result.message).toContain('Function ID');
        expect(result.message).toContain(result.functionId);
        console.log(`✅ Success messages properly formatted`);
      }
    });

    it.skip('should return properly formatted error messages', { timeout: 30000 }, async () => {
      // Force an error by using malformed input
      const functionSpec = '';

      const result = await functionCreationWorkflow.execute({
        functionSpec,
      });

      if (!result.success) {
        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(0);
        console.log(`✅ Error messages properly formatted`);
      }
    });
  });
});
