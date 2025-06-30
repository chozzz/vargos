import { z } from "zod";

// Shell execute schema
export const ShellExecuteSchema = z.object({
  command: z
    .string()
    .default("ls -la")
    .describe("The shell command to execute in the persistent shell session"),
});

// Shell history item schema
export const ShellHistoryItemSchema = z.object({
  command: z.string().describe("The command that was executed"),
  output: z
    .string()
    .describe("The output returned by the shell for this command"),
});

// Response schemas
export const ShellExecuteResponseSchema = z.object({
  command: z.string(),
  output: z.string(),
});

export const ShellHistoryResponseSchema = z.array(ShellHistoryItemSchema);

export const ShellStatusResponseSchema = z.object({
  isActive: z.boolean(),
  sessionId: z.string().optional(),
  lastCommand: z.string().optional(),
});

export const ShellInterruptResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
