import { Check, Download } from "lucide-react";
import type { SpeechModel, SpeechStatus } from "./types";

export const speechPresets = {
  "whisper-tiny": {
    name: "Whisper Tiny",
    size: "Approx. 78 MB",
    use: "Fast, lightweight transcription",
  },
  "whisper-base": {
    name: "Whisper Base",
    size: "Approx. 148 MB",
    use: "Balanced speed and accuracy",
  },
  "whisper-small": {
    name: "Whisper Small",
    size: "Approx. 486 MB",
    use: "Higher accuracy",
  },
} satisfies Record<SpeechModel, { name: string; size: string; use: string }>;
export const isSpeechPreset = (model: string): model is SpeechModel =>
  Object.hasOwn(speechPresets, model);

export default function LocalSpeechSetup({
  model,
  status,
  downloading,
  onChange,
  onDownload,
}: {
  model: SpeechModel;
  status?: SpeechStatus;
  downloading?: SpeechModel;
  onChange: (model: SpeechModel) => void;
  onDownload: (model: SpeechModel) => void;
}) {
  const active = status?.installing ?? downloading;
  return (
    <section className="speech-presets" aria-labelledby="speech-presets-title">
      <h3 id="speech-presets-title">Local speech models</h3>
      <p className="provider-hint">
        All models support English and other languages. The speech engine
        installs with the first model.
      </p>
      <div
        role="group"
        aria-label="Choose a local speech model"
        className="speech-preset-list"
      >
        {Object.entries(speechPresets).map(([id, preset]) => {
          const key = id as SpeechModel;
          const installed = status?.installed.includes(key);
          return (
            <div
              className="speech-preset"
              data-selected={model === key}
              key={id}
            >
              <button
                type="button"
                className="speech-preset-choice"
                aria-pressed={model === key}
                onClick={() => onChange(key)}
              >
                <span>
                  <strong>{preset.name}</strong>
                  <small>
                    {preset.use} · {preset.size}
                  </small>
                </span>
                {model === key && <Check size={15} aria-hidden="true" />}
              </button>
              {installed ? (
                <span className="speech-installed">
                  <Check size={13} aria-hidden="true" /> Installed
                </span>
              ) : (
                <button
                  type="button"
                  className="secondary speech-download"
                  disabled={!!active || !status}
                  aria-label={preset.name + " Download"}
                  onClick={() => onDownload(key)}
                >
                  <Download size={14} aria-hidden="true" />{" "}
                  {active === key ? "Preparing…" : "Download"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {active && (
        <div className="speech-download-status" role="status">
          <progress aria-label="Preparing local speech model" />
          <span>
            {status?.stage === "runtime"
              ? "Preparing speech engine…"
              : status?.stage === "model"
                ? speechPresets[active].name + " Downloading…"
                : "Preparing download…"}
          </span>
        </div>
      )}
    </section>
  );
}
