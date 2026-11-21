import { useState } from "react";
import { Check, FileText, Sparkles } from "lucide-react";
import type {
  AiTurn,
  ConversationPurpose,
  SessionDraft,
  TurnIntent,
} from "./types";
import IntentionFlow from "./IntentionFlow";
import PendingAiAnswer from "./PendingAiAnswer";
import MarkdownAnswer from "./MarkdownAnswer";
import {
  generatedFiles,
  generatedAttachment,
  downloadAttachment,
} from "./conversationFiles";
import AiReplyHeader from "./AiReplyHeader";

type Props = {
  turns: AiTurn[];
  pending?: string;
  drafting: boolean;
  draft?: SessionDraft;
  purpose?: ConversationPurpose;
  onIntent: (index: number, intent?: TurnIntent) => void;
  onDraft: () => void;
  onEdit: (text: string) => void;
  onApprove: () => void;
  onSource: (id: string) => void;
};

export default function AiConversation({
  turns,
  pending,
  drafting,
  draft,
  purpose,
  onIntent,
  onDraft,
  onEdit,
  onApprove,
  onSource,
}: Props) {
  const [downloadError, setDownloadError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const currentDraft = draft?.turnCount === turns.length;

  return (
    <div className="ai-panel ai-conversation">
      {!turns.length && !pending && !purpose && (
        <div className="ai-welcome">
          <Sparkles size={19} aria-hidden="true" />
          <h2>What would you like to work on?</h2>
          <p>Tell the AI what you want to understand, decide, or solve.</p>
        </div>
      )}
      {!!turns.length && (
        <details className="conversation-flow-disclosure">
          <summary>Conversation flow</summary>
          <IntentionFlow
            purpose={purpose}
            turns={turns}
            pending={pending}
            onIntent={onIntent}
            onOpenTurn={(index) => {
              const element = document.getElementById(`ai-exchange-${index}`);
              element?.focus({ preventScroll: true });
              element?.scrollIntoView({ block: "start" });
            }}
          />
        </details>
      )}
      <ol className="ai-exchanges" aria-label="AI conversation history">
        {turns.map((turn, index) => (
          <li key={index} id={`ai-exchange-${index}`} tabIndex={-1}>
            <article className="shared-question">
              <header>
                <strong>
                  {turn.author || "You"} · {index + 1}
                </strong>
                <time dateTime={turn.time}>
                  {new Date(turn.time).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </header>
              <p>{turn.question}</p>
            </article>
            <article className="shared-answer ai-answer">
              <AiReplyHeader runtime={turn.runtime} />
              <MarkdownAnswer text={turn.answer} />
              {generatedFiles(turn.answer, index).map(
                ({ name, text }, fileIndex) => (
                  <button
                    key={name + fileIndex}
                    type="button"
                    className="generated-download"
                    onClick={() => {
                      setDownloadError("");
                      void generatedAttachment(name, text)
                        .then(({ file }) => downloadAttachment(file))
                        .catch((error) => setDownloadError(error.message));
                    }}
                  >
                    <FileText size={14} /> Download {name}
                  </button>
                ),
              )}
              {!!turn.sources?.length && (
                <details>
                  <summary>Sources</summary>
                  {turn.sources.map((source) => (
                    <button key={source.id} onClick={() => onSource(source.id)}>
                      <FileText size={13} />
                      {source.title}
                    </button>
                  ))}
                </details>
              )}
            </article>
          </li>
        ))}
        {pending && (
          <li>
            <article className="shared-question">
              <strong>You</strong>
              <p>{pending}</p>
            </article>
            <PendingAiAnswer />
          </li>
        )}
      </ol>
      {downloadError && <p role="alert">{downloadError}</p>}
      {!!turns.length && (
        <div className="session-note-actions">
          <button
            className="secondary"
            disabled={!!pending || drafting}
            onClick={() => {
              setReviewed(false);
              onDraft();
            }}
          >
            <FileText size={15} />
            {draft ? "Redraft note" : "Draft session note"}
          </button>
          {drafting && <span role="status">Drafting a session note…</span>}
        </div>
      )}
      {draft && (
        <section className="session-review" aria-label="Review session note">
          <h3>Review session note</h3>
          <p>
            Compare the draft with the conversation. Fix unverified details or
            flag them for review.
          </p>
          {!currentDraft && (
            <p role="status">
              New messages have been added. Create a fresh draft before saving.
            </p>
          )}
          <textarea
            aria-label="Session note draft"
            maxLength={16000}
            value={draft.text}
            onChange={(event) => {
              setReviewed(false);
              onEdit(event.target.value);
            }}
          />
          <label className="session-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
              disabled={!currentDraft || drafting || !!pending}
            />
            I checked the facts and decisions against the conversation.
          </label>
          <button
            className="primary"
            disabled={
              !reviewed ||
              !currentDraft ||
              !draft.text.trim() ||
              drafting ||
              !!pending
            }
            onClick={onApprove}
          >
            <Check size={15} />
            Save reviewed session note
          </button>
        </section>
      )}
    </div>
  );
}
