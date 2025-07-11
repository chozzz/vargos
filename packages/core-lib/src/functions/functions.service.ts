import { FunctionListResponse, FunctionMetadata } from "./types/functions.types";
import { FunctionsProvider } from "./interfaces/functions.interface";
import { VectorService } from "../vector/vector.service";
import { LLMService } from "../llm/llm.service";

export interface FunctionsServiceConfig {
  functionMetaCollection?: string;
}

export class FunctionsService {
  private readonly functionMetaCollection: string;
  private provider: FunctionsProvider;
  private vectorService: VectorService;
  private llmService: LLMService;

  constructor(
    provider: FunctionsProvider,
    vectorService: VectorService,
    llmService: LLMService,
    config: FunctionsServiceConfig = {},
  ) {
    this.provider = provider;
    this.vectorService = vectorService;
    this.llmService = llmService;
    this.functionMetaCollection =
      config.functionMetaCollection || "vargos-functions-meta";
  }

  async listFunctions(): Promise<FunctionListResponse> {
    return this.provider.listFunctions();
  }

  async indexFunction(functionMeta: FunctionMetadata) {
    const text = `Name: ${functionMeta.name}\nDescription: ${functionMeta.description}\nTags: ${functionMeta.tags.join(", ")}`;
    const vector = await this.llmService.generateEmbeddings(text);
    const functionMetaWithVector = {
      collectionName: this.functionMetaCollection,
      id: functionMeta.id,
      vector,
      payload: functionMeta,
    };

    return await this.vectorService.index(functionMetaWithVector);
  }

  async searchFunctions(query: string, limit: number = 10) {
    return this.vectorService.search(query, {
      collectionName: this.functionMetaCollection,
      limit,
    });
  }

  async executeFunction(
    functionId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return this.provider.executeFunction(functionId, params);
  }
}

