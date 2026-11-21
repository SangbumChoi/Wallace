import {
  defaultLibrary,
  defaultWorkspaceId,
  workspaceId,
  workspaceLibrary,
} from "../shared/workspace-library.mjs";
import { CapacitorHttp, type HttpOptions } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { cloudEndpoint } from "../shared/cloud.mjs";
import { prepareQuestion } from "../shared/ai.mjs";
import {
  aiRuntime,
  endpoint,
  validateWorkspace,
} from "../shared/workspace.mjs";
import { version as harnessVersion } from "../package.json";
import type {
  Bridge,
  CloudLink,
  CloudBridge,
  CloudResult,
  ConnectionDraft,
  Settings,
  SettingsDraft,
  SharedRoomState,
  SpeechAudio,
} from "./types";

const defaultEndpoint = "https://api.openai.com/v1";
const settingsKey = "wallace.settings";
const workspaceFiles = ["workspace.json", "workspace-next.json"];
const activeWorkspaceKey = "wallace.activeWorkspace";
const scoped = (id: string, key: string) =>
  id === defaultWorkspaceId ? key : workspaceId(id) + "." + key;
const workspaceDirectory = {
  directory: Directory.Data,
  encoding: Encoding.UTF8,
};
type MobileSettings = Omit<Settings, "hasKey">;
const defaults: MobileSettings = {
  baseUrl: defaultEndpoint,
  model: "gpt-4.1-mini",
  voiceBaseUrl: defaultEndpoint,
  transcriptionModel: "gpt-4o-mini-transcribe",
  voiceMode: "same",
  credentialEndpoints: [],
};
const keyId = (base: string) => "wallace.api." + base;
const unsupported = async (): Promise<never> => {
  throw new Error("This feature is available in the Wallace desktop app.");
};
let saveQueue: Promise<unknown> = Promise.resolve();
let member: { base: string; token: string } | undefined;
let connecting = false;

