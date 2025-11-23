import { Provider } from "../../core/provider.interface";
import { FunctionListResponse, FunctionMetadata } from "../types/functions.types";

export interface CreateFunctionInput {
  metadata: Omit<FunctionMetadata, "id">;
  code?: string;
}

export interface FunctionsProvider extends Provider {
  listFunctions(): Promise<FunctionListResponse>;
  getFunctionMetadata(functionId: string): Promise<FunctionMetadata>;
  executeFunction<T = Record<string, unknown>, R = unknown>(
    functionId: string,
    params: T,
  ): Promise<R>;
  createFunction(input: CreateFunctionInput): Promise<FunctionMetadata>;
}

