import type { ConversionResult, JsonSchema, McpTool } from "./openapiParser";

function zodSchema(schema: JsonSchema): string {
  let expression: string;
  if (Object.hasOwn(schema, "const")) {
    expression = `z.literal(${JSON.stringify(schema.const)})`;
  } else if (schema.enum?.length) {
    const literals = schema.enum.map((value) => `z.literal(${JSON.stringify(value)})`);
    expression = literals.length === 1 ? literals[0] : `z.union([${literals.join(", ")}])`;
  } else if (schema.oneOf?.length || schema.anyOf?.length) {
    const alternatives = (schema.oneOf ?? schema.anyOf ?? []).map(zodSchema);
    expression = alternatives.length === 1 ? alternatives[0] : `z.union([${alternatives.join(", ")}])`;
  } else if (schema.allOf?.length) {
    expression = schema.allOf.map(zodSchema).reduce((left, right) => `z.intersection(${left}, ${right})`);
  } else {
    switch (schema.type) {
      case "integer":
        expression = "z.number().int()";
        break;
      case "number":
        expression = "z.number()";
        break;
      case "boolean":
        expression = "z.boolean()";
        break;
      case "array":
        expression = `z.array(${zodSchema(schema.items ?? { type: "string" })})`;
        break;
      case "object":
        if (schema.properties) {
          expression = `z.object(${zodObjectShape(schema.properties, schema.required ?? [])})`;
          if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
            expression += `.catchall(${zodSchema(schema.additionalProperties)})`;
          }
        } else if (schema.additionalProperties === false) {
          expression = "z.object({})";
        } else {
          expression = `z.record(${typeof schema.additionalProperties === "object" ? zodSchema(schema.additionalProperties) : "z.unknown()"})`;
        }
        break;
      default:
        expression = "z.string()";
    }
  }
  if (schema.type === "object" && schema.additionalProperties === true && schema.properties) {
    expression += ".passthrough()";
  }
  const hasDirectType = !schema.enum?.length
    && !Object.hasOwn(schema, "const")
    && !schema.oneOf?.length
    && !schema.anyOf?.length
    && !schema.allOf?.length;
  if (hasDirectType && (schema.type === "number" || schema.type === "integer")) {
    if (schema.minimum !== undefined) expression += `.min(${schema.minimum})`;
    if (schema.maximum !== undefined) expression += `.max(${schema.maximum})`;
  } else if (hasDirectType && schema.type === "string") {
    if (schema.minLength !== undefined) expression += `.min(${schema.minLength})`;
    if (schema.maxLength !== undefined) expression += `.max(${schema.maxLength})`;
    if (schema.pattern) expression += `.regex(new RegExp(${JSON.stringify(schema.pattern)}))`;
  } else if (hasDirectType && schema.type === "array") {
    if (schema.minItems !== undefined) expression += `.min(${schema.minItems})`;
    if (schema.maxItems !== undefined) expression += `.max(${schema.maxItems})`;
  }
  if (schema.nullable) expression += ".nullable()";
  if (schema.description) expression += `.describe(${JSON.stringify(schema.description)})`;
  return expression;
}

function zodObjectShape(properties: Record<string, JsonSchema>, required: string[]): string {
  const entries = Object.entries(properties);
  if (entries.length === 0) return "{}";
  return `{\n${entries
    .map(([name, schema]) => {
      const optional = !required.includes(name);
      return `      ${JSON.stringify(name)}: ${zodSchema(schema)}${optional ? ".optional()" : ""},`;
    })
    .join("\n")}\n    }`;
}

function inputShape(tool: McpTool): string {
  return zodObjectShape(tool.inputSchema.properties, tool.inputSchema.required);
}

function operationRegistration(tool: McpTool): string {
  const bindings = JSON.stringify(
    tool.parameters.map(({ name, in: location, required, style, explode }) => ({
      name,
      in: location,
      required,
      ...(style ? { style } : {}),
      ...(explode === undefined ? {} : { explode }),
    })),
  );
  const body = tool.requestBody ? JSON.stringify(tool.requestBodyKey) : "undefined";
  return `server.registerTool(
    ${JSON.stringify(tool.name)},
    {
      description: ${JSON.stringify(tool.description)},
      inputSchema: ${inputShape(tool)},
    },
    async (args) => callApi(${JSON.stringify(tool.method)}, ${JSON.stringify(tool.path)}, ${bindings}, ${body}, args),
  );`;
}

