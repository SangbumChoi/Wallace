import { useEffect, useRef, useState } from "react";
import { AudioLines, Mic, Square } from "lucide-react";
import { bridge } from "./bridge";
import { createAudioRecorder, speechAudio } from "./audio";
import type { SettingsDraft } from "./types";

const limit = 10;
const segments = 12;
type Capture = {
  stream: MediaStream;
  recorder?: MediaRecorder;
  context?: AudioContext;
  frame?: number;
  timer?: ReturnType<typeof setTimeout>;
};

function release(capture?: Capture) {
  if (!capture) return;
  if (capture.timer !== undefined) clearTimeout(capture.timer);
  if (capture.frame !== undefined) cancelAnimationFrame(capture.frame);
  if (capture.recorder) {
    capture.recorder.ondataavailable = null;
    capture.recorder.onstop = null;
    capture.recorder.onerror = null;
    if (capture.recorder.state !== "inactive") capture.recorder.stop();
  }
  capture.stream.getTracks().forEach((track) => track.stop());
  void capture.context?.close().catch(() => {});
}

export default function MicrophoneTest({
  draft,
  target,
  blocked,
  deviceId,
  onDeviceChange,
}: {
  draft: SettingsDraft;
  target: string;
  blocked?: string;
  deviceId: string;
  onDeviceChange: (id: string) => void;
}) {
  const alive = useRef(false);
  const capture = useRef<Capture | undefined>(undefined);
  const [phase, setPhase] = useState<
    "idle" | "opening" | "recording" | "stopping"
  >("idle");
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [clip, setClip] = useState<Blob>();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    draft: SettingsDraft;
    text: string;
    error?: boolean;
  }>();
  const transcript = useRef<HTMLDivElement>(null);
  const visibleResult = result?.draft === draft ? result : undefined;

  useEffect(() => {
    if (visibleResult) transcript.current?.scrollIntoView({ block: "nearest" });
  }, [visibleResult]);

  useEffect(() => {
    alive.current = true;
    void readDevices();
    navigator.mediaDevices?.addEventListener("devicechange", readDevices);
    return () => {
      alive.current = false;
      navigator.mediaDevices?.removeEventListener("devicechange", readDevices);
      release(capture.current);
      capture.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!clip) {
      setUrl("");
      return;
    }
    const source = URL.createObjectURL(clip);
    setUrl(source);
    return () => URL.revokeObjectURL(source);
  }, [clip]);

  async function readDevices() {
    try {
      const inputs = await navigator.mediaDevices.enumerateDevices();
      if (!alive.current) return;
      const available = inputs.filter(
        (device) =>
          device.kind === "audioinput" &&
          device.deviceId &&
          device.deviceId !== "default",
      );
      setDevices(available);
    } catch {
      // The default microphone remains available without a device list.
    }
  }

  function finishRecording(current: Capture) {
    if (capture.current !== current) return;
    capture.current = undefined;
    release(current);
    setPhase("idle");
    setLevel(0);
  }

  async function start() {
    setClip(undefined);
    setError("");
    setResult(undefined);
    setLevel(0);
    setSeconds(0);
    setPhase("opening");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Could not open the microphone on this device.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      if (!alive.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const current: Capture = { stream };
      capture.current = current;
      const recorder = createAudioRecorder(stream);
      const context = new AudioContext();
      current.recorder = recorder;
      current.context = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      void context.resume().catch(() => {});
      void readDevices();

      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (capture.current !== current) return;
        const recorded = new Blob(chunks, { type: recorder.mimeType });
        finishRecording(current);
        if (recorded.size) setClip(recorded);
        else setError("No audio was recorded. Try again.");
      };
      recorder.onerror = () => {
        finishRecording(current);
        setError("Recording stopped. Check the microphone and try again.");
      };
      const started = performance.now();
      const samples = new Float32Array(analyser.fftSize);
      function meter(now: number) {
        if (capture.current !== current) return;
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((sum, sample) => sum + sample * sample, 0) /
            samples.length,
        );
        const decibels = 20 * Math.log10(Math.max(rms, 0.0001));
        setLevel(
          Math.max(
            0,
            Math.min(segments, Math.ceil(((decibels + 56) / 48) * segments)),
          ),
        );
        setSeconds(Math.min(limit, Math.floor((now - started) / 1000)));
        current.frame = requestAnimationFrame(meter);
      }
      recorder.start();
      current.frame = requestAnimationFrame(meter);
      current.timer = setTimeout(() => {
        if (recorder.state === "recording") {
          setPhase("stopping");
          recorder.stop();
        }
      }, limit * 1000);
      setPhase("recording");
    } catch (cause) {
      if (!alive.current) return;
      if (capture.current) finishRecording(capture.current);
      setPhase("idle");
      setError(
        cause instanceof DOMException &&
          ["NotAllowedError", "PermissionDeniedError"].includes(cause.name)
          ? "Allow Wallace to use the microphone in your system settings."
          : cause instanceof DOMException &&
              ["NotFoundError", "OverconstrainedError"].includes(cause.name)
            ? "The selected microphone could not be found. Try another input device."
            : cause instanceof Error
              ? cause.message
              : String(cause),
      );
    }
  }

  async function transcribe() {
    if (!clip || blocked || testing) return;
    setTesting(true);
    setResult(undefined);
    try {
      const text = await bridge.testSpeech(await speechAudio(clip), draft);
      if (alive.current) setResult({ draft, text: text.trim() });
    } catch (cause) {
      if (alive.current)
        setResult({
          draft,
          text: cause instanceof Error ? cause.message : String(cause),
          error: true,
        });
    } finally {
      if (alive.current) setTesting(false);
    }
  }

  return (
    <section
      className="microphone-test"
      aria-labelledby="microphone-test-title"
    >
      <div className="speech-test-heading">
        <Mic size={17} aria-hidden="true" />
        <h3 id="microphone-test-title">Microphone test</h3>
      </div>
      <p className="provider-hint">
        Speak to check the input level, then play back your recording.
      </p>
      <label>
        Input device
        <select
          value={deviceId}
          onChange={(event) => onDeviceChange(event.target.value)}
          disabled={phase !== "idle" || testing}
        >
          <option value="">System default microphone</option>
          {deviceId &&
            !devices.some((device) => device.deviceId === deviceId) && (
              <option value={deviceId}>Previously selected microphone</option>
            )}
          {devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || "Microphone " + (index + 1)}
            </option>
          ))}
        </select>
      </label>
      <div className="speech-meter-row">
        <div
          className="speech-meter"
          role="meter"
          aria-label="Microphone input level"
          aria-valuemin={0}
          aria-valuemax={segments}
          aria-valuenow={level}
        >
          {Array.from({ length: segments }, (_, index) => (
            <span key={index} aria-hidden="true" data-lit={index < level} />
          ))}
        </div>
        {phase === "recording" && (
          <span className="speech-timer" aria-label="Recording duration">
            {seconds} / {limit}s
          </span>
        )}
      </div>
      <div className="speech-test-controls">
        {phase === "recording" ? (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setPhase("stopping");
              capture.current?.recorder?.stop();
            }}
          >
            <Square size={14} aria-hidden="true" /> Stop recording
          </button>
        ) : (
          <button
            type="button"
            className="secondary"
            disabled={phase !== "idle" || testing}
            onClick={() => void start()}
          >
            <Mic size={14} aria-hidden="true" />{" "}
            {phase === "opening"
              ? "Connecting to microphone…"
              : phase === "stopping"
                ? "Preparing recording…"
                : clip
                  ? "Record again"
                  : "Record test audio"}
          </button>
        )}
        {phase === "recording" && (
          <span className="speech-recording" role="status">
            Recording
          </span>
        )}
      </div>
      {error && (
        <p className="provider-feedback provider-error" role="alert">
          {error}
        </p>
      )}
      {clip && url && (
        <audio
          className="speech-playback"
          aria-label="Play recording"
          controls
          src={url}
        />
      )}
      {clip && (
        <>
          <div className="speech-test-controls">
            <button
              type="button"
              className="primary"
              disabled={!!blocked || testing}
              onClick={() => void transcribe()}
            >
              <AudioLines size={15} aria-hidden="true" />{" "}
              {testing ? "Transcribing audio…" : "Test transcription"}
            </button>
          </div>
          <p className="provider-hint">{blocked || target}</p>
        </>
      )}
      {visibleResult &&
        (visibleResult.error ? (
          <p className="provider-feedback provider-error" role="alert">
            {visibleResult.text}
          </p>
        ) : (
          <div ref={transcript} className="speech-transcript" role="status">
            <strong>Transcript</strong>
            <p>
              {visibleResult.text ||
                "No speech detected. Move closer to the microphone and try again."}
            </p>
          </div>
        ))}
    </section>
  );
}
