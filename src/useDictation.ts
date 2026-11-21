import { useEffect, useRef, useState } from "react";
import { createAudioRecorder, speechAudio } from "./audio";
import { bridge } from "./bridge";
import { isSpeechPreset } from "./LocalSpeechSetup";
import type { Settings } from "./types";

type Recording = {
  stream?: MediaStream;
  recorder?: MediaRecorder;
  timer?: ReturnType<typeof setInterval>;
};

export function appendDictation(draft: string, text: string, limit: number) {
  const separator = draft && !/\s$/.test(draft) ? "\n" : "";
  const remaining = limit - draft.length - separator.length;
  const inserted = text
    .trim()
    .slice(0, Math.max(0, remaining))
    .replace(/[\uD800-\uDBFF]$/, "");
  return inserted ? draft + separator + inserted : draft;
}

export function focusDictationInput(input: HTMLTextAreaElement | null) {
  if (!input || document.activeElement === input) return;
  const previous = document.activeElement;
  requestAnimationFrame(() => {
    if (!input.isConnected || document.activeElement !== previous) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

function release(recording: Recording) {
  clearInterval(recording.timer);
  const recorder = recording.recorder;
  if (recorder) {
    recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
    if (recorder.state !== "inactive") recorder.stop();
  }
  recording.stream?.getTracks().forEach((track) => track.stop());
}

export default function useDictation({
  settings,
  microphoneId,
  onSettings,
  onNotice,
  scope,
}: {
  settings: Settings | null;
  microphoneId: string;
  onSettings: () => void;
  onNotice: (message: string) => void;
  scope: string | number | boolean;
}) {
  const active = useRef<Recording | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "opening" | "recording" | "transcribing"
  >("idle");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setPhase("idle");
    return () => {
      if (active.current) release(active.current);
      active.current = null;
    };
  }, [scope]);

  async function toggle(onTranscript: (text: string) => void) {
    if (active.current) {
      const recorder = active.current.recorder;
      if (recorder?.state === "recording") {
        setPhase("transcribing");
        recorder.stop();
      }
      return;
    }

    const capture: Recording = {};
    active.current = capture;
    setPhase("opening");
    const current = () => active.current === capture;
    const finish = () => {
      if (!current()) return;
      active.current = null;
      release(capture);
      setPhase("idle");
    };

    try {
      const voiceUrl =
        settings?.voiceMode === "separate"
          ? settings.voiceBaseUrl
          : settings?.baseUrl;
      if (
        !settings ||
        settings.voiceMode === "off" ||
        (settings.voiceMode !== "local" &&
          voiceUrl === "https://api.openai.com/v1" &&
          !settings.credentialEndpoints.includes(voiceUrl))
      ) {
        onSettings();
        onNotice("Choose a speech-to-text connection in Settings.");
        finish();
        return;
      }
      if (settings.voiceMode === "local") {
        const status = await bridge.speechStatus();
        if (!current()) return;
        if (
          !isSpeechPreset(settings.transcriptionModel) ||
          !status.installed.includes(settings.transcriptionModel)
        ) {
          onSettings();
          onNotice("Download the selected Whisper model in Settings first.");
          finish();
          return;
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: microphoneId ? { deviceId: { exact: microphoneId } } : true,
      });
      if (!current()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      capture.stream = stream;
      const recorder = createAudioRecorder(stream);
      capture.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        finish();
        onNotice("Something went wrong while recording.");
      };
      recorder.onstop = async () => {
        clearInterval(capture.timer);
        stream.getTracks().forEach((track) => track.stop());
        capture.stream = undefined;
        if (!current()) return;
        setPhase("transcribing");
        try {
          const clip = new Blob(chunks, { type: recorder.mimeType });
          const text = clip.size
            ? await bridge.transcribe(await speechAudio(clip))
            : "";
          if (!current()) return;
          if (text.trim()) onTranscript(text);
          else onNotice("No speech was detected in the recording.");
        } catch (error) {
          if (current()) onNotice((error as Error).message);
        } finally {
          finish();
        }
      };
      recorder.start();
      const started = Date.now();
      setSeconds(0);
      setPhase("recording");
      capture.timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 120 && recorder.state === "recording") {
          setPhase("transcribing");
          recorder.stop();
        }
      }, 1000);
    } catch (error) {
      if (!current()) return;
      finish();
      if (
        error instanceof DOMException &&
        ["NotFoundError", "OverconstrainedError"].includes(error.name)
      )
        onSettings();
      onNotice(`The microphone is unavailable. ${(error as Error).message}`);
    }
  }

  return { phase, seconds, toggle };
}
