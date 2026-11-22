import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Copy,
  Mic,
  PanelLeft,
  Square,
  Users,
} from "lucide-react";
import { bridge, isMobileApp } from "./bridge";
import type {
  PurposeKind,
  Settings,
  SharedRoomState,
  WorkspaceProfile,
} from "./types";
import useDictation, {
  appendDictation,
  focusDictationInput,
} from "./useDictation";
import { purposeLabels } from "./workspace";
import PendingAiAnswer from "./PendingAiAnswer";
import MarkdownAnswer from "./MarkdownAnswer";
import AiReplyHeader from "./AiReplyHeader";

export default function SharedRoom({
  onBack,
  onMenu,
  menuOpen,
  onContinue,
  profile,
  settings,
  microphoneId,
  onVoiceSettings,
}: {
  onBack: () => void;
  onMenu: () => void;
  menuOpen: boolean;
  onContinue: (room: SharedRoomState) => void;
  profile?: WorkspaceProfile;
  settings: Settings | null;
  microphoneId: string;
  onVoiceSettings: () => void;
}) {
  const [room, setRoom] = useState<SharedRoomState | null>(null);
  const [mode, setMode] = useState<"host" | "member">(
    isMobileApp ? "member" : "host",
  );
  const [name, setName] = useState(profile?.name ?? "");
  const [title, setTitle] = useState("Shared AI room");
  const [purpose, setPurpose] = useState("");
  const [purposeKind, setPurposeKind] = useState<PurposeKind>("question");
  const [invite, setInvite] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [copied, setCopied] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const shouldScroll = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation({
    settings,
    microphoneId,
    onSettings: onVoiceSettings,
    onNotice: setError,
    scope: room ? (room.id ?? room.title) : false,
  });
  const isRecording = dictation.phase === "recording";

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const state = await bridge.roomState();
        if (active) {
          setRoom(state);
          setConnectionError("");
        }
      } catch {
        if (active)
          setConnectionError(
            "Could not reach the host. Check your network connection.",
          );
      } finally {
        if (active) timer = setTimeout(refresh, 1500);
      }
    }
    if (!busy) void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [busy]);

  const last = room?.turns.at(-1);
  const pendingAnswer = room?.turns.some((turn) => turn.status === "pending");
  useEffect(() => {
    if (list.current && shouldScroll.current)
      list.current.scrollTop = list.current.scrollHeight;
  }, [last?.id, last?.status]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="main shared-room" aria-label="Shared AI room">
      <header className="shared-heading">
        <button
          type="button"
          className="open-sidebar"
          aria-label="Open conversation list"
          aria-expanded={menuOpen}
          onClick={onMenu}
        >
          <PanelLeft size={18} />
        </button>
        <button type="button" className="shared-back" onClick={onBack}>
          <ArrowLeft size={16} /> Home
        </button>
        <h1>{room?.title ?? "Shared AI room"}</h1>
        {room && (
          <span>
            <Users size={15} /> {room.members}{" "}
            {room.members === 1 ? "participant" : "participants"}
          </span>
        )}
        {room && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await bridge.stopRoom();
                setQuestion("");
                setRoom(null);
                setConnectionError("");
              })
            }
          >
            {room.role === "host" ? "Close room" : "Leave room"}
          </button>
        )}
      </header>
      {!room ? (
        <form
          className="shared-connect"
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              setRoom(
                await bridge.connectRoom(
                  mode === "host"
                    ? {
                        role: mode,
                        name,
                        title,
                        purpose: purpose.trim(),
                        purposeKind: purpose.trim() ? purposeKind : undefined,
                      }
                    : { role: mode, name, invite },
                ),
              );
            });
          }}
        >
          {isMobileApp ? (
            <div className="shared-join-intro">
              <Users size={22} aria-hidden="true" />
              <h2>Join with an invite</h2>
              <p>
                Copy the invite link from Wallace for Mac or Windows on the same
                Wi-Fi network.
              </p>
            </div>
          ) : (
            <div className="model-presets">
              <button
                type="button"
                className="secondary"
                aria-pressed={mode === "host"}
                onClick={() => setMode("host")}
              >
                Open room
              </button>
              <button
                type="button"
                className="secondary"
                aria-pressed={mode === "member"}
                onClick={() => setMode("member")}
              >
                Join with an invite
              </button>
            </div>
          )}
          <label>
            Display name
            <input
              required
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {mode === "host" ? (
            <label>
              Room name
              <input
                required
                maxLength={80}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
          ) : (
            <label>
              Invite link
              <input
                required
                maxLength={240}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={invite}
                onChange={(event) => setInvite(event.target.value)}
              />
            </label>
          )}
          {mode === "host" && (
            <details className="shared-purpose-form">
              <summary>Set conversation purpose</summary>
              <label>
                Purpose type
                <select
                  value={purposeKind}
                  onChange={(event) =>
                    setPurposeKind(event.target.value as PurposeKind)
                  }
                >
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
                  rows={2}
                  maxLength={12000}
                  placeholder="Leave blank to use the first question as the purpose"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
              </label>
            </details>
          )}
          {isMobileApp ? (
            <details className="shared-join-disclosure">
              <summary>Connection and data details</summary>
              <p>
                Join on trusted Wi-Fi. The connection is unencrypted, and the
                host stores questions and answers. The host’s AI settings may
                send them to a cloud service.
              </p>
            </details>
          ) : (
            <p>
              Participants can join from Wallace on the same network. The
              connection is unencrypted. Share the invite only with trusted
              participants on a trusted network.
            </p>
          )}
          {mode === "member" && !isMobileApp && (
            <p>
              Everyone in the room can see questions and answers. They are
              stored on the host device and may be sent to a cloud service,
              depending on the host’s AI settings.
            </p>
          )}
          {mode === "host" && (
            <p>
              Open a room with the same name to restore its history. The host’s
              AI receives the purpose, question, and recent messages, which may
              be sent to a cloud service if configured.
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Connecting…" : mode === "host" ? "Open room" : "Join"}
          </button>
        </form>
      ) : (
        <>
          {room.purpose && (
            <div className="shared-purpose">
              <span className="purpose-type">
                {purposeLabels[room.purposeKind ?? "question"]}
              </span>
              <p>{room.purpose}</p>
            </div>
          )}
          {room.role === "host" && (
            <div className="shared-room-actions">
              <details className="shared-invites">
                <summary>Invite link</summary>
                {room.invitations?.length ? (
                  room.invitations.map((address) => (
                    <div key={address}>
                      <code>{address}</code>
                      <button
                        type="button"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(address)
                            .then(() => setCopied(address))
                            .catch(() =>
                              setError("Select the link and copy it manually."),
                            )
                        }
                      >
                        <Copy size={14} />{" "}
                        {copied === address ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ))
                ) : (
                  <p>Connect to the same network and reopen the room.</p>
                )}
              </details>
              {room.turns.some((turn) => turn.status === "done") && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onContinue(room)}
                >
                  Review in My conversations
                </button>
              )}
            </div>
          )}
          <ol
            className="shared-timeline"
            ref={list}
            onScroll={(event) => {
              const element = event.currentTarget;
              shouldScroll.current =
                element.scrollHeight -
                  element.clientHeight -
                  element.scrollTop <
                80;
            }}
          >
            {!room.turns.length && (
              <li className="thread-empty">
                Your first question will appear for everyone in the room.
              </li>
            )}
            {room.turns.map((turn) => (
              <li key={turn.id}>
                <article className="shared-question">
                  <header>
                    <strong>{turn.author}</strong>
                    <time dateTime={turn.time}>
                      {new Date(turn.time).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </header>
                  <p>{turn.question}</p>
                </article>
                {turn.status === "pending" ? (
                  <PendingAiAnswer />
                ) : (
                  <article className="shared-answer">
                    <AiReplyHeader runtime={turn.runtime} />
                    {turn.answer && <MarkdownAnswer text={turn.answer} />}
                  </article>
                )}
              </li>
            ))}
          </ol>
          <form
            className="shared-composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (!question.trim() || busy || connectionError) return;
              const submitted = question;
              void perform(async () => {
                await bridge.askRoom(submitted);
                shouldScroll.current = true;
                setQuestion((current) =>
                  current === submitted ? "" : current,
                );
                setRoom(await bridge.roomState());
              });
            }}
          >
            <textarea
              ref={composer}
              aria-label="Ask the shared room"
              placeholder="Ask a question everyone can see…"
              required
              maxLength={4000}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <div className="composer-actions">
              <button
                type="button"
                title={isRecording ? "Finish recording" : "Voice input"}
                aria-label={isRecording ? "Finish recording" : "Voice input"}
                className={isRecording ? "recording-action" : ""}
                disabled={dictation.phase !== "idle" && !isRecording}
                onClick={() => {
                  setError("");
                  void dictation.toggle((text) => {
                    setQuestion((current) =>
                      appendDictation(current, text, 4000),
                    );
                    focusDictationInput(composer.current);
                  });
                }}
              >
                {isRecording ? <Square size={15} /> : <Mic size={17} />}
              </button>
              <span
                className="composer-status"
                data-ai-pending={!!pendingAnswer}
                role="status"
              >
                {isRecording
                  ? `Recording · ${dictation.seconds}s`
                  : dictation.phase === "opening"
                    ? "Connecting to microphone…"
                    : dictation.phase === "transcribing"
                      ? "Transcribing…"
                      : pendingAnswer
                        ? "Generating reply"
                        : ""}
              </span>
              <button
                className="composer-send"
                aria-label="Send shared question"
                disabled={!question.trim() || busy || !!connectionError}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </form>
        </>
      )}
      {(error || connectionError) && (
        <p className="shared-error" role="alert">
          {error || connectionError}
        </p>
      )}
    </main>
  );
}
