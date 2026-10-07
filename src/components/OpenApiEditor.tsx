import { useRef } from "react";

type OpenApiEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onLoadExample: () => void;
  onError: (message: string) => void;
};

export default function OpenApiEditor({ value, onChange, onLoadExample, onError }: OpenApiEditorProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      onChange(await file.text());
    } catch (error) {
      onError(error instanceof Error ? `Could not read the selected file: ${error.message}` : "Could not read the selected file.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section className="panel editor-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">01 / INPUT</span>
          <h2>OpenAPI specification</h2>
          <p>Paste an OpenAPI 3.x JSON document or choose a local file.</p>
        </div>
        <span className="format-badge">JSON · OpenAPI 3.x</span>
      </div>
      <textarea
        className="code-editor"
        aria-label="OpenAPI JSON"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={'{\n  "openapi": "3.0.3",\n  "info": { "title": "My API", "version": "1.0.0" },\n  "paths": {}\n}'}
      />
      <div className="editor-actions">
        <button className="button button-quiet" onClick={onLoadExample} type="button">
          <span aria-hidden="true">✦</span> Load Example
        </button>
        <button className="button button-quiet" onClick={() => fileInput.current?.click()} type="button">
          <span aria-hidden="true">↑</span> Upload JSON
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={handleFile} />
        <span className="editor-hint">Your document stays in this browser</span>
      </div>
    </section>
  );
}
