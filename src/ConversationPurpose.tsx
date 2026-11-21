import { useState } from "react";
import { Check, ChevronDown, FolderOpen, Plus, X } from "lucide-react";
import { purposeLabels, purposeReference } from "./workspace";
import type {
  Conversation,
  ConversationPurpose as Purpose,
  ProjectStep,
} from "./types";

export default function ConversationPurpose({
  conversation,
  onPurpose,
  onComplete,
  onSteps,
  onOpenProject,
  busy,
}: {
  conversation: Conversation;
  onPurpose: (purpose: Purpose) => void;
  onComplete: () => void;
  onSteps: (steps: ProjectStep[]) => void;
  onOpenProject: (id: string) => void;
  busy: boolean;
}) {
  const { purpose, summary, project } = conversation;
  const [nextStep, setNextStep] = useState("");
  if (!purpose && !summary && !project) return null;

  const summaryIsCurrent =
    summary?.turnCount === conversation.aiTurns?.length &&
    summary?.purpose === purposeReference(purpose);
  return (
    <div className="purpose-overview">
      {purpose && (
        <details className="purpose-details">
          <summary>
            <span className="purpose-type">{purposeLabels[purpose.kind]}</span>
            <span className="purpose-statement">{purpose.statement}</span>
            {purpose.completedAt && (
              <span className="purpose-done">
                <Check size={13} /> Done
              </span>
            )}
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <form
            key={`${purpose.kind}:${purpose.statement}`}
            className="purpose-edit"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const statement = String(data.get("statement")).trim();
              const kind = data.get("kind") as Purpose["kind"];
              if (
                statement &&
                (statement !== purpose.statement || kind !== purpose.kind)
              ) {
                onPurpose({ statement, kind });
                event.currentTarget.closest("details")?.removeAttribute("open");
              }
            }}
          >
            <label>
              Purpose type
              <select name="kind" defaultValue={purpose.kind}>
                {Object.entries(purposeLabels).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Conversation purpose
              <textarea
                name="statement"
                rows={2}
                maxLength={12000}
                defaultValue={purpose.statement}
                required
              />
            </label>
            <button className="secondary">Save purpose</button>
          </form>
        </details>
      )}
      {(summary || project) && (
        <details className="conversation-review">
          <summary>Summary and project steps</summary>
          {summary && (
            <section
              className="purpose-summary"
              aria-label="Conversation summary"
            >
              <div className="purpose-summary-heading">
                <h2>Conversation summary</h2>
                <span>Reviewed · Exchanges 1–{summary.turnCount}</span>
              </div>
              {summary.text.length > 600 ? (
                <details className="summary-full">
                  <summary>View full summary</summary>
                  <p>{summary.text}</p>
                </details>
              ) : (
                <p>{summary.text}</p>
              )}
              {!summaryIsCurrent && (
                <span className="purpose-summary-status">
                  The conversation or purpose changed. Update the summary to
                  reflect the latest content.
                </span>
              )}
              {purpose &&
                (!purpose.completedAt || !project) &&
                summaryIsCurrent && (
                  <button
                    className="secondary"
                    onClick={onComplete}
                    disabled={busy}
                  >
                    <Check size={15} />{" "}
                    {project
                      ? "Complete purpose"
                      : "Complete purpose and create project"}
                  </button>
                )}
            </section>
          )}
          {project && (
            <section className="project-steps" aria-label="Project steps">
              <div className="purpose-summary-heading">
                <h2>Project steps</h2>
                <button
                  type="button"
                  onClick={() => onOpenProject(project.pageId)}
                >
                  <FolderOpen size={15} /> Open project
                </button>
              </div>
              <ul>
                {project.steps.map((step, index) => (
                  <li key={step.id}>
                    <input
                      type="checkbox"
                      aria-label={`Step ${index + 1} Done`}
                      checked={step.done}
                      onChange={(event) =>
                        onSteps(
                          project.steps.map((item) =>
                            item.id === step.id
                              ? { ...item, done: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    <input
                      type="text"
                      aria-label={`Step ${index + 1} Name`}
                      maxLength={300}
                      value={step.title}
                      onChange={(event) =>
                        onSteps(
                          project.steps.map((item) =>
                            item.id === step.id
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Step ${index + 1} Delete`}
                      onClick={() =>
                        onSteps(
                          project.steps.filter((item) => item.id !== step.id),
                        )
                      }
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
              {project.steps.length < 200 && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!nextStep.trim()) return;
                    onSteps([
                      ...project.steps,
                      {
                        id: crypto.randomUUID(),
                        title: nextStep.trim(),
                        done: false,
                      },
                    ]);
                    setNextStep("");
                  }}
                >
                  <input
                    aria-label="New project step"
                    placeholder="Add next step"
                    maxLength={300}
                    value={nextStep}
                    onChange={(event) => setNextStep(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="secondary"
                    disabled={!nextStep.trim()}
                  >
                    <Plus size={15} /> Add
                  </button>
                </form>
              )}
            </section>
          )}
        </details>
      )}
    </div>
  );
}
