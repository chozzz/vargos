import { describe, it, expect, beforeAll } from 'vitest';
import { routerAgent, RouterOutput } from './router-agent';
import { plannerAgent, PlannerOutput } from './planner-agent';
import { curatorAgent, CuratorOutput } from './curator-agent';
import { permissionAgent, PermissionRequest } from './permission-agent';
import { initializeCoreServices } from '../services/core.service';

describe('Phase 1 Agent Integration Tests', () => {
  beforeAll(async () => {
    // Ensure core services are initialized before tests
    await initializeCoreServices();
  });

  describe('Router Agent', () => {
    it('should route function search requests to curator', async () => {
      const userMessage = 'Find functions related to weather';

      const response = await routerAgent.generate(userMessage, {
        structuredOutput: {
          schema: (await import('./router-agent')).RouterOutputSchema
        }
      });

      const routerOutput = response.object as RouterOutput;

      expect(routerOutput.intent).toBe('search_function');
      expect(routerOutput.needsCurator).toBe(true);
      expect(routerOutput.nextAgent).toBe('curator');
      expect(routerOutput.extractedEntities.functionQuery).not.toBe('');
      expect(routerOutput.confidence).toBeGreaterThan(0.7);
    });

    it('should route complex tasks to planner', async () => {
      const userMessage = 'Create a function to send emails via SendGrid';

      const response = await routerAgent.generate(userMessage, {
        structuredOutput: {
          schema: (await import('./router-agent')).RouterOutputSchema
        }
      });

      const routerOutput = response.object as RouterOutput;

      expect(routerOutput.intent).toBe('create_function');
      expect(routerOutput.needsPlanning).toBe(true);
      expect(routerOutput.needsPermission).toBe(true);
      expect(routerOutput.extractedEntities.taskDescription).not.toBe('');
    });

    it('should handle direct answers without agent routing', async () => {
      const userMessage = 'What can Vargos do?';

      const response = await routerAgent.generate(userMessage, {
        structuredOutput: {
          schema: (await import('./router-agent')).RouterOutputSchema
        }
      });

      const routerOutput = response.object as RouterOutput;

      expect(routerOutput.intent).toBe('direct_answer');
      expect(routerOutput.nextAgent).toBe('none');
      expect(routerOutput.needsPlanning).toBe(false);
      expect(routerOutput.needsPermission).toBe(false);
      expect(routerOutput.needsCurator).toBe(false);
    });
  });

  describe('Planner Agent', () => {
    it('should create execution plan for function creation', async () => {
      const taskDescription = 'Create a function to fetch weather data from OpenWeatherMap API';

      const response = await plannerAgent.generate(taskDescription, {
        structuredOutput: {
          schema: (await import('./planner-agent')).PlannerOutputSchema
        }
      });

      const plannerOutput = response.object as PlannerOutput;

      expect(plannerOutput.taskSummary).toBeDefined();
      expect(plannerOutput.complexity).toMatch(/^(low|medium|high)$/);
      expect(plannerOutput.steps.length).toBeGreaterThan(0);
      expect(plannerOutput.totalSteps).toBe(plannerOutput.steps.length);

      // Verify first step is typically curator search
      const firstStep = plannerOutput.steps[0];
      expect(firstStep.stepNumber).toBe(1);
      expect(firstStep.dependencies).toEqual([]);

      // Should have permission step for function creation
      const hasPermissionStep = plannerOutput.steps.some(step => step.agent === 'permission');
      expect(hasPermissionStep).toBe(true);
    });

    it('should create simple plan for function execution', async () => {
      const taskDescription = 'Find and run the user-lookup function with id=123';

      const response = await plannerAgent.generate(taskDescription, {
        structuredOutput: {
          schema: (await import('./planner-agent')).PlannerOutputSchema
        }
      });

      const plannerOutput = response.object as PlannerOutput;

      expect(plannerOutput.complexity).toBe('low');
      expect(plannerOutput.steps.length).toBeLessThanOrEqual(3);
      expect(plannerOutput.estimatedCompletion).toBe('seconds');
    });
  });

  describe('Curator Agent', () => {
    // Note: Curator tests require Core MCP endpoint to be running
    // Skip this test unless Core is running
    it.skip('should search for functions and make recommendations', async () => {
      const searchQuery = 'weather forecast';

      // Curator uses tools, so we test it can be called
      // Actual search results depend on function repository state
      const response = await curatorAgent.generate(
        `Search for functions matching: ${searchQuery}`,
        {
          structuredOutput: {
            schema: (await import('./curator-agent')).CuratorOutputSchema
          }
        }
      );

      const curatorOutput = response.object as CuratorOutput;

      expect(curatorOutput.query).toBeDefined();
      expect(curatorOutput.foundFunctions).toBeDefined();
      expect(curatorOutput.decision).toMatch(/^(use_existing|extend_existing|create_new|needs_clarification)$/);
      expect(curatorOutput.reasoning).toBeDefined();
      expect(curatorOutput.suggestedAction).toBeDefined();

      // topMatch is always present, check if it has a real match
      expect(curatorOutput.topMatch).toBeDefined();
      expect(curatorOutput.topMatch.confidence).toBeGreaterThanOrEqual(0);
      expect(curatorOutput.topMatch.confidence).toBeLessThanOrEqual(1);

      if (curatorOutput.foundFunctions) {
        expect(curatorOutput.recommendations.length).toBeGreaterThan(0);
        curatorOutput.recommendations.forEach(rec => {
          expect(rec.functionId).toBeDefined();
          expect(rec.name).toBeDefined();
          expect(rec.matchScore).toBeGreaterThanOrEqual(0);
          expect(rec.matchScore).toBeLessThanOrEqual(1);
        });
      }
    });
  });

  describe('Permission Agent', () => {
    it('should create permission request for function creation', async () => {
      const actionDescription = 'Create a new function called send-email that uses SendGrid API';

      const response = await permissionAgent.generate(
        `User wants to: ${actionDescription}. Create a permission request.`,
        {
          structuredOutput: {
            schema: (await import('./permission-agent')).PermissionRequestSchema
          }
        }
      );

      const permissionRequest = response.object as PermissionRequest;

      expect(permissionRequest.action).toBeDefined();
      expect(permissionRequest.actionType).toBe('create_function');
      expect(permissionRequest.impact).toMatch(/^(low|medium|high)$/);
      expect(permissionRequest.details).toBeDefined();
      expect(permissionRequest.reasoning).toBeDefined();
      expect(permissionRequest.risks.length).toBeGreaterThan(0);
      expect(permissionRequest.recommendedScope).toMatch(/^(allow_once|allow_session|deny|ask_more_info)$/);
      expect(permissionRequest.userFriendlyPrompt).toBeDefined();
    });

    it('should assess impact correctly for shell commands', async () => {
      const actionDescription = 'Execute shell command: rm -rf /tmp/test';

      const response = await permissionAgent.generate(
        `User wants to: ${actionDescription}. Create a permission request.`,
        {
          structuredOutput: {
            schema: (await import('./permission-agent')).PermissionRequestSchema
          }
        }
      );

      const permissionRequest = response.object as PermissionRequest;

      expect(permissionRequest.actionType).toBe('execute_shell');
      // Shell commands should typically be medium or high impact
      expect(['medium', 'high']).toContain(permissionRequest.impact);
      expect(permissionRequest.details.commandsToRun).toBeDefined();
    });
  });

  describe('Agent Flow Integration', () => {
    // Note: Curator flow requires Core MCP endpoint to be running
    it.skip('should demonstrate Router → Curator flow', async () => {
      // Step 1: Router decides to use curator
      const routerResponse = await routerAgent.generate('Find weather functions', {
        structuredOutput: {
          schema: (await import('./router-agent')).RouterOutputSchema
        }
      });
      const routerOutput = routerResponse.object as RouterOutput;

      expect(routerOutput.nextAgent).toBe('curator');
      expect(routerOutput.extractedEntities.functionQuery).toBeDefined();

      // Step 2: Use router's output to call curator
      const curatorResponse = await curatorAgent.generate(
        `Search for functions matching: ${routerOutput.extractedEntities.functionQuery}`,
        {
          structuredOutput: {
            schema: (await import('./curator-agent')).CuratorOutputSchema
          }
        }
      );
      const curatorOutput = curatorResponse.object as CuratorOutput;

      expect(curatorOutput.decision).toBeDefined();
      expect(curatorOutput.suggestedAction).toBeDefined();
    });

    it('should demonstrate Router → Permission → Planner flow', { timeout: 15000 }, async () => {
      // Step 1: Router identifies need for permission and planning
      const routerResponse = await routerAgent.generate(
        'Create a new function that sends email notifications',
        {
          structuredOutput: {
            schema: (await import('./router-agent')).RouterOutputSchema
          }
        }
      );
      const routerOutput = routerResponse.object as RouterOutput;

      expect(routerOutput.needsPermission).toBe(true);
      expect(routerOutput.needsPlanning).toBe(true);

      // Step 2: Get permission first
      const permissionResponse = await permissionAgent.generate(
        `User wants to create a new function called 'send-email-notification'. Create a permission request.`,
        {
          structuredOutput: {
            schema: (await import('./permission-agent')).PermissionRequestSchema
          }
        }
      );
      const permissionRequest = permissionResponse.object as PermissionRequest;

      expect(permissionRequest.actionType).toBe('create_function');
      expect(permissionRequest.userFriendlyPrompt).toBeDefined();

      // Step 3: If permission granted, create plan
      const plannerResponse = await plannerAgent.generate(
        routerOutput.extractedEntities.taskDescription || 'Create sentiment analysis function',
        {
          structuredOutput: {
            schema: (await import('./planner-agent')).PlannerOutputSchema
          }
        }
      );
      const plannerOutput = plannerResponse.object as PlannerOutput;

      expect(plannerOutput.steps.length).toBeGreaterThan(0);
      expect(plannerOutput.requiredCapabilities).toBeDefined();
    });
  });
});