function renderParameterAuth(result: ConversionResult): string {
  const lines: string[] = [];
  if (result.authentication.apiKey?.in === "header") {
    lines.push(`  if (process.env.API_KEY) headers[process.env.API_KEY_HEADER || ${JSON.stringify(result.authentication.apiKey.name)}] = process.env.API_KEY;`);
  }
  if (result.authentication.apiKey?.in === "query") {
    lines.push(`  if (process.env.API_KEY) url.searchParams.set(${JSON.stringify(result.authentication.apiKey.name)}, process.env.API_KEY);`);
  }
  if (!result.authentication.apiKey) {
    lines.push('  if (process.env.API_KEY) headers[process.env.API_KEY_HEADER || "X-API-Key"] = process.env.API_KEY;');
  }
  lines.push('  if (process.env.BEARER_TOKEN) headers.Authorization = `Bearer ${process.env.BEARER_TOKEN}`;');
  return lines.join("\n");
}

function renderTools(result: ConversionResult): string {
  if (result.tools.length === 0) return "  // No operations were generated.";
  return result.tools.map(operationRegistration).join("\n\n");
}

export function generateMcpServerSource(result: ConversionResult): string {
  return `import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: ${JSON.stringify(result.apiTitle.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "openapi-mcp-server")},
  version: "1.0.0",
});
const baseUrl = (process.env.API_BASE_URL || ${JSON.stringify(result.serverUrl)}).replace(/\\/$/, "");

async function callApi(
  method: string,
  path: string,
  parameters: Array<{ name: string; in: "path" | "query" | "header"; required: boolean; style?: string; explode?: boolean }>,
  bodyKey: string | undefined,
  args: Record<string, unknown>,
) {
  if (!baseUrl) throw new Error("Set API_BASE_URL in your .env file or provide a server URL in the OpenAPI document.");
  const encodePathValue = (value: unknown) => encodeURIComponent(String(value));
  const serializePathParameter = (value: unknown, parameter: { name: string; style?: string; explode?: boolean }) => {
    const style = parameter.style || "simple";
    const explode = parameter.explode ?? false;
    if (Array.isArray(value)) {
      const values = value.map(encodePathValue);
      if (style === "label") return \`.\${values.join(explode ? "." : ",")}\`;
      if (style === "matrix") {
        return explode
          ? values.map(item => \`;\${parameter.name}=\${item}\`).join("")
          : \`;\${parameter.name}=\${values.join(",")}\`;
      }
      return values.join(",");
    }
    if (typeof value === "object" && value !== null) {
      const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [encodePathValue(key), encodePathValue(item)]);
      const separator = style === "label" ? "." : ",";
      const pairSeparator = explode ? (style === "matrix" ? "" : separator) : ",";
      if (style === "matrix" && explode) return entries.map(([key, item]) => \`;\${key}=\${item}\`).join("");
      const values = entries.map(([key, item]) => explode ? \`\${key}=\${item}\` : \`\${key},\${item}\`);
      const serialized = values.join(pairSeparator);
      return style === "label" ? \`.\${serialized}\` : style === "matrix" ? \`;\${parameter.name}=\${serialized}\` : serialized;
    }
    const encoded = encodePathValue(value);
    if (style === "label") return \`.\${encoded}\`;
    if (style === "matrix") return \`;\${parameter.name}=\${encoded}\`;
    return encoded;
  };
  const pathWithValues = path.replace(/\\{([^}]+)\\}/g, (_match, key: string) => {
    const value = args[key];
    if (value === undefined || value === null) throw new Error(\`Missing required path parameter: \${key}\`);
    const parameter = parameters.find(candidate => candidate.name === key && candidate.in === "path");
    return serializePathParameter(value, parameter ?? { name: key });
  });
  const url = new URL(\`\${baseUrl}\${pathWithValues.startsWith("/") ? "" : "/"}\${pathWithValues}\`);
  const headers: Record<string, string> = { Accept: "application/json" };
${renderParameterAuth(result)}
  for (const parameter of parameters) {
    const value = args[parameter.name];
    if (value === undefined || value === null) continue;
    if (parameter.in === "query") {
      const style = parameter.style || "form";
      const explode = parameter.explode ?? style === "form";
      if (Array.isArray(value) && style === "form" && explode) {
        for (const item of value) url.searchParams.append(parameter.name, String(item));
      } else if (Array.isArray(value)) {
        const separator = style === "spaceDelimited" ? " " : style === "pipeDelimited" ? "|" : ",";
        url.searchParams.set(parameter.name, value.map(String).join(separator));
      } else if (typeof value === "object" && value !== null) {
        const entries = Object.entries(value as Record<string, unknown>);
        if (style === "deepObject") {
          for (const [key, item] of entries) url.searchParams.set(\`\${parameter.name}[\${key}]\`, String(item));
        } else if (style === "form" && explode) {
          for (const [key, item] of entries) url.searchParams.set(key, String(item));
        } else {
          url.searchParams.set(parameter.name, entries.flatMap(([key, item]) => [key, String(item)]).join(","));
        }
      } else {
        url.searchParams.set(parameter.name, String(value));
      }
    }
    if (parameter.in === "header") {
      headers[parameter.name] = Array.isArray(value)
        ? value.map(String).join(",")
        : typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : String(value);
    }
  }
  const requestBody = bodyKey ? args[bodyKey] : undefined;
  if (requestBody !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url, {
    method,
    headers,
    ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(\`API request failed (\${response.status}): \${text}\`);
  return {
    content: [{ type: "text" as const, text: text || \`Request completed with status \${response.status}.\` }],
  };
}

${renderTools(result)}

const transport = new StdioServerTransport();
await server.connect(transport);
`;
}

