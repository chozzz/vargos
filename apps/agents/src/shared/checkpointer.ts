/**
 * Shared PostgreSQL Checkpointer Configuration
 *
 * This module provides a singleton PostgreSQL checkpointer instance
 * for persisting conversation history across all LangGraph agents.
 *
 * Best Practices (from LangGraph docs):
 * 1. Use connection pooling for production
 * 2. Call .setup() on first use to create tables
 * 3. Use single checkpointer instance across all graphs
 * 4. Thread IDs managed by LangGraph SDK/frontend
 *
 * Storage: Uses LANGCHAIN_DATABASE_URL from .env (separate from Mastra)
 * Tables: checkpoints, writes (auto-created)
 */

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";

let checkpointerInstance: PostgresSaver | null = null;
let connectionPool: pg.Pool | null = null;

/**
 * Get or create PostgreSQL checkpointer instance with connection pooling
 *
 * Uses connection pooling as recommended for production deployments.
 * The pool is shared across all agents for efficiency.
 *
 * @returns PostgresSaver instance
 * @throws Error if LANGCHAIN_DATABASE_URL is not set
 */
export async function getCheckpointer(): Promise<PostgresSaver> {
  if (checkpointerInstance) {
    return checkpointerInstance;
  }

  const databaseUrl = process.env.LANGCHAIN_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "LANGCHAIN_DATABASE_URL environment variable is required for persistent chat history. " +
      "Please set it in your .env file (separate from Mastra's DATABASE_URL)."
    );
  }

  console.log("🗄️  Initializing PostgreSQL checkpointer for chat history...");

  try {
    // Create connection pool for better performance
    // Recommended for production by LangGraph docs
    connectionPool = new pg.Pool({
      connectionString: databaseUrl,
      max: 10, // Maximum pool size
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000, // 10 seconds for remote databases
      ssl: false,
    });

    // Create checkpointer with connection pool
    // Optional: specify custom schema (defaults to "public")
    checkpointerInstance = new PostgresSaver(connectionPool);

    // IMPORTANT: Must call .setup() on first use to create checkpoint tables
    // This is idempotent - safe to run multiple times
    await checkpointerInstance.setup();

    console.log("✅ PostgreSQL checkpointer initialized successfully");
    console.log("   📊 Connection pool: max 10 connections");
    console.log("   📁 Schema: public");
    console.log("   💾 Tables: checkpoints, writes");
    console.log("   ♻️  Chat history will persist across server restarts\n");

    return checkpointerInstance;
  } catch (error) {
    console.error("❌ Failed to initialize PostgreSQL checkpointer:", error);

    // Clean up on error
    if (connectionPool) {
      await connectionPool.end();
      connectionPool = null;
    }

    throw error;
  }
}

/**
 * Close checkpointer and connection pool (for graceful shutdown)
 *
 * Should be called when shutting down the server to properly
 * release database connections.
 */
export async function closeCheckpointer(): Promise<void> {
  if (connectionPool) {
    console.log("🔌 Closing PostgreSQL connection pool...");
    await connectionPool.end();
    connectionPool = null;
    checkpointerInstance = null;
    console.log("✅ PostgreSQL checkpointer connection closed");
  }
}

/**
 * Get connection pool stats (for monitoring)
 */
export function getPoolStats() {
  if (!connectionPool) {
    return null;
  }

  return {
    totalCount: connectionPool.totalCount,
    idleCount: connectionPool.idleCount,
    waitingCount: connectionPool.waitingCount,
  };
}
