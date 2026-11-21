import { Cloud, X } from "lucide-react";
import type useWorkspaceCloud from "./useWorkspaceCloud";

export default function CloudSettings({
  workspaceName,
  cloud,
  onClose,
  onBackup,
}: {
  workspaceName: string;
  cloud: ReturnType<typeof useWorkspaceCloud>;
  onClose: () => void;
  onBackup: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal provider-modal cloud-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-title"
      >
        <div className="modal-header">
          <span className="brand-mark">
            <Cloud size={20} />
          </span>
          <button
            aria-label="Close shared workspace settings"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="cloud-title">Shared workspace</h2>
        <p className="workspace-surface-name">{workspaceName}</p>
        {!cloud.link?.revision && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              cloud.connect(
                String(fields.get("url") ?? ""),
                String(fields.get("key") ?? "").trim(),
              );
            }}
          >
            <label>
              Server URL
              <input
                name="url"
                type="url"
                required
                defaultValue={cloud.link?.url}
                placeholder="https://workspace.example.com"
                autoCapitalize="none"
              />
            </label>
            <label>
              Access key
              <input
                name="key"
                type="password"
                required
                minLength={32}
                maxLength={128}
                autoComplete="off"
              />
            </label>
            <button className="primary" disabled={cloud.busy}>
              Check server
            </button>
          </form>
        )}
        {cloud.link && (
          <div className="cloud-details">
            {cloud.link.revision > 0 ? (
              <>
                <strong>Automatic sync is on</strong>
                <p>{cloud.link.url}</p>
                {cloud.savedAt && (
                  <p>
                    Saved on server ·{" "}
                    {new Date(cloud.savedAt).toLocaleString("en-US")}
                  </p>
                )}
              </>
            ) : (
              <p>
                Open an existing shared workspace or upload this workspace to an
                empty server.
              </p>
            )}
            {cloud.conflicts.length > 0 && (
              <ul>
                {cloud.conflicts.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            <div className="cloud-actions">
              {cloud.link.revision > 0 ? (
                <button
                  className="primary"
                  disabled={cloud.busy}
                  onClick={cloud.sync}
                >
                  Sync now
                </button>
              ) : (
                cloud.availability === "empty" && (
                  <button
                    className="secondary"
                    disabled={cloud.busy}
                    onClick={cloud.publish}
                  >
                    Upload this workspace
                  </button>
                )
              )}
              {((!cloud.link.revision && cloud.availability === "existing") ||
                cloud.conflicts.length > 0) && (
                <button
                  className="secondary"
                  disabled={cloud.busy}
                  onClick={cloud.openRemote}
                >
                  Open from server
                </button>
              )}
              {cloud.conflicts.length > 0 && (
                <>
                  <button className="secondary" onClick={onBackup}>
                    Export this device’s version
                  </button>
                  <button
                    className="secondary"
                    disabled={cloud.busy}
                    onClick={cloud.exportRemote}
                  >
                    Export server version
                  </button>
                </>
              )}
              <button
                className="secondary"
                disabled={cloud.busy}
                onClick={cloud.disconnect}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
        {(cloud.busy || cloud.status) && (
          <p role="status" className="provider-hint">
            {cloud.busy ? "Checking the shared server…" : cloud.status}
          </p>
        )}
      </section>
    </div>
  );
}