export function generateServerReadme(result: ConversionResult): string {
  return `# Generated MCP Server

MCP server generated from **${result.apiTitle}**.

## Requirements

- Node.js 18 or later

## Run locally

\`\`\`bash
npm install
cp .env.example .env
# Edit .env with your API URL and credentials, if required.
npm run dev
\`\`\`

This server communicates with MCP clients over stdio. Configure it in your MCP client using the command \`npm\` and arguments \`run\`, \`dev\` from this project directory.

## Environment variables

- \`API_BASE_URL\`: optional override for the first server URL in the OpenAPI document.
- \`API_KEY\`: optional API key.
- \`API_KEY_HEADER\`: optional API key header override (defaults to the declared header name, or \`X-API-Key\` when none is declared).
- \`BEARER_TOKEN\`: optional bearer token.

Never commit real credentials. The server sends requests to the API described in the OpenAPI document; review the specification and generated source before running it.

## Included tools

${result.tools.map((tool) => `- \`${tool.name}\` — \`${tool.method} ${tool.path}\``).join("\n")}
`;
}

export function generateServerFiles(result: ConversionResult): Record<string, string> {
  return {
    "package.json": JSON.stringify({
      name: "generated-mcp-server",
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: { dev: "tsx src/index.ts", build: "tsc", start: "node dist/index.js" },
      dependencies: {
        "@modelcontextprotocol/sdk": "^1.12.1",
        "dotenv": "^16.4.7",
        "zod": "^3.25.76",
      },
      devDependencies: { "@types/node": "^22.10.5", "tsx": "^4.19.2", "typescript": "~5.7.3" },
    }, null, 2),
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        outDir: "dist",
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
      },
      include: ["src"],
    }, null, 2),
    ".env.example": `API_BASE_URL=${result.serverUrl || "https://api.example.com"}\nAPI_KEY=\nAPI_KEY_HEADER=${result.authentication.apiKey?.in === "header" ? result.authentication.apiKey.name : "X-API-Key"}\nBEARER_TOKEN=\n`,
    "src/index.ts": generateMcpServerSource(result),
    "README.md": generateServerReadme(result),
  };
}
