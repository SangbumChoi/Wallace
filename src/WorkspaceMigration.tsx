import { useEffect, useState } from "react";
import { FileUp, Link2, X } from "lucide-react";
import type { MigrationPreview, MigrationSource } from "./types";

export default function WorkspaceMigration({
  workspaceName,
  previewFile,
  previewNotionLink,
  notionConnected,
  disconnectNotion,
  shared,
  onImport,
  onClose,
}: {
  workspaceName: string;
  previewFile: (source: MigrationSource) => Promise<MigrationPreview | null>;
  previewNotionLink?: (
    url: string,
    connection?: { token: string },
  ) => Promise<MigrationPreview>;
  notionConnected?: () => Promise<boolean>;
  disconnectNotion?: () => Promise<void>;
  shared: boolean;
  onImport: (preview: MigrationPreview, selection: string[]) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<MigrationSource | "notion-link">(
    previewNotionLink ? "notion-link" : "notion",
  );
  const [link, setLink] = useState("");
  const [useConnection, setUseConnection] = useState(false);
  const [hasConnection, setHasConnection] = useState(false);
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fromLink = source === "notion-link";
  const linkReady =
    link.trim() && (!useConnection || hasConnection || token.trim());

  useEffect(() => {
    let active = true;
    void notionConnected?.()
      .then((connected) => {
        if (active && connected) {
          setHasConnection(true);
          setUseConnection(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [notionConnected]);
  const selectedCount =
    preview?.groups.reduce(
      (total, group) => total + (selection.has(group.id) ? group.pages : 0),
      0,
    ) ?? 0;

  async function choose() {
    setError("");
    setBusy(true);
    try {
      const result = fromLink
        ? await previewNotionLink?.(
            link.trim(),
            useConnection ? { token: token.trim() } : undefined,
          )
        : await previewFile(source);
      if (result) {
        if (fromLink && useConnection) {
          setHasConnection(true);
          setToken("");
        }
        setPreview(result);
        setSelection(
          new Set(
            result.groups
              .filter((group) => !group.sensitive)
              .map((group) => group.id),
          ),
        );
      }
    } catch (error) {
      setError(
        (error as Error).message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function clearPreview() {
    setPreview(null);
    setSelection(new Set());
    setError("");
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="modal provider-modal migration-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="migration-title"
      >
        <div className="modal-header">
          <span className="brand-mark">
            <FileUp size={20} />
          </span>
          <button
            type="button"
            disabled={busy}
            aria-label="Close import"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="migration-title">Import from Notion or Slack</h2>
        <p className="workspace-surface-name">Import into · {workspaceName}</p>
        <form
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            if (busy) return;
            if (!preview) {
              if (fromLink && linkReady) void choose();
              return;
            }
            if (!selection.size) return;
            try {
              onImport(preview, [...selection]);
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        >
          <label>
            Import method
            <select
              value={source}
              disabled={busy}
              onChange={(event) => {
                setSource(
                  event.target.value as MigrationSource | "notion-link",
                );
                clearPreview();
              }}
            >
              {previewNotionLink && (
                <option value="notion-link">Notion link</option>
              )}
              <option value="notion">Notion ZIP</option>
              <option value="slack">Slack ZIP</option>
            </select>
          </label>
          {fromLink ? (
            <>
              <label>
                {useConnection ? "Notion page link" : "Public Notion link"}
                <input
                  type="url"
                  value={link}
                  placeholder="https://team.notion.site/page"
                  aria-describedby="notion-link-hint"
                  disabled={busy}
                  maxLength={2048}
                  onChange={(event) => {
                    setLink(event.target.value);
                    clearPreview();
                  }}
                />
              </label>
              <p className="migration-hint" id="notion-link-hint">
                {useConnection
                  ? "Choose Copy link from the Notion page menu and paste it here."
                  : "Paste a Notion page link published to the web."}
              </p>
              {notionConnected && disconnectNotion && (
                <div className="notion-connection">
                  <label className="migration-group">
                    <input
                      type="checkbox"
                      checked={useConnection}
                      disabled={busy}
                      onChange={(event) => {
                        setUseConnection(event.target.checked);
                        setToken("");
                        clearPreview();
                      }}
                    />
                    <span>Use a Notion connection for private pages</span>
                  </label>
                  {useConnection &&
                    (hasConnection ? (
                      <div className="notion-connection-status">
                        <span>Saved Notion connection</span>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await disconnectNotion();
                              setHasConnection(false);
                              clearPreview();
                            } catch {
                              setError(
                                "Could not delete the saved Notion connection.",
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <>
                        <label>
                          Notion connection token
                          <input
                            type="password"
                            value={token}
                            aria-describedby="notion-token-hint"
                            maxLength={4096}
                            autoComplete="off"
                            disabled={busy}
                            onChange={(event) => {
                              setToken(event.target.value);
                              clearPreview();
                            }}
                          />
                        </label>
                        <p className="migration-hint" id="notion-token-hint">
                          Grant the Notion connection read access and add it to
                          the page. The token is saved on this device after a
                          successful preview.
                        </p>
                      </>
                    ))}
                </div>
              )}
              {!preview && (
                <button
                  type="submit"
                  className="secondary migration-action"
                  disabled={busy || !linkReady}
                >
                  <Link2 size={16} aria-hidden="true" />
                  {busy ? "Reading Notion pages…" : "Preview"}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="migration-hint">
                {source === "notion"
                  ? "Choose a ZIP exported as Markdown and CSV or HTML to import page content and tables."
                  : "Choose a JSON export ZIP to import authors, timestamps, threads, and file links."}
              </p>
              <button
                type="button"
                className="secondary migration-action"
                disabled={busy}
                onClick={() => void choose()}
              >
                <FileUp size={16} aria-hidden="true" />
                {busy
                  ? "Reading ZIP…"
                  : preview
                    ? "Choose another ZIP"
                    : "Choose ZIP file"}
              </button>
            </>
          )}
          {preview && (
            <div className="migration-preview">
              <strong>{preview.filename}</strong>
              <p>
                {preview.workspace.pages.length.toLocaleString("en-US")}{" "}
                {preview.workspace.pages.length === 1 ? "note" : "notes"}
                {preview.messages > 0 &&
                  ` · ${preview.messages.toLocaleString("en-US")} ${preview.messages === 1 ? "message" : "messages"}`}
                {preview.workspace.edges.length > 0 &&
                  ` · ${preview.workspace.edges.length.toLocaleString("en-US")} ${preview.workspace.edges.length === 1 ? "connection" : "connections"}`}
              </p>
              <fieldset>
                <legend>Items to import</legend>
                {preview.groups.map((group) => (
                  <label key={group.id} className="migration-group">
                    <input
                      type="checkbox"
                      checked={selection.has(group.id)}
                      disabled={busy}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelection((previous) => {
                          const next = new Set(previous);
                          if (checked) next.add(group.id);
                          else next.delete(group.id);
                          return next;
                        });
                      }}
                    />
                    <span>
                      {group.title}
                      {group.sensitive && (
                        <small>Private or visibility unknown</small>
                      )}
                    </span>
                    <small>{group.pages}</small>
                  </label>
                ))}
              </fieldset>
              {preview.attachments > 0 && (
                <p>Skipped attachments: {preview.attachments}.</p>
              )}
              {preview.warnings?.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              {shared && (
                <p className="migration-sharing">
                  Imported notes will sync to the connected shared workspace.
                </p>
              )}
              <div className="migration-submit">
                <button
                  type="submit"
                  className="primary"
                  disabled={busy || !selectedCount}
                >
                  {selectedCount
                    ? `Add ${selectedCount.toLocaleString("en-US")} ${selectedCount === 1 ? "note" : "notes"}`
                    : "Select items to import"}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="migration-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
