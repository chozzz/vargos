export default () => ({
  vector: {
    qdrant: {
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
    },
    // Add other vector DB configs
  },
  llm: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },
    // Add other LLM configs
  },
  database: {
    type: process.env.DB_TYPE,
    // Add database-specific configs
  },
});
