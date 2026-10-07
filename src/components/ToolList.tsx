import type { McpTool } from "../lib/openapiParser";

type ToolListProps = { tools: McpTool[] };

function parameterType(type?: string): string {
  return type === "integer" || type === "number" ? type : type ?? "string";
}

export default function ToolList({ tools }: ToolListProps) {
  if (tools.length === 0) {
    return <div className="empty-state"><span>⌘</span><h3>No tools yet</h3><p>Convert an OpenAPI document to see its operations here.</p></div>;
  }

  return (
    <div className="tool-grid">
      {tools.map((tool) => {
        const properties = tool.inputSchema.properties;
        const responses = tool.responses ?? [];
        return (
          <article className="tool-card" key={tool.name}>
            <div className="tool-route">
              <span className={`method method-${tool.method.toLowerCase()}`}>{tool.method}</span>
              <code>{tool.path}</code>
            </div>
            <h3>{tool.name}</h3>
            <p className="tool-description">{tool.description}</p>
            {responses.length > 0 && (
              <p className="tool-response">
                <span>RESPONSES</span>{" "}
                {responses.map(({ statusCode, description, contentType, schema }) =>
                  `${statusCode}${description ? ` ${description}` : ""}${contentType ? ` · ${contentType}` : ""}${schema ? ` (${schema.type ?? "schema"})` : ""}`,
                ).join(" · ")}
              </p>
            )}
            <div className="tool-parameters">
              <span className="parameter-label">INPUT PARAMETERS</span>
              {Object.keys(properties).length === 0 ? (
                <span className="no-params">No parameters</span>
              ) : (
                <div className="parameter-list">
                  {Object.entries(properties).map(([name, schema]) => (
                    <span className="parameter-chip" key={name}>
                      <code>{name}</code><span>{parameterType(schema.type)}</span>
                      {tool.inputSchema.required.includes(name) && <b title="Required">required</b>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
