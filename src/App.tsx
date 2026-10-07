import { useMemo, useState } from "react";
import JSZip from "jszip";
import JsonViewer from "./components/JsonViewer";
import OpenApiEditor from "./components/OpenApiEditor";
import ToolList from "./components/ToolList";
import { createMcpJson } from "./lib/mcpGenerator";
import { parseOpenApiJson, type ConversionResult } from "./lib/openapiParser";
import { generateMcpServerSource, generateServerFiles } from "./lib/serverGenerator";

const petApiExample = {
  openapi: "3.0.3",
  info: {
    title: "Pet API",
    description: "A small API for browsing and managing pets.",
    version: "1.0.0",
  },
  servers: [{ url: "https://petstore.example.com/v1" }],
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        summary: "List pets",
        parameters: [
          {
            name: "limit",
            in: "query",
            description: "Maximum number of pets to return",
            schema: { type: "integer", minimum: 1, maximum: 100 },
          },
        ],
        responses: { "200": { description: "A list of pets" } },
      },
      post: {
        operationId: "createPet",
        summary: "Create a pet",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", description: "Pet name" },
                  tag: { type: "string", description: "Optional pet category" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Pet created" } },
      },
    },
    "/pets/{id}": {
      get: {
        operationId: "getPet",
        summary: "Get a pet by ID",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Pet details" } },
      },
    },
  },
};

type Tab = "tools" | "json" | "server";

