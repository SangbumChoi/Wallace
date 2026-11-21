import type { AiRuntime } from "./types";

export default function AiReplyHeader({ runtime }: { runtime?: AiRuntime }) {
  return (
    <header className="ai-reply-header">
      <strong>Wallace AI</strong>
      {runtime && (
        <span className="ai-reply-runtime">
          <span>{runtime.model}</span>
          <span className="ai-reply-version">
            Harness v{runtime.harnessVersion}
          </span>
        </span>
      )}
    </header>
  );
}
