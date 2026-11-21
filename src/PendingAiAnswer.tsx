import AiReplyHeader from "./AiReplyHeader";
import ThinkingLoader from "./ThinkingLoader";

export default function PendingAiAnswer() {
  return (
    <article className="shared-answer ai-pending-answer" aria-busy="true">
      <AiReplyHeader />
      <ThinkingLoader />
    </article>
  );
}
