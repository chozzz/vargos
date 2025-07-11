import { ServiceContainer } from "../core/container";
import { TOKENS } from "../core/tokens";
import { LLMService } from "../llm/llm.service";
import { OpenAIProvider, OpenAIProviderConfig } from "../llm/providers/openai.provider";
import { VectorService } from "../vector/vector.service";
import { QdrantProvider, QdrantProviderConfig } from "../vector/providers/qdrant.provider";
import { FunctionsService } from "../functions/functions.service";
import { LocalDirectoryProvider, LocalDirectoryProviderConfig } from "../functions/providers/local-directory.provider";
import { EnvService } from "../env/env.service";
import { FilepathEnvProvider } from "../env/providers/filepath.provider";
import { ShellService, ShellServiceConfig } from "../shell/shell.service";

export interface CoreServicesConfig {
  llm: {
    provider: "openai";
    config: OpenAIProviderConfig;
  };
  vector: {
    provider: "qdrant";
    config: QdrantProviderConfig;
  };
  functions: {
    provider: "local-directory";
    config: LocalDirectoryProviderConfig;
  };
  env?: {
    provider: "filepath";
    config?: { envFilePath?: string; censoredKeys?: string[] };
  };
  shell?: {
    config?: ShellServiceConfig;
  };
  functionsService?: {
    functionMetaCollection?: string;
  };
}

export interface CoreServices {
  container: ServiceContainer;
  llmService: LLMService;
  vectorService: VectorService;
  functionsService: FunctionsService;
  envService?: EnvService;
  shellService?: ShellService;
}

export async function createCoreServices(
  config: CoreServicesConfig,
): Promise<CoreServices> {
  const container = new ServiceContainer();

  // Initialize LLM provider
  const llmProvider = new OpenAIProvider(config.llm.config);
  await llmProvider.initialize();
  container.register(TOKENS.LLM_PROVIDER, () => llmProvider);

  // Initialize LLM service
  const llmService = new LLMService(llmProvider);
  container.register(TOKENS.LLM_SERVICE, () => llmService);

  // Initialize Vector provider
  const vectorProvider = new QdrantProvider(config.vector.config);
  await vectorProvider.initialize();
  container.register(TOKENS.VECTOR_PROVIDER, () => vectorProvider);

  // Initialize Vector service
  const vectorService = new VectorService(vectorProvider, llmService);
  container.register(TOKENS.VECTOR_SERVICE, () => vectorService);

  // Initialize Functions provider
  const functionsProvider = new LocalDirectoryProvider(config.functions.config);
  await functionsProvider.initialize();
  container.register(TOKENS.FUNCTIONS_PROVIDER, () => functionsProvider);

  // Initialize Functions service
  const functionsService = new FunctionsService(
    functionsProvider,
    vectorService,
    llmService,
    config.functionsService,
  );
  container.register(TOKENS.FUNCTIONS_SERVICE, () => functionsService);

  // Initialize Env service (optional)
  let envService: EnvService | undefined;
  if (config.env) {
    const envProvider = new FilepathEnvProvider(config.env.config);
    await envProvider.initialize();
    container.register(TOKENS.ENV_PROVIDER, () => envProvider);
    envService = new EnvService(envProvider);
    container.register(TOKENS.ENV_SERVICE, () => envService);
  }

  // Initialize Shell service (optional)
  let shellService: ShellService | undefined;
  if (config.shell) {
    shellService = new ShellService(config.shell.config);
    await shellService.initialize();
    container.register(TOKENS.SHELL_SERVICE, () => shellService);
  }

  return {
    container,
    llmService,
    vectorService,
    functionsService,
    envService,
    shellService,
  };
}
