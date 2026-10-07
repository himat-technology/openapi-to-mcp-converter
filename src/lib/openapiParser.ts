export type JsonSchema = {
  type?: string;
  description?: string;
  format?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchema;
  const?: unknown;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
};

export type ToolResponse = {
  statusCode: string;
  description: string;
  contentType?: string;
  schema?: JsonSchema;
};

export type ToolParameter = {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  schema: JsonSchema;
  description?: string;
  style?: string;
  explode?: boolean;
};

export type McpTool = {
  name: string;
  description: string;
  method: string;
  path: string;
  inputSchema: {
    type: "object";
    properties: Record<string, JsonSchema>;
    required: string[];
  };
  parameters: ToolParameter[];
  requestBody?: JsonSchema;
  requestBodyKey?: string;
  responses: ToolResponse[];
};

export type Authentication = {
  apiKey?: { name: string; in: "header" | "query" };
  bearerToken?: boolean;
};

export type ConversionResult = {
  apiTitle: string;
  apiDescription: string;
  tools: McpTool[];
  serverUrl: string;
  authentication: Authentication;
  warnings: string[];
};

type OpenApiDocument = {
  openapi?: unknown;
  info?: { title?: unknown; description?: unknown };
  servers?: Array<{ url?: unknown }>;
  paths?: Record<string, unknown>;
  components?: {
    schemas?: Record<string, JsonSchema>;
    parameters?: Record<string, unknown>;
    requestBodies?: Record<string, unknown>;
    responses?: Record<string, unknown>;
    securitySchemes?: Record<string, { type?: string; name?: string; in?: string; scheme?: string }>;
  };
};

const supportedMethods = new Set(["get", "post", "put", "patch", "delete"]);
const httpMethods = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);
const pathItemFields = new Set(["parameters", "summary", "description", "servers"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveComponentRef(
  value: unknown,
  document: OpenApiDocument,
  section: "schemas" | "parameters" | "requestBodies" | "responses",
  depth = 0,
): unknown {
  if (!isRecord(value) || typeof value.$ref !== "string") return value;
  const prefix = `#/components/${section}/`;
  if (!value.$ref.startsWith(prefix)) {
    throw new Error(`Unsupported ${section} reference "${value.$ref}". Only local component references are supported.`);
  }
  if (depth >= 10) throw new Error(`Reference nesting is too deep for "${value.$ref}".`);
  const name = value.$ref.slice(prefix.length).replace(/~1/g, "/").replace(/~0/g, "~");
  const referenced = document.components?.[section]?.[name];
  if (!referenced) throw new Error(`Could not resolve ${section} reference "${value.$ref}".`);
  return resolveComponentRef(referenced, document, section, depth + 1);
}

function resolveSchema(value: unknown, document: OpenApiDocument, depth = 0): JsonSchema {
  value = resolveComponentRef(value, document, "schemas", depth);
  if (!isRecord(value)) return { type: "string" };
  if (depth > 10) return { type: "object" };

  const schema: JsonSchema = {};
  if (typeof value.type === "string") schema.type = value.type;
  if (typeof value.description === "string") schema.description = value.description;
  if (typeof value.format === "string") schema.format = value.format;
  if (Array.isArray(value.enum)) schema.enum = value.enum;
  if (Object.hasOwn(value, "const")) schema.const = value.const;
  if (value.nullable === true) schema.nullable = true;
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"] as const) {
    if (typeof value[key] === "number") schema[key] = value[key];
  }
  if (typeof value.pattern === "string") schema.pattern = value.pattern;
  if (typeof value.additionalProperties === "boolean") {
    schema.additionalProperties = value.additionalProperties;
  } else if (isRecord(value.additionalProperties)) {
    schema.additionalProperties = resolveSchema(value.additionalProperties, document, depth + 1);
  }
  if (isRecord(value.items)) schema.items = resolveSchema(value.items, document, depth + 1);
  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    if (Array.isArray(value[key])) {
      schema[key] = value[key].map((child) => resolveSchema(child, document, depth + 1));
    }
  }
  if (isRecord(value.properties)) {
    schema.properties = Object.fromEntries(
      Object.entries(value.properties).map(([name, child]) => [
        name,
        resolveSchema(child, document, depth + 1),
      ]),
    );
  }
  if (Array.isArray(value.required)) {
    schema.required = value.required.filter((entry): entry is string => typeof entry === "string");
  }
  if (!schema.type) {
    if (schema.properties) schema.type = "object";
    else if (schema.allOf?.some((part) => part.type === "object")) schema.type = "object";
    else if (schema.anyOf?.[0]?.type) schema.type = schema.anyOf[0].type;
    else if (schema.oneOf?.[0]?.type) schema.type = schema.oneOf[0].type;
    else if (schema.enum?.every((item) => typeof item === "string")) schema.type = "string";
    else schema.type = "string";
  }
  return schema;
}

