import { Provider } from "./provider.interface";
import { FunctionListResponseDto, FunctionMetadataDto } from "../../functions/schemas/functions.schema";

export interface FunctionsProvider extends Provider {
  /**
   * List all available functions
   */
  listFunctions(): Promise<FunctionListResponseDto>;

  /**
   * Get metadata for a specific function
   * @param functionId The ID of the function to get metadata for
   */
  getFunctionMetadata(functionId: string): Promise<FunctionMetadataDto>;

  /**
   * Execute a function with the given parameters
   * @param functionId The ID of the function to execute
   * @param params The parameters to pass to the function
   */
  executeFunction<T = Record<string, unknown>, R = unknown>(
    functionId: string,
    params: T,
  ): Promise<R>;
}
