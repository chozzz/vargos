import { Provider } from "./provider.interface";
import { FunctionListResponse } from "../classes/functions-list.class";
import { FunctionMetadata } from "../classes/functions-metadata.class";

export interface FunctionsProvider extends Provider {
  /**
   * List all available functions
   */
  listFunctions(): Promise<FunctionListResponse>;

  /**
   * Get metadata for a specific function
   * @param functionId The ID of the function to get metadata for
   */
  getFunctionMetadata(functionId: string): Promise<FunctionMetadata>;

  /**
   * Execute a function with the given parameters
   * @param functionId The ID of the function to execute
   * @param params The parameters to pass to the function
   */
  executeFunction(functionId: string, params: any): Promise<any>;
}
