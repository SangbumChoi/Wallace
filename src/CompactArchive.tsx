import { useState } from "react";
import { bridge } from "./bridge";
import type { Conversation, Page, Settings } from "./types";

export function CompactModelSettings({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
}) {
  const [model, setModel] = useState(settings.compactModel ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="search-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () =>
          onSave(
            await bridge.configure({ ...settings, compactModel: model.trim() }),
          ),
        );
      }}
    >
      <fieldset disabled={busy}>
        <legend>Conversation compaction</legend>
        <p>
          Archive summaries use your chat connection at{" "}
          {new URL(settings.baseUrl).host}.
        </p>
        <label>
          Compaction model
          <input
            list="compact-models"
            maxLength={200}
            placeholder={"Use chat model · " + settings.model}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        <datalist id="compact-models">
          {models.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            void run(async () => setModels(await bridge.models(settings)))
          }
        >
          Load models
        </button>
        <button type="submit" className="primary">
          Save compaction model
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export default function CompactArchive({
  conversation,
  archive,
  pages,
  initial,
  selected,
  onSave,
  onClose,
}: {
  conversation: Conversation;
  archive: boolean;
  pages: Page[];
  initial: string;
  selected: string;
  onSave: (text: string, ids: string[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial.slice(0, 100000));
  const [targets, setTargets] = useState<string[]>(() =>
    conversation.compactPageId ? [] : [selected].filter(Boolean),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  async function compact() {
    setBusy(true);
    setError("");
    try {
      const scope = pages.filter((p) => conversation.nodeIds.includes(p.id));
      const result = await bridge.ask({
        purpose: "compact",
        question: "Compact this conversation into reusable knowledge.",
        workspace: {
          version: 1,
          pages: scope,
          edges: [],
          conversations: [conversation],
        },
      });
      setText(result.answer);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSave(text.trim(), targets);
      }}
    >
      <p>
        Keep one compact note linked to the original chat. Apply it to nodes
        that should use it as context.
      </p>
      <label>
        Compact knowledge
        <textarea
          required
          rows={6}
          maxLength={100000}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => void compact()}
      >
        {busy ? "Compacting…" : "Generate compact draft"}
      </button>
      {error && <p role="alert">{error}</p>}
      <label>
        Apply to nodes
        <input
          type="search"
          placeholder="Find a node"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="compact-targets">
        {pages
          .filter(
            (p) =>
              p.id !== conversation.compactPageId &&
              p.title.toLowerCase().includes(query.trim().toLowerCase()),
          )
          .map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={targets.includes(p.id)}
                onChange={(e) =>
                  setTargets(
                    e.target.checked
                      ? [...targets, p.id]
                      : targets.filter((id) => id !== p.id),
                  )
                }
              />
              {p.title || "Untitled node"}
            </label>
          ))}
      </div>
      <div className="confirm-actions">
        <button type="button" className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" disabled={busy || !text.trim()}>
          {archive
            ? "Archive conversation"
            : conversation.compactPageId
              ? "Save changes"
              : "Save knowledge note"}
        </button>
      </div>
    </form>
  );
}
