import {
  defaultLibrary,
  defaultWorkspaceId,
  workspaceId,
  workspaceLibrary,
} from "../shared/workspace-library.mjs";
import { Capacitor } from "@capacitor/core";
import { mobileBridge } from "./mobileBridge";
import type { Bridge, Workspace } from "./types";
export const isMobileApp = !window.wallace && Capacitor.isNativePlatform();
const unavailable = async (): Promise<never> => {
  throw new Error("This feature is available in the installed Wallace app.");
};
// Browser preview uses its own storage. Native builds always use the isolated IPC bridge.
const previewKey = (id: string) =>
  id === defaultWorkspaceId
    ? "wallace-preview"
    : "wallace-preview:" + workspaceId(id);
const browserBridge: Bridge = {
  library: async () => {
    const value = localStorage.getItem("wallace-library");
    return value ? workspaceLibrary(JSON.parse(value)) : defaultLibrary;
  },
  saveLibrary: async (value) => {
    localStorage.setItem(
      "wallace-library",
      JSON.stringify(workspaceLibrary(value)),
    );
  },
  load: async (id = defaultWorkspaceId) =>
    JSON.parse(localStorage.getItem(previewKey(id)) || "null"),
  save: async (value: Workspace, id = defaultWorkspaceId) => {
    localStorage.setItem(previewKey(id), JSON.stringify(value));
  },
  export: async (value, presentation) => {
    const url = URL.createObjectURL(
      new Blob([presentation ?? JSON.stringify(value, null, 2)], {
        type: presentation ? "text/html;charset=utf-8" : "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = presentation
      ? "Wallace-workspace.html"
      : "Wallace-workspace.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  import: unavailable,
  connectRoom: unavailable,
  roomState: async () => null,
  askRoom: unavailable,
  stopRoom: unavailable,
  checkUpdate: unavailable,
  settings: async () => ({
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    transcriptionModel: "gpt-4o-mini-transcribe",
    hasKey: false,
    credentialEndpoints: [],
    voiceMode: "same",
    voiceBaseUrl: "https://api.openai.com/v1",
  }),
  configure: unavailable,
  models: unavailable,
  testConnection: unavailable,
  ask: unavailable,
  speechStatus: async () => ({
    ready: false,
    installed: [],
    stage: null,
    installing: null,
  }),
  installSpeech: unavailable,
  testSpeech: unavailable,
  transcribe: unavailable,
};
export const bridge =
  window.wallace ?? (isMobileApp ? mobileBridge : browserBridge);
