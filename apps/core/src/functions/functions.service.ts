import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { VectorService } from "../vector/vector.service";
import { LLMService } from "../llm/llm.service";
import { FunctionListResponseDto, FunctionMetadataDto } from "./schemas/functions.schema";
import { FunctionsProvider } from "../common/interfaces/functions.interface";
import { LocalDirectoryProvider } from "./providers/local-directory.provider";

@Injectable()
export class FunctionsService {
  private readonly functionMetaCollection = "vargos-functions-meta";
  private readonly logger = new Logger(FunctionsService.name);
  private provider: FunctionsProvider;

  constructor(
    private configService: ConfigService,
    private vectorService: VectorService,
    private llmService: LLMService,
    private localDirectoryProvider: LocalDirectoryProvider,
  ) {
    // Default to local directory provider for now
    this.provider = this.localDirectoryProvider;
  }

  async listFunctions(): Promise<FunctionListResponseDto> {
    return this.provider.listFunctions();
  }

  async indexFunction(functionMeta: FunctionMetadataDto) {
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
