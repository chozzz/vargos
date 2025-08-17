import { Injectable, Logger } from "@nestjs/common";
import {
  FunctionsService as CoreFunctionsService,
  FunctionListResponse,
  FunctionMetadata,
} from "@workspace/core-lib";
import { VectorService } from "../vector/vector.service";
import { LLMService } from "../llm/llm.service";
import { LocalDirectoryProvider } from "./providers/local-directory.provider";

@Injectable()
export class FunctionsService {
  private readonly functionMetaCollection = "vargos-functions-meta";
  private readonly logger = new Logger(FunctionsService.name);
  private coreService: CoreFunctionsService;

  constructor(
    private vectorService: VectorService,
    private llmService: LLMService,
    private localDirectoryProvider: LocalDirectoryProvider,
  ) {
    // Default to local directory provider for now
    this.coreService = new CoreFunctionsService(
      this.localDirectoryProvider,
      this.vectorService.coreService,
      this.llmService.coreService,
      {
        functionMetaCollection: this.functionMetaCollection,
      },
    );
  }

  async listFunctions(): Promise<FunctionListResponse> {
    return this.coreService.listFunctions();
  }

  async indexFunction(functionMeta: FunctionMetadata) {
    return this.coreService.indexFunction(functionMeta);
  }

  async searchFunctions(query: string, limit: number = 10) {
    return this.coreService.searchFunctions(query, limit);
  }

  async executeFunction(
    functionId: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return this.coreService.executeFunction(functionId, params);
  }
}
