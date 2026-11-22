import { useId, useRef, useState } from "react";
import {
  ArrowDown,
  CornerUpLeft,
  Flag,
  MessageSquare,
  Route,
} from "lucide-react";
import type { AiTurn, ConversationPurpose, TurnIntent } from "./types";

const intentLabels = {
  clarify: "Clarification",
  constraint: "Constraint",
  direction: "Change of direction",
  evidence: "Evidence check",
  decision: "Decision",
} satisfies Record<TurnIntent["kind"], string>;

function excerpt(text: string) {
  const line = text.trim().replace(/\s+/g, " ");
  return line.length > 120 ? line.slice(0, 119) + "…" : line;
}

export default function IntentionFlow({
  purpose,
  turns,
  pending,
  onIntent,
  onOpenTurn,
}: {
  purpose?: ConversationPurpose;
  turns: AiTurn[];
  pending?: string;
  onIntent: (index: number, value?: TurnIntent) => void;
  onOpenTurn: (index: number) => void;
}) {
  const heading = useId();
  const details = useId();
  const nodes = useRef(new Map<number, HTMLButtonElement>());
  const [selected, setSelected] = useState<number | null>(null);
  const turn = selected === null ? undefined : turns[selected];
  const linked = turn?.intent?.previous;

  function selectNode(index: number) {
    setSelected(index);
    nodes.current.get(index)?.focus({ preventScroll: true });
    nodes.current
      .get(index)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function node(index: number, label: string, body: string, previous?: number) {
    const active = selected === index;
    return (
      <li key={index}>
        <button
          type="button"
          className="intent-node"
          aria-pressed={active}
          data-related={linked === index ? "true" : undefined}
          aria-controls={active ? details : undefined}
          ref={(element) => {
            if (element) nodes.current.set(index, element);
            else nodes.current.delete(index);
          }}
          onClick={() => setSelected(active ? null : index)}
        >
          <span className="intent-node-label">
            {index < 0 ? (
              <Flag size={14} aria-hidden="true" />
            ) : (
              <MessageSquare size={14} aria-hidden="true" />
            )}
            {label}
          </span>
          <strong>{excerpt(body)}</strong>
          {previous !== undefined && (
            <small>
              <CornerUpLeft size={12} aria-hidden="true" /> Follows message{" "}
              {previous + 1}
            </small>
          )}
        </button>
      </li>
    );
  }

  if (!turns.length && !pending) return null;
  return (
    <section className="intent-flow" aria-labelledby={heading}>
      <h3 id={heading}>
        <Route size={16} aria-hidden="true" /> Conversation flow
      </h3>
      <ol className="intent-track" aria-label="Purpose and message order">
        {purpose && node(-1, "Conversation purpose", purpose.statement)}
        {turns.map((item, index) =>
          node(
            index,
            `${index + 1} · ${item.intent ? intentLabels[item.intent.kind] : "Your message"}`,
            item.question,
            item.intent?.previous,
          ),
        )}
        {pending &&
          node(turns.length, `${turns.length + 1} · Awaiting reply`, pending)}
      </ol>
      {selected !== null && (
        <div className="intent-detail" id={details}>
          <p className="intent-detail-message">
            {selected < 0 ? purpose?.statement : (turn?.question ?? pending)}
          </p>
          {turn && (
            <>
              <div className="intent-fields">
                <label>
                  Message intent
                  <select
                    value={turn.intent?.kind ?? ""}
                    onChange={(event) => {
                      const kind = event.target.value as
                        TurnIntent["kind"] | "";
                      onIntent(
                        selected,
                        kind ? { ...turn.intent, kind } : undefined,
                      );
                    }}
                  >
                    <option value="">No intent label</option>
                    {Object.entries(intentLabels).map(([kind, label]) => (
                      <option key={kind} value={kind}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {!!turn.intent && selected > 0 && (
                  <label>
                    Link to an earlier message
                    <select
                      value={linked ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        onIntent(selected, {
                          kind: turn.intent!.kind,
                          previous: value === "" ? undefined : Number(value),
                        });
                      }}
                    >
                      <option value="">No link</option>
                      {turns.slice(0, selected).map((prior, index) => (
                        <option key={index} value={index}>
                          {index + 1} · {excerpt(prior.question)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="intent-detail-actions">
                {linked !== undefined && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => selectNode(linked)}
                  >
                    <CornerUpLeft size={14} /> Message {linked + 1}
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onOpenTurn(selected)}
                >
                  <ArrowDown size={14} /> View message and reply
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
