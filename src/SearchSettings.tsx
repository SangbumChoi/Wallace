import { useEffect, useState } from "react";
import { Check, Database, Search } from "lucide-react";
import { bridge } from "./bridge";
import ThinkingLoader from "./ThinkingLoader";
import type {
  IndexStatus,
  RetrievalDraft,
  SearchResults,
  Workspace,
} from "./types";

export default function SearchSettings({
  workspace,
  workspaceId,
  onOpen,
}: {
  workspace: Workspace;
  workspaceId: string;
  onOpen: (id: string) => void;
}) {
  const [draft, setDraft] = useState<RetrievalDraft>();
  const [models, setModels] = useState<string[]>([]);
  const [saved, setSaved] = useState<RetrievalDraft>();
  const [status, setStatus] = useState<IndexStatus>();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>();
  const [clearConfirm, setClearConfirm] = useState(false);
  const api = bridge.retrieval;
  useEffect(() => {
    let active = true;
    if (!api) return;
    Promise.all([api.settings(), api.status(workspaceId, workspace)])
      .then(([settings, index]) => {
        if (active) {
          setDraft(settings);
          setSaved(settings);
          setStatus(index);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);
  useEffect(() => {
    if (!api || (busy !== "Updating index…" && !status?.progress)) return;
    let active = true;
    const timer = setInterval(() => {
      api
        .status(workspaceId, workspace)
        .then((next) => {
          if (active) setStatus(next);
        })
        .catch(() => {});
    }, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [busy, !!status?.progress, workspaceId, workspace]);
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (!api)
    return (
      <p>
        Search indexing is available in the desktop app. Basic text retrieval
        remains available on other devices.
      </p>
    );
  if (!draft || !saved)
    return error ? (
      <p role="alert">{error}</p>
    ) : (
      <ThinkingLoader label="Loading search settings…" />
    );
  const changed =
    draft.mode !== saved.mode ||
    draft.baseUrl !== saved.baseUrl ||
    draft.model !== saved.model ||
    !!draft.apiKey ||
    !!draft.clearKey;
  const usesSavedKey =
    saved.hasKey && draft.baseUrl === saved.baseUrl && !draft.clearKey;
  const update = (values: Partial<RetrievalDraft>) => {
    setDraft({ ...draft, ...values });
    setMessage("");
    setResults(undefined);
  };
  return (
    <section className="search-settings" aria-label="Search and indexing">
      <p>
        Find exact words, or retrieve related ideas with an embedding model.
      </p>
      <fieldset disabled={!!busy || !!status?.progress}>
        <div className="search-mode-options">
          <button
            type="button"
            aria-pressed={draft.mode === "keyword"}
            onClick={() => update({ mode: "keyword" })}
          >
            <Search size={17} />
            <span>
              <strong>Keyword</strong>
              <small>Local word and phrase search · No model required</small>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={draft.mode === "hybrid"}
            onClick={() => update({ mode: "hybrid" })}
          >
            <Database size={17} />
            <span>
              <strong>Hybrid</strong>
              <small>Keyword matches + semantic embeddings</small>
            </span>
          </button>
        </div>
        <p className="provider-hint">
          Keyword search matches literal text, like grep. It does not run shell
          commands or regular expressions.
        </p>
        {draft.mode === "hybrid" && (
          <>
            <label>
              Embedding server URL
              <input
                type="url"
                value={draft.baseUrl}
                onChange={(event) =>
                  update({
                    baseUrl: event.target.value,
                    apiKey: "",
                    clearKey: false,
                  })
                }
              />
            </label>
            <label>
              Embedding model
              <input
                list="embedding-models"
                value={draft.model}
                maxLength={200}
                placeholder="Enter an installed or hosted embedding model"
                onChange={(event) => update({ model: event.target.value })}
              />
            </label>
            <datalist id="embedding-models">
              {models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void run("Loading embedding models…", async () => {
                  setModels(await api.models(draft));
                  setMessage(
                    "Server models loaded. Choose an embedding model and test it.",
                  );
                })
              }
            >
              Load server models
            </button>
            <p className="provider-hint">
              Use an OpenAI-compatible /embeddings endpoint, including local
              Ollama. Chat models and embedding models are configured
              separately.
            </p>
            {usesSavedKey && (
              <div className="credential-state">
                <Check size={15} />
                <span>Embedding key saved on this device</span>
              </div>
            )}
            <label>
              API key{" "}
              <small>
                {usesSavedKey
                  ? "Leave blank to keep the saved key"
                  : "Optional for local servers"}
              </small>
              <input
                type="password"
                autoComplete="off"
                maxLength={4096}
                value={draft.apiKey ?? ""}
                onChange={(event) =>
                  update({ apiKey: event.target.value, clearKey: false })
                }
              />
            </label>
            {usesSavedKey && (
              <button
                type="button"
                className="secondary"
                onClick={() => update({ clearKey: true, apiKey: "" })}
              >
                Remove saved key on save
              </button>
            )}
            {draft.clearKey && (
              <p className="provider-hint">
                The saved key will be removed when you save these settings.
              </p>
            )}
            <p className="provider-hint">
              Building a hybrid index sends note titles and text to this server.
              Semantic searches send the search query. Local servers keep
              processing on your device; hosted services may charge for usage.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={!draft.model.trim()}
              onClick={() =>
                void run("Testing embeddings…", async () => {
                  const test = await api.test(draft);
                  setMessage(
                    "Embedding model responded · " +
                      test.dimensions +
                      " dimensions.",
                  );
                })
              }
            >
              Test embedding model
            </button>
          </>
        )}
        <button
          type="button"
          className="primary"
          disabled={!changed}
          onClick={() =>
            void run("Saving search settings…", async () => {
              const next = await api.save(draft);
              setDraft(next);
              setSaved(next);
              setStatus(await api.status(workspaceId, workspace));
              setMessage("Search settings saved.");
            })
          }
        >
          Save search settings
        </button>
        <section className="index-overview">
          <strong>Workspace index</strong>
          <div className="index-counts">
            <span>
              <b>{status?.indexed ?? 0}</b> / {status?.passages ?? 0} passages
              indexed
            </span>
            <span>
              <b>{status?.vectors ?? 0}</b> current embeddings
            </span>
          </div>
          <small>
            {status?.updatedAt
              ? "Last updated " +
                new Date(status.updatedAt).toLocaleString("en-US")
              : "Not built yet"}
          </small>
          <p className="provider-hint">
            Changes appear in keyword search immediately. Update the index to
            embed new or edited notes. Deleted notes are excluded from search
            immediately.
          </p>
          <p className="provider-hint">
            AI replies search notes in the current conversation. The test below
            searches all workspace notes.
          </p>
          <div className="mcp-toolbar">
            <button
              type="button"
              className="secondary"
              disabled={changed}
              onClick={() =>
                void run("Updating index…", async () => {
                  setStatus(await api.build(workspaceId, workspace));
                  setMessage(
                    "Index updated. Unchanged embeddings were reused.",
                  );
                })
              }
            >
              Update index
            </button>
            <button
              type="button"
              disabled={!status?.updatedAt}
              onClick={() => setClearConfirm(true)}
            >
              Clear index
            </button>
          </div>
          {changed && (
            <small>Save your settings before updating the index.</small>
          )}
          {clearConfirm && (
            <div className="credential-state">
              <span>Clear the search index? Your notes will remain.</span>
              <button
                type="button"
                onClick={() =>
                  void run("Clearing index…", async () => {
                    await api.clear(workspaceId);
                    setStatus(await api.status(workspaceId, workspace));
                    setClearConfirm(false);
                    setResults(undefined);
                  })
                }
              >
                Clear
              </button>
              <button type="button" onClick={() => setClearConfirm(false)}>
                Cancel
              </button>
            </div>
          )}
        </section>
        <form
          className="index-search"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim())
              void run("Searching notes…", async () =>
                setResults(
                  await api.search(workspaceId, workspace, query, saved.mode),
                ),
              );
          }}
        >
          <label>
            Test workspace search
            <input
              value={query}
              maxLength={1000}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Enter words, a phrase, or a question"
            />
          </label>
          <button
            type="submit"
            className="secondary"
            disabled={!query.trim() || changed}
          >
            Search notes
          </button>
        </form>
      </fieldset>
      {busy && <ThinkingLoader label={busy} />}
      {status?.progress && (
        <p role="status">
          Indexing {status.progress.completed} / {status.progress.total}{" "}
          passages
        </p>
      )}
      {message && (
        <p role="status" className="provider-feedback">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="provider-feedback provider-error">
          {error}
        </p>
      )}
      {results && (
        <div className="index-results">
          <small>
            {results.mode === "hybrid" ? "Hybrid results" : "Keyword results"}
          </small>
          {results.warning && <p role="status">{results.warning}</p>}
          {!results.results.length && <p>No matching notes.</p>}
          {results.results.map((item) => (
            <button type="button" key={item.id} onClick={() => onOpen(item.id)}>
              <strong>{item.title || "Untitled note"}</strong>
              <span>{item.text.slice(0, 240)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
