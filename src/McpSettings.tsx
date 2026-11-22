import { useEffect, useState } from "react";
import { Plug, Plus, Trash2, RefreshCw } from "lucide-react";
import { bridge } from "./bridge";
import ThinkingLoader from "./ThinkingLoader";
import type { McpConnection, McpTool } from "./types";

const servicePresets = [
  {
    name: "Google Drive",
    url: "https://drivemcp.googleapis.com/mcp/v1",
    guide:
      "https://developers.google.com/workspace/guides/configure-mcp-servers",
    hint: "Google Workspace Developer Preview. Requires an authorized OAuth access token.",
  },
  {
    name: "Google Calendar",
    url: "https://calendarmcp.googleapis.com/mcp/v1",
    guide:
      "https://developers.google.com/workspace/guides/configure-mcp-servers",
    hint: "Google Workspace Developer Preview. Requires an authorized OAuth access token.",
  },
  {
    name: "Slack",
    url: "https://mcp.slack.com/mcp",
    guide: "https://docs.slack.dev/ai/slack-mcp-server/connect-to-harnesses/",
    hint: "Requires a Slack OAuth app, an authorized user token, and any workspace approval.",
  },
  {
    name: "Notion",
    url: "https://mcp.notion.com/mcp",
    guide: "https://developers.notion.com/guides/mcp/overview",
    hint: "Requires OAuth authorization for Notion MCP.",
  },
];
export default function McpSettings({
  onUse,
}: {
  onUse: (text: string) => void;
}) {
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [toolsLoaded, setToolsLoaded] = useState(false);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [toolName, setToolName] = useState("");
  const [rawInputs, setRawInputs] = useState(false);
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<{ text: string; isError: boolean }>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const connection = connections.find((item) => item.id === selected);
  const preset = servicePresets.find((item) => item.url === url);
  const tool = tools.find((item) => item.name === toolName);
  const fields = Object.entries(tool?.inputSchema.properties ?? {});
  const simpleInputs = fields.every(([, schema]) =>
    ["string", "number", "integer", "boolean"].includes(schema.type ?? ""),
  );
  function setField(key: string, value: unknown) {
    setArgs((current) => {
      let values: Record<string, unknown> = {};
      try {
        values = JSON.parse(current);
      } catch {}
      if (!values || typeof values !== "object" || Array.isArray(values))
        values = {};
      if (value === undefined) delete values[key];
      else values[key] = value;
      return JSON.stringify(values, null, 2);
    });
  }
  function fieldValue(key: string) {
    try {
      return JSON.parse(args)?.[key] ?? "";
    } catch {
      return "";
    }
  }

  useEffect(() => {
    let active = true;
    bridge.mcp
      ?.list()
      .then((items) => {
        if (active) setConnections(items);
      })
      .catch(() => {
        if (active) setError("Could not load MCP connections.");
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy("");
    }
  }
  function choose(id: string) {
    setSelected(id);
    setTools([]);
    setToolsLoaded(false);
    setToolName("");
    setResult(undefined);
    setEditing(false);
    setError("");
    setConfirmRemove(false);
    setToken("");
  }
  function edit(item?: McpConnection) {
    choose(item?.id ?? "");
    setName(item?.name ?? "");
    setUrl(item?.url ?? "");
    setToken("");
    setClearToken(false);
    setEditing(true);
  }
  async function loadTools(id: string) {
    const available = await bridge.mcp!.tools(id);
    setTools(available);
    setToolsLoaded(true);
    setToolName(available[0]?.name ?? "");
    setArgs("{}");
    setResult(undefined);
  }
  if (!bridge.mcp)
    return (
      <p className="provider-hint">
        MCP connections are available in the desktop app.
      </p>
    );
  return (
    <section className="mcp-settings" aria-label="MCP connections">
      <p>
        Connect tools and data sources. Run a tool, review its result, then add
        it to your AI conversation.
      </p>
      <small>
        Supports Streamable HTTP servers with an optional access token. OAuth
        sign-in and local command servers are not supported yet.
      </small>
      <fieldset disabled={!!busy}>
        <div className="mcp-presets" aria-label="Popular services">
          {servicePresets.map((item) => (
            <button
              key={item.url}
              type="button"
              className="secondary"
              onClick={() => {
                const existing = connections.find((c) => c.url === item.url);
                if (existing) choose(existing.id);
                else {
                  edit();
                  setName(item.name);
                  setUrl(item.url);
                }
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="mcp-connection-list">
          {connections.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={selected === item.id}
              onClick={() => choose(item.id)}
            >
              <Plug size={16} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {new URL(item.url).host} ·{" "}
                  {item.hasToken ? "Token saved" : "No token"}
                </small>
              </span>
            </button>
          ))}
          <button type="button" className="secondary" onClick={() => edit()}>
            <Plus size={15} /> Add connection
          </button>
        </div>
        {editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run("Saving connection…", async () => {
                const item = await bridge.mcp!.save({
                  id: selected || undefined,
                  name,
                  url,
                  token,
                  clearToken,
                });
                setToken("");
                setConnections(await bridge.mcp!.list());
                setSelected(item.id);
                setEditing(false);
                await loadTools(item.id);
              });
            }}
          >
            {preset && (
              <p className="provider-hint">
                {preset.hint}{" "}
                <button
                  type="button"
                  onClick={() => {
                    if (bridge.openMigrationLink)
                      void bridge
                        .openMigrationLink(preset.guide)
                        .catch(() =>
                          setError("Could not open the setup guide."),
                        );
                    else
                      window.open(
                        preset.guide,
                        "_blank",
                        "noopener,noreferrer",
                      );
                  }}
                >
                  Setup guide
                </button>
              </p>
            )}
            <label>
              Connection name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My tools"
              />
            </label>
            <label>
              Server URL
              <input
                required
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://your-server.example/mcp"
              />
            </label>
            <label>
              Access token{" "}
              <small>
                {connection?.hasToken
                  ? "Saved · leave blank to keep"
                  : "Optional"}
              </small>
              <input
                type="password"
                autoComplete="off"
                maxLength={4096}
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  setClearToken(false);
                }}
              />
            </label>
            {connection?.hasToken && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={clearToken}
                  onChange={(event) => setClearToken(event.target.checked)}
                />
                Remove saved token
              </label>
            )}
            <p className="provider-hint">
              Tokens are encrypted on this device and are not included in
              workspace exports.
            </p>
            <div className="provider-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditing(false);
                  setToken("");
                }}
              >
                Cancel
              </button>
              <button className="primary" type="submit">
                Save and connect
              </button>
            </div>
          </form>
        ) : (
          connection && (
            <>
              <div className="mcp-toolbar">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void run("Connecting to server…", () =>
                      loadTools(connection.id),
                    )
                  }
                >
                  <RefreshCw size={14} /> Connect and load tools
                </button>
                <button type="button" onClick={() => edit(connection)}>
                  Edit connection
                </button>
                <button
                  type="button"
                  aria-label="Remove MCP connection"
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {confirmRemove && (
                <div className="credential-state">
                  <span>Remove this connection and its saved token?</span>
                  <button
                    type="button"
                    onClick={() =>
                      void run("Removing connection…", async () => {
                        await bridge.mcp!.remove(connection.id);
                        setConnections(await bridge.mcp!.list());
                        choose("");
                      })
                    }
                  >
                    Remove
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(false)}>
                    Cancel
                  </button>
                </div>
              )}
              {toolsLoaded && !tools.length && (
                <p role="status" className="provider-hint">
                  Connected. This server has no tools available.
                </p>
              )}
              {!!tools.length && (
                <>
                  <label>
                    Tool <small>{tools.length} available</small>
                    <select
                      value={toolName}
                      onChange={(event) => {
                        setToolName(event.target.value);
                        setArgs("{}");
                        setResult(undefined);
                      }}
                    >
                      {tools.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="provider-hint">{tool?.description}</p>
                  {simpleInputs && !rawInputs ? (
                    fields.map(([key, schema]) => (
                      <label key={key}>
                        {key}
                        {tool?.inputSchema.required?.includes(key) ? " *" : ""}
                        <small>{schema.description}</small>
                        {schema.type === "boolean" ? (
                          <select
                            value={String(fieldValue(key))}
                            onChange={(event) =>
                              setField(
                                key,
                                event.target.value === ""
                                  ? undefined
                                  : event.target.value === "true",
                              )
                            }
                          >
                            <option value="">Not set</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ) : (
                          <input
                            type={schema.type === "string" ? "text" : "number"}
                            value={String(fieldValue(key))}
                            onChange={(event) =>
                              setField(
                                key,
                                event.target.value === ""
                                  ? undefined
                                  : schema.type === "string"
                                    ? event.target.value
                                    : Number(event.target.value),
                              )
                            }
                          />
                        )}
                      </label>
                    ))
                  ) : (
                    <label>
                      Tool inputs (JSON)
                      <textarea
                        rows={4}
                        value={args}
                        onChange={(event) => setArgs(event.target.value)}
                        spellCheck={false}
                      />
                    </label>
                  )}
                  {simpleInputs && (
                    <button
                      type="button"
                      className="advanced-toggle"
                      onClick={() => setRawInputs(!rawInputs)}
                    >
                      {rawInputs ? "Use input fields" : "Edit as JSON"}
                    </button>
                  )}
                  {(rawInputs || !simpleInputs) &&
                    tool?.inputSchema.properties && (
                      <small>
                        Fields:{" "}
                        {Object.entries(tool.inputSchema.properties)
                          .map(
                            ([key, value]) =>
                              key +
                              " (" +
                              (value.type ?? "value") +
                              (tool.inputSchema.required?.includes(key)
                                ? ", required"
                                : "") +
                              ")",
                          )
                          .join(", ") || "None"}
                      </small>
                    )}
                  <p className="provider-hint">
                    Running this tool sends these inputs to{" "}
                    {new URL(connection.url).host}. Tools may change data in the
                    connected service.
                  </p>
                  <button
                    type="button"
                    className="primary"
                    onClick={() =>
                      void run("Running tool…", async () => {
                        const parsed = JSON.parse(args);
                        if (
                          !parsed ||
                          typeof parsed !== "object" ||
                          Array.isArray(parsed)
                        )
                          throw Error("Tool inputs must be a JSON object.");
                        setResult(undefined);
                        setResult(
                          await bridge.mcp!.call(
                            connection.id,
                            toolName,
                            parsed,
                          ),
                        );
                      })
                    }
                  >
                    Run tool
                  </button>
                </>
              )}
              {result && (
                <section className="mcp-result">
                  <strong>
                    {result.isError ? "Tool returned an error" : "Tool result"}
                  </strong>
                  <pre>{result.text}</pre>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      onUse(
                        "MCP context from " +
                          connection.name +
                          " / " +
                          toolName +
                          ":\n" +
                          result.text.slice(0, 10000),
                      )
                    }
                  >
                    Use in conversation
                  </button>
                  <small>
                    Added to your draft. Review it before sending to AI.
                  </small>
                </section>
              )}
            </>
          )
        )}
      </fieldset>
      {busy && <ThinkingLoader label={busy} />}
      {error && (
        <p role="alert" className="provider-feedback provider-error">
          {error}
        </p>
      )}
    </section>
  );
}
