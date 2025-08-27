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

// ANSI color codes for pretty logging
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

// Helper to sanitize sensitive config values
function sanitizeConfig(config: any): any {
  if (typeof config !== 'object' || config === null) {
    return config;
  }
  
  const sanitized = { ...config };
  const sensitiveKeys = ['apiKey', 'api_key', 'password', 'token', 'secret', 'key'];
  
  for (const key in sanitized) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = sanitized[key] ? '***' : undefined;
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeConfig(sanitized[key]);
    }
  }
  
  return sanitized;
}

// Pretty logger for service initialization
function logServiceInit(serviceName: string, emoji: string, config?: any) {
  const configStr = config ? ` ${colors.dim}(${JSON.stringify(sanitizeConfig(config))})${colors.reset}` : '';
  console.log(`${colors.cyan}${emoji}${colors.reset} ${colors.blue}Initializing ${serviceName}...${colors.reset}${configStr}`);
}

function logServiceSuccess(serviceName: string) {
  console.log(`${colors.green}✓${colors.reset} ${colors.dim}${serviceName} initialized${colors.reset}`);
}

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
  console.log(`\n${colors.cyan}🔧${colors.reset} ${colors.blue}Initializing Core Services...${colors.reset}\n`);
  
  const container = new ServiceContainer();

  // Initialize LLM provider
  logServiceInit('LLM Provider', '🤖', { provider: config.llm.provider, ...config.llm.config });
  const llmProvider = new OpenAIProvider(config.llm.config);
  await llmProvider.initialize();
  container.register(TOKENS.LLM_PROVIDER, () => llmProvider);
  logServiceSuccess('LLM Provider');

  // Initialize LLM service
  logServiceInit('LLM Service', '💬');
  const llmService = new LLMService(llmProvider);
  container.register(TOKENS.LLM_SERVICE, () => llmService);
  logServiceSuccess('LLM Service');

  // Initialize Vector provider
  logServiceInit('Vector Provider', '🔍', { provider: config.vector.provider, url: config.vector.config.url, port: config.vector.config.port });
  const vectorProvider = new QdrantProvider(config.vector.config);
  await vectorProvider.initialize();
  container.register(TOKENS.VECTOR_PROVIDER, () => vectorProvider);
  logServiceSuccess('Vector Provider');

  // Initialize Vector service
  logServiceInit('Vector Service', '📊');
  const vectorService = new VectorService(vectorProvider, llmService);
  container.register(TOKENS.VECTOR_SERVICE, () => vectorService);
  logServiceSuccess('Vector Service');

  // Initialize Functions provider
  logServiceInit('Functions Provider', '📁', { provider: config.functions.provider, functionsDir: config.functions.config.functionsDir });
  const functionsProvider = new LocalDirectoryProvider(config.functions.config);
  await functionsProvider.initialize();
  container.register(TOKENS.FUNCTIONS_PROVIDER, () => functionsProvider);
  logServiceSuccess('Functions Provider');

  // Initialize Functions service
  logServiceInit('Functions Service', '⚙️', config.functionsService);
  const functionsService = new FunctionsService(
    functionsProvider,
    vectorService,
    llmService,
    config.functionsService,
  );
  container.register(TOKENS.FUNCTIONS_SERVICE, () => functionsService);
  logServiceSuccess('Functions Service');

  // Initialize Env service (optional)
  let envService: EnvService | undefined;
  if (config.env) {
    logServiceInit('Env Service', '🔐', { provider: config.env.provider, envFilePath: config.env.config?.envFilePath });
    const envProvider = new FilepathEnvProvider(config.env.config);
    await envProvider.initialize();
    container.register(TOKENS.ENV_PROVIDER, () => envProvider);
    envService = new EnvService(envProvider);
    container.register(TOKENS.ENV_SERVICE, () => envService);
    logServiceSuccess('Env Service');
  }

  // Initialize Shell service (optional)
  let shellService: ShellService | undefined;
  if (config.shell) {
    logServiceInit('Shell Service', '💻', { dataDir: config.shell.config?.dataDir, shellPath: config.shell.config?.shellPath });
    shellService = new ShellService(config.shell.config);
    await shellService.initialize();
    container.register(TOKENS.SHELL_SERVICE, () => shellService);
    logServiceSuccess('Shell Service');
  }

  console.log(`\n${colors.green}✅${colors.reset} ${colors.blue}All core services initialized successfully${colors.reset}\n`);

  return {
    container,
    llmService,
    vectorService,
    functionsService,
    envService,
    shellService,
  };
}
