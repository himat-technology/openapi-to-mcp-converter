import type { ConversionResult } from "./openapiParser";

export function getMcpToolDefinitions(result: ConversionResult) {
  return result.tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

export function createMcpJson(result: ConversionResult): string {
  return JSON.stringify(getMcpToolDefinitions(result), null, 2);
}
