import { PostgresStore, PgVector } from "@mastra/pg";
import { Memory } from "@mastra/memory";
import { fastembed } from "@mastra/fastembed";

export const pgMemory = new Memory({
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL!
  }),
  vector: new PgVector({
    connectionString: process.env.DATABASE_URL!
  }),
  embedder: fastembed,
  options: {
    lastMessages: 5, // Reduced from 10 to lower token usage
    semanticRecall: {
      topK: 2, // Reduced from 3 to minimize context
      messageRange: 3, // Reduced from 5
      scope: 'resource'
    },
    workingMemory: {
      enabled: true,
    },
    threads: {
      generateTitle: true
    }
  },
});