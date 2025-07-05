import { z } from "zod";

// Function input schema
export const FunctionInputSchema = z.object({
  name: z
    .string()
    .describe(
      "The identifier or label used to reference this input parameter in the function",
    ),
  type: z
    .string()
    .describe(
      "The data type that this input parameter accepts (e.g. string, number, boolean, object)",
    ),
  description: z
    .string()
    .describe(
      "A detailed explanation of what this input parameter is used for and any constraints or requirements",
    ),
  defaultValue: z
    .union([z.string(), z.number()])
    .describe(
      "The fallback value that will be used if no value is provided for this input parameter (string or number)",
    )
    .optional(),
});

// Function output schema
export const FunctionOutputSchema = z.object({
  name: z
    .string()
    .describe(
      "The identifier or label used to reference this output value from the function",
    ),
  type: z
    .string()
    .describe(
      "The data type that this output value will return (e.g. string, number, boolean, object)",
    ),
  description: z.string().optional(),
});

// Function metadata schema
export const FunctionMetadataSchema = z.object({
  id: z.string().describe("Unique identifier for the function"),
  name: z.string().describe("Display name of the function"),
  category: z
    .union([z.string(), z.array(z.string())])
    .describe("Category of the function"),
  description: z
    .string()
    .describe("Detailed description of what the function does"),
  tags: z
    .array(z.string())
    .describe("Array of tags for categorizing and searching functions"),
  requiredEnvVars: z
    .array(z.string())
    .describe("Required environment variables for the function to work"),
  input: z.array(FunctionInputSchema),
  output: z.array(FunctionOutputSchema),
});

// Response schemas
export const FunctionListResponseSchema = z.object({
  functions: z.array(FunctionMetadataSchema),
  total: z.number(),
});

// Controller now returns wrapped function execution result
export const FunctionExecuteResponseSchema = z.object({
  result: z.any(),
  success: z.boolean(),
});

// Controller now returns transformed search result
export const FunctionSearchResponseSchema = z.object({
  functions: z.array(FunctionMetadataSchema),
  total: z.number(),
});

export const FunctionReindexResponseSchema = z.object({
  success: z.boolean(),
  totalFunctions: z.number(),
});
