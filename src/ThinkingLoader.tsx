export default function ThinkingLoader({
  label = "Thinking…",
}: {
  label?: string;
}) {
  return (
    <div className="thinking-loader" role="status" aria-live="polite">
      <span className="thinking-orbit" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
    </div>
  );
}