function generatedOperationName(method: string, path: string): string {
  const segments = path.split("/").filter(Boolean);
  const resource = segments.at(-1) ?? "endpoint";
  const isParameter = /^\{.+\}$/.test(resource);
  const rawResource = isParameter ? segments.at(-2) ?? "item" : resource;
  const singular = rawResource.endsWith("ies")
    ? `${rawResource.slice(0, -3)}y`
    : rawResource.endsWith("s") && rawResource.length > 1
      ? rawResource.slice(0, -1)
      : rawResource;
  const verb: Record<string, string> = {
    get: isParameter ? "get" : "list",
    post: "create",
    put: "update",
    patch: "update",
    delete: "delete",
  };
  const suffix = isParameter && method === "get" ? singular : rawResource;
  return `${verb[method]}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`
    .replace(/[^a-zA-Z0-9_$]/g, "")
    .replace(/^[^a-zA-Z_$]+/, "") || `${method}Endpoint`;
}

function uniqueName(candidate: string, used: Set<string>): string {
  const normalized = candidate.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  const base = normalized || "apiOperation";
  let name = base;
  let suffix = 2;
  while (used.has(name)) name = `${base}${suffix++}`;
  used.add(name);
  return name;
}

export function convertOpenApiToMcp(input: unknown): ConversionResult {
  if (!isRecord(input)) throw new Error("The OpenAPI document must be a JSON object.");
  const document = input as OpenApiDocument;
  if (typeof document.openapi !== "string" || !/^3\.\d+(\.\d+)?(?:[-+].*)?$/.test(document.openapi)) {
    throw new Error("Unsupported or missing OpenAPI version. Please provide an OpenAPI 3.x document.");
  }
  if (!isRecord(document.paths) || Object.keys(document.paths).length === 0) {
    throw new Error("No API paths were found. Add at least one operation under the top-level paths object.");
  }

  const tools: McpTool[] = [];
  const warnings: string[] = [];
  const usedNames = new Set<string>();
  const supportedParamLocations = new Set(["path", "query", "header"]);

  for (const [path, rawPathItem] of Object.entries(document.paths)) {
    if (!isRecord(rawPathItem)) continue;
    const pathParameters = Array.isArray(rawPathItem.parameters) ? rawPathItem.parameters : [];

    for (const [method, rawOperation] of Object.entries(rawPathItem)) {
      if (pathItemFields.has(method) || method.startsWith("$") || method.startsWith("x-")) continue;
      if (!httpMethods.has(method.toLowerCase())) continue;
      if (!supportedMethods.has(method.toLowerCase())) {
        warnings.push(`Skipped unsupported HTTP method "${method.toUpperCase()}" on ${path}.`);
        continue;
      }
      if (!isRecord(rawOperation)) continue;
      const operation = rawOperation;
      const operationParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
      const parameters: ToolParameter[] = [];
      const properties = Object.create(null) as Record<string, JsonSchema>;
      const required: string[] = [];
      const mergedParameters = new Map<
        string,
        Record<string, unknown> & { name: string; in: ToolParameter["in"] }
      >();

      for (const parameterInput of [...pathParameters, ...operationParameters]) {
        const rawParameter = resolveComponentRef(parameterInput, document, "parameters");
        if (!isRecord(rawParameter) || typeof rawParameter.name !== "string") continue;
        if (typeof rawParameter.in !== "string" || !supportedParamLocations.has(rawParameter.in)) continue;
        mergedParameters.set(
          `${rawParameter.in}\u0000${rawParameter.name}`,
          rawParameter as Record<string, unknown> & { name: string; in: ToolParameter["in"] },
        );
      }

      for (const rawParameter of mergedParameters.values()) {
        const location = rawParameter.in;
        const schema = resolveSchema(rawParameter.schema, document);
        const isRequired = location === "path" || rawParameter.required === true;
        const parameter: ToolParameter = {
          name: rawParameter.name,
          in: location,
          required: isRequired,
          schema: {
            ...schema,
            ...(typeof rawParameter.description === "string" && !schema.description
              ? { description: rawParameter.description }
              : {}),
          },
          ...(typeof rawParameter.style === "string" ? { style: rawParameter.style } : {}),
          ...(typeof rawParameter.explode === "boolean"
            ? { explode: rawParameter.explode }
            : {}),
        };
        if (typeof rawParameter.description === "string") parameter.description = rawParameter.description;
        parameters.push(parameter);
        properties[parameter.name] = parameter.schema;
        if (isRequired && !required.includes(parameter.name)) required.push(parameter.name);
      }

      let requestBody: JsonSchema | undefined;
      let requestBodyKey: string | undefined;
      const resolvedRequestBody = resolveComponentRef(operation.requestBody, document, "requestBodies");
      if (isRecord(resolvedRequestBody)) {
        const content = resolvedRequestBody.content;
        if (isRecord(content)) {
          const jsonContentType = Object.keys(content).find((contentType) => {
            const normalized = contentType.toLowerCase();
            return normalized === "application/json" || normalized.endsWith("+json");
          });
          const jsonEntry = jsonContentType ? content[jsonContentType] : undefined;
          if (isRecord(jsonEntry) && jsonEntry.schema) {
            requestBody = resolveSchema(jsonEntry.schema, document);
            requestBodyKey = "body";
            let suffix = 2;
            while (Object.hasOwn(properties, requestBodyKey)) {
              requestBodyKey = `body_${suffix++}`;
            }
            properties[requestBodyKey] = requestBody;
            if (resolvedRequestBody.required === true) required.push(requestBodyKey);
          }
        }
      }
      if (isRecord(resolvedRequestBody) && resolvedRequestBody.content && !requestBody) {
        warnings.push(`No JSON request body schema found for ${method.toUpperCase()} ${path}; non-JSON bodies are not supported.`);
      }

      const operationId = typeof operation.operationId === "string" ? operation.operationId.trim() : "";
      const name = uniqueName(
        operationId || generatedOperationName(method.toLowerCase(), path),
        usedNames,
      );
      const description =
        (typeof operation.summary === "string" && operation.summary) ||
        (typeof operation.description === "string" && operation.description) ||
        `${method.toUpperCase()} ${path}`;
      const responses = isRecord(operation.responses)
        ? Object.entries(operation.responses)
            .map(([statusCode, response]) => [
              statusCode,
              resolveComponentRef(response, document, "responses"),
            ] as const)
            .filter((entry): entry is readonly [string, Record<string, unknown>] => isRecord(entry[1]))
            .map(([statusCode, response]) => {
              const content = isRecord(response.content) ? response.content : {};
              const contentType = Object.keys(content).find((type) => {
                const normalized = type.toLowerCase();
                return normalized === "application/json" || normalized.endsWith("+json");
              });
              const media = contentType ? content[contentType] : undefined;
              return {
                statusCode,
                description: typeof response.description === "string" ? response.description : "",
                ...(contentType ? { contentType } : {}),
                ...(isRecord(media) && media.schema
                  ? { schema: resolveSchema(media.schema, document) }
                  : {}),
              };
            })
        : [];
      tools.push({
        name,
        description,
        method: method.toUpperCase(),
        path,
        inputSchema: { type: "object", properties, required },
        parameters,
        ...(requestBody ? { requestBody, requestBodyKey } : {}),
        responses,
      });
    }
  }

  if (tools.length === 0) {
    throw new Error("No supported API operations were found. Supported methods are GET, POST, PUT, PATCH, and DELETE.");
  }

  let apiKey: Authentication["apiKey"];
  let bearerToken = false;
  for (const scheme of Object.values(document.components?.securitySchemes ?? {})) {
    if (scheme.type === "apiKey" && (scheme.in === "header" || scheme.in === "query") && scheme.name) {
      apiKey ??= { name: scheme.name, in: scheme.in };
    }
    if (scheme.type === "http" && scheme.scheme?.toLowerCase() === "bearer") bearerToken = true;
  }

  return {
    apiTitle: typeof document.info?.title === "string" ? document.info.title : "OpenAPI API",
    apiDescription: typeof document.info?.description === "string" ? document.info.description : "",
    tools,
    serverUrl: typeof document.servers?.[0]?.url === "string" ? document.servers[0].url : "",
    authentication: { ...(apiKey ? { apiKey } : {}), ...(bearerToken ? { bearerToken: true } : {}) },
    warnings,
  };
}

export function parseOpenApiJson(json: string): ConversionResult {
  let document: unknown;
  try {
    document = JSON.parse(json);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown JSON parsing error";
    throw new Error(`Invalid JSON: ${detail}`);
  }
  return convertOpenApiToMcp(document);
}
