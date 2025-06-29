import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// Shell execute request schema
export const ShellExecuteSchema = z.object({
  command: z.string().describe("The shell command to execute in the persistent shell session"),
});

// Shell history item schema
export const ShellHistoryItemSchema = z.object({
  command: z.string().describe("The command that was executed"),
  output: z.string().describe("The output returned by the shell for this command"),
});

// Shell execute response schema
export const ShellExecuteResponseSchema = z.object({
  command: z.string().describe("The command that was executed"),
  output: z.string().describe("The output returned by the shell"),
});

// Shell interrupt response schema
export const ShellInterruptResponseSchema = z.object({
  success: z.boolean().describe("Whether the interrupt signal was sent successfully"),
  message: z.string().describe("Status message about the interrupt operation"),
});

// Create DTOs from schemas using nestjs-zod
export class ShellExecuteDto extends createZodDto(ShellExecuteSchema) {}
export class ShellHistoryItemDto extends createZodDto(ShellHistoryItemSchema) {}
export class ShellExecuteResponseDto extends createZodDto(ShellExecuteResponseSchema) {}
export class ShellInterruptResponseDto extends createZodDto(ShellInterruptResponseSchema) {}

// TypeScript types
export type ShellExecute = z.infer<typeof ShellExecuteSchema>;
export type ShellHistoryItem = z.infer<typeof ShellHistoryItemSchema>;
export type ShellExecuteResponse = z.infer<typeof ShellExecuteResponseSchema>;
export type ShellInterruptResponse = z.infer<typeof ShellInterruptResponseSchema>; 