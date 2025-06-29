import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// Base schemas
export const FunctionInputSchema = z.object({
  name: z.string().describe("The identifier or label used to reference this input parameter in the function"),
  type: z.string().describe("The data type that this input parameter accepts (e.g. string, number, boolean, object)"),
  description: z.string().describe("A detailed explanation of what this input parameter is used for and any constraints or requirements"),
  defaultValue: z.string().describe("The fallback value that will be used if no value is provided for this input parameter"),
});

export const FunctionOutputSchema = z.object({
  name: z.string().describe("The identifier or label used to reference this output value from the function"),
  type: z.string().describe("The data type that this output value will return (e.g. string, number, boolean, object)"),
});

// Main function metadata schema
export const FunctionMetadataSchema = z.object({
  id: z.string().describe("Unique identifier for the function"),
  name: z.string().describe("Display name of the function"),
  category: z.array(z.string()).describe("Category of the function"),
  description: z.string().describe("Detailed description of what the function does"),
  tags: z.array(z.string()).describe("Array of tags for categorizing and searching functions"),
  requiredEnvVars: z.array(z.string()).describe("Required environment variables for the function to work"),
  input: z.array(FunctionInputSchema).describe("Array of input parameters"),
  output: z.array(FunctionOutputSchema).describe("Array of output values"),
});

// Function list response schema
export const FunctionListResponseSchema = z.object({
  functions: z.array(FunctionMetadataSchema).describe("Array of available functions"),
  total: z.number().describe("Total number of functions"),
});

// Create DTOs from schemas using nestjs-zod
export class FunctionMetadataDto extends createZodDto(FunctionMetadataSchema) {}
export class FunctionListResponseDto extends createZodDto(FunctionListResponseSchema) {}

// TypeScript types
export type FunctionInput = z.infer<typeof FunctionInputSchema>;
export type FunctionOutput = z.infer<typeof FunctionOutputSchema>;
export type FunctionMetadata = z.infer<typeof FunctionMetadataSchema>;
export type FunctionListResponse = z.infer<typeof FunctionListResponseSchema>;