# OpenAPI → MCP Converter

> Convert OpenAPI specifications into MCP tools and generate a ready-to-run MCP server with a simple developer-friendly workflow.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![React](https://img.shields.io/badge/React-18-149eca?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)](https://vite.dev/)

OpenAPI → MCP Converter is a lightweight developer tool for turning existing OpenAPI APIs into MCP-compatible tools—without manually writing every tool definition. Paste or upload an OpenAPI 3.x JSON document, review the generated tools, and create a downloadable Node.js/TypeScript MCP server project.

## 🚀 Features

- OpenAPI 3.x JSON parsing and useful validation errors
- Paste a specification, upload a `.json` file, or load the built-in Pet API
- Automatic endpoint parsing for `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`
- MCP tool generation with operation names, descriptions, response summaries, and input schemas
- Path, query, and header parameters plus JSON request bodies
- MCP JSON preview with one-click copy
- Generated TypeScript MCP server using the official MCP SDK
- ZIP download with `.env.example` and setup instructions
- API key and bearer token support through generated-server environment variables
- Browser-side conversion: no database, application backend, or AI API required

## 🧩 How It Works

```text
OpenAPI JSON → Parse API specification → Detect endpoints
           → Generate MCP tools → Generate server → Download and run locally
```

The conversion logic is in [`src/lib/openapiParser.ts`](src/lib/openapiParser.ts), separate from the React interface. The parser checks for OpenAPI 3.x, walks supported operations, and builds JSON Schema-compatible tool inputs. It also retains response status descriptions for the tool preview. Operations without an `operationId` receive a generated name, for example `GET /users/{id}` becomes `getUser`.

## 🛠️ Tech Stack

- React 18
- TypeScript
- Vite
- JSZip for creating the downloadable project archive
- Generated server: Node.js, TypeScript, the official `@modelcontextprotocol/sdk`, Zod, and dotenv

The converter itself runs in the browser. Node.js is needed to run this development project and the generated MCP server.

## 📦 Installation

Use Node.js 18 or later.

```bash
git clone https://github.com/himat-technology/openapi-to-mcp-converter.git
cd openapi-to-mcp-converter
npm install
npm run dev
```

Open the local URL printed by Vite in your terminal (typically `http://localhost:5173`).

## 🏗️ Build

```bash
npm run build
```

This runs the TypeScript project checks and creates the production build in `dist/`.

## 💡 Usage

1. Start the application with `npm run dev` and open its local URL.
2. Paste an OpenAPI 3.x JSON document, upload a `.json` file, or select **Load Example**.
3. Click **Convert to MCP**.
4. Review generated tools, including their HTTP method, path, description, and inputs.
5. Select **MCP JSON** to inspect tool definitions, then choose **Copy JSON**.
6. Select **Generated Server** to preview the generated TypeScript project.
7. Click **Download MCP Server** to save the ZIP archive.
8. Extract it, copy `.env.example` to `.env`, and configure the API URL and any credentials.
9. From the extracted folder run `npm install`, then `npm run dev`.

The generated server communicates with MCP clients over stdio. Configure your MCP client to launch `npm run dev` from the extracted project directory.

## 🔐 Authentication

The converter does not require or collect credentials. The generated server can read an API key and/or bearer token from environment variables. It uses the OpenAPI server URL by default; set `API_BASE_URL` to override it. For API keys, set `API_KEY_HEADER` if the API expects a non-default header. If the OpenAPI document declares an API-key security scheme, the generated server uses the declared header or query parameter.

```dotenv
API_BASE_URL=https://api.example.com
API_KEY=your-api-key
API_KEY_HEADER=X-API-Key
BEARER_TOKEN=your-token
```

> **Never commit real API keys, bearer tokens, or other secrets to GitHub.** Keep the generated `.env` file private; only `.env.example` is included in the ZIP.

## 📄 Example

Choose **Load Example** to populate the editor with a small Pet API containing `GET /pets`, `GET /pets/{id}`, and `POST /pets`.

For example, this operation:

```json
{
  "openapi": "3.0.3",
  "info": { "title": "Pet API", "version": "1.0.0" },
  "paths": {
    "/pets/{id}": {
      "get": {
        "operationId": "getPet",
        "summary": "Get a pet by ID",
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": { "200": { "description": "Pet details" } }
      }
    }
  }
}
```

produces an MCP tool similar to:

```json
{
  "name": "getPet",
  "description": "Get a pet by ID",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" }
    },
    "required": ["id"]
  }
}
```

The server generator uses that tool schema to validate MCP arguments, substitute path parameters, add query/header parameters, and send JSON request bodies to the API.

## 📁 Project Structure

```text
.
├── .gitattributes
├── .gitignore
├── index.html
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
├── src/
│   ├── components/
│   │   ├── JsonViewer.tsx
│   │   ├── OpenApiEditor.tsx
│   │   └── ToolList.tsx
│   ├── lib/
│   │   ├── mcpGenerator.ts
│   │   ├── openapiParser.ts
│   │   └── serverGenerator.ts
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## 🧪 Testing

Run the production TypeScript/build check:

```bash
npm run build
```

To manually verify conversion, load the built-in Pet API and select **Convert to MCP**. Confirm that three operations appear, inspect the **MCP JSON** tab, preview the generated server, and download the ZIP.

## 🐛 Troubleshooting

| Problem | What to check |
| --- | --- |
| Invalid JSON | Check quotes, commas, braces, and that the top-level value is an object. |
| Unsupported OpenAPI version | This first version accepts OpenAPI 3.x JSON documents. |
| Missing paths | Add a non-empty top-level `paths` object with at least one supported operation. |
| Missing `operationId` | The converter creates a name from the HTTP method and path. |
| Unsupported HTTP method | Only `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` become tools; other methods are reported as skipped. |
| Request body does not appear | The converter currently maps JSON request bodies (`application/json`) to a `body` tool input. |
| API authentication errors | Check the generated `.env`, API URL, key/token, and expected API-key header or query parameter. |
| Generated server cannot reach the API | Check network access, `API_BASE_URL`, and any API CORS or firewall rules affecting the server host. |

## ❓ FAQ

### What is MCP?

The Model Context Protocol (MCP) is a standard way for AI applications to connect to tools and other context sources.

### What does this tool convert?

It converts supported OpenAPI operations into MCP tool definitions and a generated MCP server project.

### Do I need an API key?

Only when the API you want to call requires one. Credentials are optional and configured in the generated server environment.

### Does this tool store my OpenAPI specification?

No. The specification is parsed in your browser and is not sent to an application backend.

### Can I use private APIs?

Yes, if the generated server can reach the API and you configure any required credentials. Review the specification and generated code before running them.

### Can I generate a complete MCP server?

Yes. **Download MCP Server** creates a ZIP with the TypeScript entry point, package manifest, TypeScript configuration, environment example, and run instructions.

### Does this require an AI API?

No. Conversion and server generation do not call an AI/LLM API.

## 🔒 Privacy

OpenAPI JSON parsing and ZIP generation happen locally in the browser; the converter does not upload the specification to an application server. The generated server makes HTTP requests to the API described in your specification when an MCP client invokes its tools. Review generated code and the API destinations before running it. The interface uses system fonts and does not need a network connection to convert a document.

## 🌐 Live Demo

Try the OpenAPI → MCP Converter online:

https://himat.tech/free-tools/openapi-to-mcp-converter

## 📸 Screenshots

Screenshots can be added here when available.

## 🏢 Built by Himat Technologies

**Himat Technologies** — Build systems, not just websites.

- 🌐 **Website:** [himat.co.in](https://himat.co.in)
- 📧 **Email:** [info@himat.co.in](mailto:info@himat.co.in)
- 📞 **Contact:** [+91 94452 34023](tel:+919445234023)

## 🔗 Connect With Himat Technologies

- 🌐 **Website:** [https://himat.co.in](https://himat.co.in)
- 💼 **LinkedIn:** [Himat Technology](https://www.linkedin.com/company/himat-technology)
- 📸 **Instagram:** [@himat_technology](https://www.instagram.com/himat_technology?igsi=djdmcGxweWtwYWI0)
- 📘 **Facebook:** [Himat Technology](https://www.facebook.com/people/Himat-technology/61593829197445/)
- 📧 **Email:** [info@himat.co.in](mailto:info@himat.co.in)
- 📞 **Contact:** [+91 94452 34023](tel:+919445234023)

## ⭐ Support

> If you find this tool useful, consider starring the repository and sharing it with other developers.

## 📜 License

This project is licensed under the [MIT License](./LICENSE).

## 👨‍💻 About

> OpenAPI → MCP Converter is a developer utility by Himat Technologies, built to make API-to-MCP integration simpler, faster, and more accessible.

**Built by Himat Technologies**

- 🌐 [https://himat.co.in](https://himat.co.in)
- 📧 [info@himat.co.in](mailto:info@himat.co.in)
- 📞 [+91 94452 34023](tel:+919445234023)