export default function App() {
  const [source, setSource] = useState("");
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("tools");
  const [notice, setNotice] = useState("");
  const [downloading, setDownloading] = useState(false);

  const mcpJson = useMemo(() => result ? createMcpJson(result) : "", [result]);
  const serverSource = useMemo(() => result ? generateMcpServerSource(result) : "", [result]);

  function convert() {
    setError("");
    setNotice("");
    try {
      const converted = parseOpenApiJson(source);
      setResult(converted);
      setActiveTab("tools");
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Unable to convert this OpenAPI document.");
    }
  }

  function loadExample() {
    setSource(JSON.stringify(petApiExample, null, 2));
    setResult(null);
    setError("");
    setNotice("Pet API example loaded. Select Convert to MCP to generate tools.");
  }

  function updateSource(value: string) {
    setSource(value);
    setResult(null);
    setError("");
    setNotice("");
  }

  function reportEditorError(message: string) {
    setResult(null);
    setNotice("");
    setError(message);
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(mcpJson);
      setNotice("MCP tool JSON copied to clipboard.");
    } catch {
      setNotice("Clipboard access failed. Select and copy the JSON manually.");
    }
  }

  async function downloadServer() {
    if (!result) return;
    setDownloading(true);
    setNotice("");
    try {
      const zip = new JSZip();
      for (const [path, content] of Object.entries(generateServerFiles(result))) {
        zip.file(`generated-mcp-server/${path}`, content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "generated-mcp-server.zip";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setNotice("MCP server ZIP downloaded.");
    } catch (caught) {
      setError(caught instanceof Error ? `ZIP generation failed: ${caught.message}` : "ZIP generation failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="#" className="brand" aria-label="OpenAPI to MCP Converter home">
          <span className="brand-mark"><span>O</span><i>→</i><span>M</span></span>
          <span className="brand-name">OpenAPI <span>to</span> MCP</span>
        </a>
        <div className="topbar-right">
          <span className="local-indicator"><i /> Runs locally</span>
          <a className="topbar-link" href="https://github.com/himat-technology/openapi-to-mcp-converter" target="_blank" rel="noreferrer">
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <main className="main-content">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-kicker"><span /> DEVELOPER TOOLKIT <span className="kicker-divider">/</span> OPEN SOURCE</div>
            <h1>OpenAPI <span>→</span> MCP Converter</h1>
            <p>Turn your existing API into MCP tools.<br className="desktop-break" /> Ready for your next AI workflow.</p>
          </div>
          <div className="hero-graphic" aria-hidden="true">
            <div className="graphic-node node-api"><span className="node-icon">{`{ }`}</span><span>OPENAPI</span></div>
            <div className="graphic-line"><i /></div>
            <div className="graphic-node node-mcp"><span className="node-icon">⌘</span><span>MCP TOOLS</span></div>
            <div className="graphic-orbit orbit-one" /><div className="graphic-orbit orbit-two" />
          </div>
        </section>

        <OpenApiEditor
          value={source}
          onChange={updateSource}
          onLoadExample={loadExample}
          onError={reportEditorError}
        />

        <div className="convert-row">
          <span className="convert-note"><span>↳</span> OpenAPI 3.x JSON supported</span>
          <button className="button button-primary" onClick={convert} disabled={!source.trim()}>
            Convert to MCP <span aria-hidden="true">→</span>
          </button>
        </div>

        {error && <div className="alert alert-error" role="alert"><span>!</span><div><b>Conversion failed</b><p>{error}</p></div></div>}
        {notice && !error && <div className="alert alert-info" role="status"><span>✓</span><p>{notice}</p></div>}

        {result && (
          <section className="results-section">
            <div className="results-heading">
              <div>
                <span className="eyebrow">02 / OUTPUT</span>
                <h2>Generated tools <span className="count-pill">{result.tools.length}</span></h2>
                <p>{result.apiTitle}{result.serverUrl ? <><span className="meta-divider">·</span><code>{result.serverUrl}</code></> : null}</p>
                {result.apiDescription && <p className="api-description">{result.apiDescription}</p>}
              </div>
              <div className="output-actions">
                <button className="button button-outline" onClick={copyJson}><span aria-hidden="true">▣</span> Copy JSON</button>
                <button className="button button-download" onClick={downloadServer} disabled={downloading}>
                  <span aria-hidden="true">↓</span> {downloading ? "Preparing ZIP…" : "Download MCP Server"}
                </button>
              </div>
            </div>

            {result.warnings.length > 0 && (
              <div className="alert alert-warning">
                <span>!</span><div><b>Some operations were skipped</b>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
              </div>
            )}

            <div className="output-panel">
              <div className="tabs" role="tablist" aria-label="Generated output">
                <button role="tab" aria-selected={activeTab === "tools"} className={activeTab === "tools" ? "active" : ""} onClick={() => setActiveTab("tools")}>
                  <span>⌘</span> Tools <span className="tab-count">{result.tools.length}</span>
                </button>
                <button role="tab" aria-selected={activeTab === "json"} className={activeTab === "json" ? "active" : ""} onClick={() => setActiveTab("json")}>
                  <span>{`{ }`}</span> MCP JSON
                </button>
                <button role="tab" aria-selected={activeTab === "server"} className={activeTab === "server" ? "active" : ""} onClick={() => setActiveTab("server")}>
                  <span>⌘</span> Generated Server
                </button>
              </div>
              <div className="tab-content" role="tabpanel">
                {activeTab === "tools" && <ToolList tools={result.tools} />}
                {activeTab === "json" && <JsonViewer value={mcpJson} />}
                {activeTab === "server" && (
                  <div className="server-preview">
                    <div className="server-preview-copy">
                      <span className="eyebrow">READY-TO-RUN PROJECT</span>
                      <h3>Your MCP server, generated.</h3>
                      <p>A lightweight Node.js and TypeScript server using the official MCP SDK. API credentials are read from environment variables, never embedded in the generated code.</p>
                      <div className="server-files">
                        <span>📦 package.json</span><span>⚙️ tsconfig.json</span><span>🔐 .env.example</span><span>⌘ src/index.ts</span><span>📄 README.md</span>
                      </div>
                      <button className="button button-download" onClick={downloadServer} disabled={downloading}>
                        <span aria-hidden="true">↓</span> {downloading ? "Preparing ZIP…" : "Download MCP Server"}
                      </button>
                    </div>
                    <pre className="server-code"><code>{serverSource}</code></pre>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <footer className="footer">
          <span>Built for developers who make APIs work harder.</span>
          <a href="https://himat.co.in" target="_blank" rel="noreferrer">Himat Technologies <span aria-hidden="true">↗</span></a>
        </footer>
      </main>
    </div>
  );
}
