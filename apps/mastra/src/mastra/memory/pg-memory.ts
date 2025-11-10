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
    lastMessages: 10,
    semanticRecall: {
      topK: 3,
      messageRange: 5,
      scope: 'resource'
    },
    workingMemory: {
      enabled: true
    },
    threads: {
      generateTitle: true
    }
  },
});