async function readSettings(): Promise<MobileSettings> {
  const { value } = await Preferences.get({ key: settingsKey });
  return value ? { ...defaults, ...JSON.parse(value) } : defaults;
}
async function settings(): Promise<Settings> {
  const config = await readSettings();
  const { value: keys } = await SecureStoragePlugin.keys();
  const credentialEndpoints = keys
    .filter((key) => key.startsWith("wallace.api."))
    .map((key) => key.slice("wallace.api.".length));
  return {
    ...config,
    credentialEndpoints,
    hasKey: credentialEndpoints.includes(config.baseUrl),
  };
}
async function storedKey(base: string) {
  const key = keyId(base);
  const { value: keys } = await SecureStoragePlugin.keys();
  return keys.includes(key)
    ? (await SecureStoragePlugin.get({ key })).value
    : undefined;
}
function draftKey(input: ConnectionDraft, base: string) {
  return input.clearKey ? undefined : input.apiKey?.trim() || storedKey(base);
}
async function changeKey(base: string, value?: string, clear?: boolean) {
  if (clear) {
    if (await storedKey(base))
      await SecureStoragePlugin.remove({ key: keyId(base) });
  } else if (value?.trim()) {
    await SecureStoragePlugin.set({ key: keyId(base), value: value.trim() });
  }
}
function modelName(value: string) {
  const name = value.trim();
  if (!name || name.length > 200)
    throw new Error("Enter a model name of up to 200 characters.");
  return name;
}
async function aiRequest(
  base: string,
  route: string,
  key?: string,
  options?: Partial<HttpOptions>,
) {
  const response = await CapacitorHttp.request({
    url: endpoint(base) + "/" + route,
    connectTimeout: 15000,
    readTimeout: 90000,
    disableRedirects: true,
    responseType: "json",
    ...options,
    headers: {
      ...options?.headers,
      ...(key ? { Authorization: "Bearer " + key } : {}),
    },
  });
  if (response.status < 200 || response.status >= 300)
    throw new Error(
      `AI server request failed (${response.status}). Check your connection settings.`,
    );
  return response.data;
}
async function chat(
  base: string,
  model: string,
  key: string | undefined,
  messages: { role: string; content: string }[],
) {
  const result = await aiRequest(base, "chat/completions", key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: { model: modelName(model), messages },
  });
  const answer = result?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim())
    throw new Error("The AI server did not return a reply.");
  return {
    answer: answer.trim().slice(0, 16000),
    runtime:
      aiRuntime(result.model, harnessVersion) ??
      aiRuntime(model, harnessVersion),
  };
}
async function roomRequest<T>(
  base: string,
  token: string,
  route: string,
  data?: object,
): Promise<T> {
  const response = await CapacitorHttp.request({
    url: base + route,
    method: data ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    data,
    disableRedirects: true,
    connectTimeout: 8000,
    readTimeout: 8000,
    responseType: "json",
  });
  if (response.status < 200 || response.status >= 300)
    throw new Error(
      response.data?.error || "Could not connect to the shared AI room.",
    );
  return response.data as T;
}
function parseInvite(value: string) {
  const url = new URL(value.trim());
  const privateAddress =
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+(?:\.\d+){1,2}$/.test(
      url.hostname,
    );
  if (
    url.protocol !== "http:" ||
    !privateAddress ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.pathname !== "/" ||
    !/^#[0-9a-f]{48}$/.test(url.hash)
  ) {
    throw new Error(
      "Enter an invite link from a Wallace desktop app on the same Wi-Fi network.",
    );
  }
  return url;
}
async function roomState() {
  if (!member) return null;
  const snapshot = await roomRequest<SharedRoomState>(
    member.base,
    member.token,
    "/state",
  );
  return { ...snapshot, role: "member" as const };
}
function asBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
async function transcribe(input: SpeechAudio, draft?: SettingsDraft) {
  const config = draft ?? (await readSettings());
  if (config.voiceMode === "off" || config.voiceMode === "local")
    throw new Error("Choose a server in speech-to-text settings.");
  if (!input.bytes.length || input.bytes.length > 24000000)
    throw new Error("Use a recording that is 24 MB or smaller.");
  const extension = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
  }[input.mime];
  if (!extension) throw new Error("This recording format is not supported.");
  const base = endpoint(
    config.voiceMode === "separate" ? config.voiceBaseUrl : config.baseUrl,
  );
  const credentials =
    draft && config.voiceMode === "separate" && base !== endpoint(draft.baseUrl)
      ? { ...draft, apiKey: draft.voiceApiKey, clearKey: draft.clearVoiceKey }
      : draft;
  const key = await (credentials
    ? draftKey(credentials, base)
    : storedKey(base));
  const result = await aiRequest(base, "audio/transcriptions", key, {
    method: "POST",
    dataType: "formData",
    headers: { "Content-Type": "multipart/form-data" },
    data: [
      {
        key: "model",
        value: modelName(config.transcriptionModel),
        type: "string",
      },
      {
        key: "file",
        value: asBase64(input.bytes),
        type: "base64File",
        fileName: "recording." + extension,
        contentType: input.mime,
      },
    ],
  });
  if (typeof result?.text !== "string")
    throw new Error("The server did not return a transcription.");
  return result.text;
}
function selectBackup() {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    document.body.append(input);
    function finish(file: File | null) {
      input.remove();
      resolve(file);
    }
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), {
      once: true,
    });
    input.addEventListener("cancel", () => finish(null), { once: true });
    input.click();
  });
}

