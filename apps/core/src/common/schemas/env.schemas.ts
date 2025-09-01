import { z } from "zod";

// Base environment variable schema
export const EnvVarSchema = z.object({
  key: z.string().describe("The environment variable key"),
  value: z.string().describe("The value of the environment variable"),
});

// Search parameters schema
export const EnvSearchSchema = z.object({
  search: z
    .string()
    .optional()
    .describe("Search keyword for env variable key or value"),
});

// Set environment variable schema
export const EnvSetSchema = z.object({
  key: z.string().describe("The environment variable key"),
  value: z.string().describe("The value to set for the environment variable"),
});

// Response schemas
export const EnvGetResponseSchema = z.object({
  data: EnvVarSchema,
  success: z.boolean(),
});

export const EnvSetResponseSchema = z.object({
  success: z.boolean(),
  key: z.string(),
  value: z.string(),
});

export const EnvSearchResponseSchema = z.object({
  data: z.array(
    z.object({
      key: z.string().optional().default(""),
      value: z.string().optional().default(""),
    }),
  ),
  count: z.number().optional().default(0),
});

export const EnvListResponseSchema = z.object({
  data: z.record(z.string()),
  success: z.boolean(),
  total: z.number(),
});
