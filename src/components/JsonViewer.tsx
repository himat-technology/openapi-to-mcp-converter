type JsonViewerProps = { value: string };

export default function JsonViewer({ value }: JsonViewerProps) {
  return (
    <div className="json-viewer">
      <div className="json-viewer-bar"><span className="file-dot" /> mcp-tools.json <span>JSON</span></div>
      <pre><code>{value || "Convert an OpenAPI document to generate MCP tool definitions."}</code></pre>
    </div>
  );
}