export const mobileBridge: Bridge = {
  async library() {
    const { value } = await Preferences.get({ key: "wallace.library" });
    return value ? workspaceLibrary(JSON.parse(value)) : defaultLibrary;
  },
  async saveLibrary(value) {
    await Preferences.set({
      key: "wallace.library",
      value: JSON.stringify(workspaceLibrary(value)),
    });
  },
  async load(id = defaultWorkspaceId) {
    const { value } = await Preferences.get({
      key: scoped(id, activeWorkspaceKey),
    });
    if (!value) return null;
    const { data } = await Filesystem.readFile({
      ...workspaceDirectory,
      path: scoped(id, workspaceFiles[value === "1" ? 1 : 0]),
    });
    if (typeof data !== "string")
      throw new Error("Could not read the workspace.");
    return validateWorkspace(JSON.parse(data));
  },
  save(value, id = defaultWorkspaceId) {
    const data = JSON.stringify(validateWorkspace(value));
    const pending = saveQueue.then(async () => {
      const { value: active } = await Preferences.get({
        key: scoped(id, activeWorkspaceKey),
      });
      const next = active === "0" ? 1 : 0;
      await Filesystem.writeFile({
        ...workspaceDirectory,
        path: scoped(id, workspaceFiles[next]),
        data,
      });
      await Preferences.set({
        key: scoped(id, activeWorkspaceKey),
        value: String(next),
      });
    });
    saveQueue = pending.catch(() => {});
    return pending;
  },
  async export(value, presentation) {
    const data =
      presentation ?? JSON.stringify(validateWorkspace(value), null, 2);
    const path =
      "Wallace-workspace." + (presentation === undefined ? "json" : "html");
    const { uri } = await Filesystem.writeFile({
      path,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      data,
    });
    await Share.share({ files: [uri], dialogTitle: "Export workspace" });
    return true;
  },
  async import() {
    const file = await selectBackup();
    if (!file) return null;
    if (file.size > 25000000)
      throw new Error("Choose a file that is 25 MB or smaller.");
    return validateWorkspace(JSON.parse(await file.text()));
  },
  async connectRoom(input) {
    if (input.role !== "member") return unsupported();
    if (connecting || member)
      throw new Error("You are already connected to a shared room.");
    connecting = true;
    try {
      const url = parseInvite(input.invite);
      const { token } = await roomRequest<{ token: string }>(
        url.origin,
        url.hash.slice(1),
        "/join",
        { name: input.name },
      );
      if (!/^[0-9a-f]{48}$/.test(token))
        throw new Error("Check your invitation details.");
      member = { base: url.origin, token };
      const snapshot = await roomState();
      if (!snapshot) throw new Error("Could not connect to the room.");
      return snapshot;
    } catch (error) {
      member = undefined;
      throw error;
    } finally {
      connecting = false;
    }
  },
  roomState,
  async askRoom(question) {
    if (!member) throw new Error("Connect to a shared room first.");
    await roomRequest(member.base, member.token, "/ask", { question });
  },
  async stopRoom() {
    const previous = member;
    member = undefined;
    if (previous)
      await roomRequest(previous.base, previous.token, "/leave", {}).catch(
        () => {},
      );
  },
  checkUpdate: unsupported,
  settings,
  async configure(draft) {
    const baseUrl = endpoint(draft.baseUrl);
    const voiceBaseUrl =
      draft.voiceMode === "separate"
        ? endpoint(draft.voiceBaseUrl)
        : defaultEndpoint;
    const voiceMode = draft.voiceMode === "local" ? "off" : draft.voiceMode;
    const model = modelName(draft.model);
    const transcriptionModel =
      voiceMode === "off"
        ? defaults.transcriptionModel
        : modelName(draft.transcriptionModel);
    await changeKey(baseUrl, draft.apiKey, draft.clearKey);
    if (voiceMode === "separate" && baseUrl !== voiceBaseUrl)
      await changeKey(voiceBaseUrl, draft.voiceApiKey, draft.clearVoiceKey);
    await Preferences.set({
      key: settingsKey,
      value: JSON.stringify({
        baseUrl,
        voiceBaseUrl,
        voiceMode,
        model,
        transcriptionModel,
        compactModel: draft.compactModel?.trim() || undefined,
      }),
    });
    return settings();
  },
  async models(input) {
    const base = endpoint(input.baseUrl);
    const response = await aiRequest(
      base,
      "models",
      await draftKey(input, base),
    );
    if (!Array.isArray(response?.data))
      throw new Error("The server did not return a model list.");
    const models = response.data
      .map((item: { id?: unknown }) => item?.id)
      .filter(
        (id: unknown): id is string =>
          typeof id === "string" && Boolean(id.trim()) && id.length <= 200,
      ) as string[];
    return [...new Set(models)].sort().slice(0, 1000);
  },
  async testConnection(input) {
    const base = endpoint(input.baseUrl);
    await chat(base, input.model, await draftKey(input, base), [
      {
        role: "user",
        content: "This is a connection test. Reply with only the word OK.",
      },
    ]);
  },
  async ask(input) {
    const { messages, sources } = prepareQuestion(input);
    const config = await readSettings();
    return {
      ...(await chat(
        config.baseUrl,
        input.purpose === "compact" && config.compactModel
          ? config.compactModel
          : config.model,
        await storedKey(config.baseUrl),
        messages,
      )),
      sources,
    };
  },
  speechStatus: async () => ({
    ready: false,
    installed: [],
    stage: null,
    installing: null,
  }),
  installSpeech: unsupported,
  testSpeech: transcribe,
  transcribe,
};

