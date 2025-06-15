import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// Environment variable schema
export const EnvVarSchema = z.object({
  key: z.string().describe("The environment variable key"),
  value: z.string().describe("The value of the environment variable"),
});

// Environment set request schema
export const EnvSetSchema = z.object({
  key: z.string().describe("The environment variable key"),
  value: z.string().describe("The value to set for the environment variable"),
});

// Environment search query schema
export const EnvSearchSchema = z.object({
  search: z.string().optional().describe("Search keyword for env variable key or value"),
});

// Environment set response schema
export const EnvSetResponseSchema = z.object({
  success: z.boolean().describe("Whether the operation was successful"),
  key: z.string().describe("The environment variable key that was set"),
  value: z.string().describe("The value that was set"),
});

// Create DTOs from schemas using nestjs-zod
export class EnvVarDto extends createZodDto(EnvVarSchema) {}
export class EnvSetDto extends createZodDto(EnvSetSchema) {}
export class EnvSearchDto extends createZodDto(EnvSearchSchema) {}
export class EnvSetResponseDto extends createZodDto(EnvSetResponseSchema) {}

// TypeScript types
export type EnvVar = z.infer<typeof EnvVarSchema>;
export type EnvSet = z.infer<typeof EnvSetSchema>;
export type EnvSearch = z.infer<typeof EnvSearchSchema>;
export type EnvSetResponse = z.infer<typeof EnvSetResponseSchema>; 