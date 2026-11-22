import { useState } from "react";
import { Keyboard, X } from "lucide-react";
import {
  defaultShortcuts,
  primaryKeyLabel,
  shortcutFromEvent,
  shortcutIssue,
  shortcutLabels,
  shortcutText,
  type ConversationAction,
  type Shortcuts,
} from "./shortcuts";

export default function ShortcutSettings({
  shortcuts,
  onSave,
  onClose,
}: {
  shortcuts: Shortcuts;
  onSave: (value: Shortcuts) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(shortcuts);
  const [recording, setRecording] = useState<ConversationAction | null>(null);
  const [error, setError] = useState("");
  const changed =
    draft.rename !== shortcuts.rename ||
    draft.delete !== shortcuts.delete ||
    draft.model !== shortcuts.model;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal compact shortcut-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <div className="modal-header">
          <span className="brand-mark">
            <Keyboard size={20} aria-hidden="true" />
          </span>
          <button
            type="button"
            aria-label="Close keyboard shortcut settings"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <p id="shortcuts-hint">
          Change AI model works throughout the workspace. Conversation actions
          work when a conversation is open. Select a shortcut to change it.
        </p>
        <div className="shortcut-rows">
          {(Object.keys(shortcutLabels) as ConversationAction[]).map(
            (action) => (
              <div className="shortcut-row" key={action}>
                <span>{shortcutLabels[action]}</span>
                <button
                  type="button"
                  className="secondary shortcut-key"
                  aria-label={shortcutLabels[action] + " shortcut"}
                  aria-describedby="shortcuts-hint"
                  aria-pressed={recording === action}
                  onClick={() => {
                    setRecording(recording === action ? null : action);
                    setError("");
                  }}
                  onBlur={() => {
                    if (recording === action) setRecording(null);
                  }}
                  onKeyDown={(event) => {
                    if (recording !== action || event.key === "Tab") return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      setRecording(null);
                      setError("");
                      return;
                    }
                    if (
                      ["Control", "Meta", "Shift", "Alt"].includes(event.key) ||
                      event.repeat ||
                      event.nativeEvent.isComposing
                    )
                      return;
                    const value = shortcutFromEvent(event.nativeEvent);
                    const issue = value
                      ? shortcutIssue(value, draft, action)
                      : `Press ${primaryKeyLabel} and a letter. You can also hold Shift.`;
                    if (!value || issue) {
                      setError(issue || "");
                      return;
                    }
                    setDraft({ ...draft, [action]: value });
                    setRecording(null);
                    setError("");
                  }}
                >
                  {recording === action ? (
                    "Press a shortcut"
                  ) : (
                    <kbd>{shortcutText(draft[action])}</kbd>
                  )}
                </button>
              </div>
            ),
          )}
        </div>
        {error && (
          <p className="shortcut-error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions shortcut-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setDraft(defaultShortcuts);
              setRecording(null);
              setError("");
            }}
          >
            Restore defaults
          </button>
          <button
            type="button"
            className="primary"
            disabled={!changed || recording !== null}
            onClick={() => onSave(draft)}
          >
            Save
          </button>
        </div>
      </section>
    </div>
  );
}