mobileBridge.cloudFor = (id): CloudBridge => {
  const cloudLinkKey = scoped(id, "wallace.cloud");
  const cloudSecret = scoped(id, "wallace.cloud.key");

  async function cloudLink() {
    const { value } = await Preferences.get({ key: cloudLinkKey });
    return value ? (JSON.parse(value) as CloudLink) : null;
  }
  async function cloudRequest(
    method: "GET" | "PUT",
    since?: number,
    data?: object,
  ): Promise<CloudResult> {
    const config = await cloudLink();
    if (!config) throw new Error("Connect to a shared server first.");
    const { value: key } = await SecureStoragePlugin.get({ key: cloudSecret });
    const response = await CapacitorHttp.request({
      method,
      url:
        config.url +
        "/v1/workspace" +
        (since === undefined ? "" : "?since=" + since),
      headers: {
        Authorization: "Bearer " + key,
        ...(data && { "Content-Type": "application/json" }),
      },
      data,
      responseType: "json",
      disableRedirects: true,
      connectTimeout: 15000,
      readTimeout: 15000,
    });
    if (response.status === 304 || response.status === 404)
      return { status: response.status };
    if (response.status === 200 || response.status === 409)
      return { ...response.data, status: response.status };
    throw new Error(
      response.data?.error || "Could not connect to the shared server.",
    );
  }

  return {
    link: cloudLink,
    async configure(input, key) {
      const url = cloudEndpoint(input);
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(key))
        throw new Error("Check your shared workspace access key.");
      const existing = await cloudLink();
      if (existing && existing.url !== url)
        throw new Error("Disconnect from the current server first.");
      await SecureStoragePlugin.set({ key: cloudSecret, value: key });
      await Preferences.set({
        key: cloudLinkKey,
        value: JSON.stringify({
          ...existing,
          url,
          revision: existing?.revision ?? 0,
        }),
      });
    },
    async checkpoint(revision, fingerprint) {
      const link = await cloudLink();
      if (!link) throw new Error("Connect to a shared server first.");
      await Preferences.set({
        key: cloudLinkKey,
        value: JSON.stringify({ ...link, revision, fingerprint }),
      });
    },
    fetch: (options) => cloudRequest("GET", options?.since),
    push: (baseRevision, workspace) =>
      cloudRequest("PUT", undefined, { baseRevision, workspace }),
    async disconnect() {
      await Preferences.remove({ key: cloudLinkKey });
      await SecureStoragePlugin.remove({ key: cloudSecret });
    },
  };
};
