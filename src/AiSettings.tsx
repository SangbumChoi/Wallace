import { useEffect, useState } from "react";
import { Check, Server, Cloud, Laptop, ChevronRight } from "lucide-react";
import { bridge, isMobileApp } from "./bridge";
import LocalSpeechSetup, {
  isSpeechPreset,
  speechPresets,
} from "./LocalSpeechSetup";
import ThinkingLoader from "./ThinkingLoader";
import { readShortcuts, shortcutText } from "./shortcuts";
import MicrophoneTest from "./MicrophoneTest";
import type {
  Settings,
  SettingsDraft,
  SpeechModel,
  SpeechStatus,
} from "./types";

const openAI = "https://api.openai.com/v1";
const huggingFace = "https://router.huggingface.co/v1";
const lingFlash = "inclusionai/ling-3.2-flash:free";
const localLfmModel = "lfm3:1.7b";
const providers = [
  { name: "OpenAI", url: openAI, models: ["gpt-4.1-mini", "gpt-4.1"] },
  {
    name: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-3.8-flash", "gemini-3.1-pro-preview"],
  },
  {
    name: "Hugging Face",
    url: huggingFace,
    models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"],
  },
  {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1",
    models: [
      "baidu/ernie-5.5-flash-preview:free",
      "liquid/lfm-3-1.7b:free",
      "particle-ai/particle-1:free",
      "recursive/flint-v1.0:free",
      "nvidia/nemotron-3.5-super-vl:free",
      "dots-studio/dots-3-note-preview:free",
      "nvidia/nemotron-3.5-lightning:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      lingFlash,
    ],
  },
];
const ollama = {
  name: "Ollama",
  url: "http://127.0.0.1:11434/v1",
  models: [localLfmModel, "qwen3:0.6b", "gemma3:1b", "gemma3:270m"],
};
const custom = { name: "Custom connection", url: "", models: [] };
const serverPresets = [
  ollama,
  { name: "vLLM", url: "http://127.0.0.1:8000/v1", models: [] },
  { name: "llama.cpp", url: "http://127.0.0.1:8080/v1", models: [] },
  { name: "SGLang", url: "http://127.0.0.1:30000/v1", models: [] },
];
const choices = [
  {
    id: "local",
    title: "Run on this device",
    hint: "Ollama, vLLM, llama.cpp, or SGLang",
    icon: Laptop,
  },
  {
    id: "cloud",
    title: "Cloud service",
    hint: "OpenAI, Gemini, OpenRouter, and more",
    icon: Cloud,
  },
  {
    id: "custom",
    title: "Connect your own server",
    hint: "Enter a server URL and model",
    icon: Server,
  },
] as const;
type SetupMode = (typeof choices)[number]["id"];

type SavedModel = Pick<Settings, "baseUrl" | "model" | "localRuntime">;
const savedModelsKey = "wallace.saved-chat-models";
const modelKey = ({ baseUrl, model }: SavedModel) =>
  JSON.stringify([baseUrl, model]);

function loadSavedModels(): SavedModel[] {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(savedModelsKey) ?? "[]",
    );
    if (Array.isArray(saved))
      return saved
        .filter(
          (item): item is SavedModel =>
            item &&
            typeof item.baseUrl === "string" &&
            typeof item.model === "string" &&
            item.model.trim() !== "",
        )
        .slice(0, 50);
  } catch {
    // Storage may be unavailable in a browser preview.
  }
  return [];
}

function providerFor(entry: SavedModel) {
  return (
    serverPresets.find((item) => item.name === entry.localRuntime) ??
    [...serverPresets, ...providers].find(
      (item) => item.url === cleanUrl(entry.baseUrl),
    )
  );
}

function cleanUrl(url: string) {
  return url.trim().replace(/\/$/, "");
}

export default function AiSettings({
  settings,
  onSave,
  onCredentialsChanged,
  openVoice = false,
  microphoneId,
  onMicrophoneChange,
}: {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onCredentialsChanged?: (settings: Settings) => void;
  openVoice?: boolean;
  microphoneId: string;
  onMicrophoneChange: (id: string) => void;
}) {
  const [draft, setDraft] = useState<SettingsDraft>(settings);
  const [savedModels, setSavedModels] = useState(loadSavedModels);
  const [provider, setProvider] = useState(
    () => providerFor(settings) ?? custom,
  );
  const [mode, setMode] = useState<SetupMode>(() =>
    serverPresets.includes(provider)
      ? "local"
      : provider === custom
        ? "custom"
        : "cloud",
  );
  const [modelQuery, setModelQuery] = useState("");
  const [modelIndex, setModelIndex] = useState(0);
  const [editingKey, setEditingKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [verified, setVerified] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"models" | "test" | "save" | "key">();
  const [message, setMessage] = useState<{
    text: string;
    error?: boolean;
    alternative?: string;
  }>();
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>();
  const [downloading, setDownloading] = useState<SpeechModel>();
  const [speechError, setSpeechError] = useState("");
  const localModel = isSpeechPreset(draft.transcriptionModel)
    ? draft.transcriptionModel
    : "whisper-base";
  const voiceUrl = cleanUrl(
    draft.voiceMode === "separate" ? draft.voiceBaseUrl : draft.baseUrl,
  );
  const localVoice = draft.voiceMode === "local";
  const voiceTarget = localVoice
    ? `${speechPresets[localModel].name} will transcribe on this device.`
    : `The test recording will be sent to ${URL.canParse(voiceUrl) ? new URL(voiceUrl).host : "your configured speech server"}. Service fees may apply.`;
  const speechBlocked = localVoice
    ? speechStatus?.installed.includes(localModel)
      ? undefined
      : "Download the selected model to use speech-to-text."
    : !URL.canParse(voiceUrl) || !draft.transcriptionModel.trim()
      ? "Check the speech server URL and model name."
      : undefined;

  useEffect(() => {
    if (!openVoice || !localVoice) return;
    let active = true;
    async function refresh() {
      try {
        const status = await bridge.speechStatus();
        if (active) setSpeechStatus(status);
      } catch (error) {
        if (active) setSpeechError((error as Error).message);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [openVoice, localVoice]);

  async function downloadSpeech(model: SpeechModel) {
    update({ transcriptionModel: model });
    setSpeechError("");
    setDownloading(model);
    try {
      await bridge.installSpeech(model);
      setSpeechStatus(await bridge.speechStatus());
    } catch (error) {
      setSpeechError((error as Error).message);
    } finally {
      setDownloading(undefined);
    }
  }
  const host = URL.canParse(draft.baseUrl)
    ? new URL(draft.baseUrl).hostname
    : "";
  const usesLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const hfRouting = cleanUrl(draft.baseUrl) === huggingFace;
  const hasKey = settings.credentialEndpoints.includes(cleanUrl(draft.baseUrl));
  const separateKey =
    draft.voiceMode === "separate" &&
    cleanUrl(draft.voiceBaseUrl) !== cleanUrl(draft.baseUrl);
  const hasVoiceKey = settings.credentialEndpoints.includes(
    cleanUrl(draft.voiceBaseUrl),
  );
  const routing =
    ["fastest", "cheapest"].find((policy) =>
      draft.model.endsWith(`:${policy}`),
    ) ?? "default";
  const suggested = [
    ...new Set([draft.model, ...models, ...provider.models].filter(Boolean)),
  ];
  const matches = suggested
    .filter((id) => id.toLowerCase().includes(modelQuery.toLowerCase()))
    .slice(0, 30);
  if (modelQuery.trim() && !matches.includes(modelQuery.trim()))
    matches.push(modelQuery.trim());
  function chooseModel(id: string) {
    update({ model: id });
    setModelQuery("");
    setModelIndex(0);
  }
  function update(changes: Partial<SettingsDraft>) {
    setMessage(undefined);
    if (
      "baseUrl" in changes ||
      "model" in changes ||
      "apiKey" in changes ||
      "clearKey" in changes
    )
      setVerified(false);
    setDraft((current) => ({ ...current, ...changes }));
  }

  function selectProvider(
    next: typeof provider,
    model?: string,
    baseUrl = next.url,
  ) {
    setEditingKey(false);
    setProvider(next);
    setModelQuery("");
    setModelIndex(0);
    if (!baseUrl || cleanUrl(draft.baseUrl) === baseUrl) {
      if (model !== undefined) update({ model });
      return;
    }
    setModels([]);
    const keepVoice =
      draft.voiceMode === "same" &&
      Boolean(
        cleanUrl(draft.baseUrl) === settings.baseUrl &&
        (hasKey || settings.baseUrl !== openAI),
      );
    update({
      baseUrl,
      model: model ?? next.models[0] ?? "",
      apiKey: "",
      clearKey: false,
      voiceMode:
        draft.voiceMode === "same" && baseUrl !== openAI
          ? keepVoice
            ? "separate"
            : "off"
          : draft.voiceMode,
      voiceBaseUrl:
        keepVoice && baseUrl !== openAI ? settings.baseUrl : draft.voiceBaseUrl,
    });
  }

  function storeSavedModels(items: SavedModel[]) {
    localStorage.setItem(savedModelsKey, JSON.stringify(items));
    setSavedModels(items);
  }

  function loadSavedModel(entry: SavedModel) {
    const preset = providerFor(entry);
    setMode(
      preset && serverPresets.includes(preset)
        ? "local"
        : preset
          ? "cloud"
          : "custom",
    );
    setAdvanced(false);
    selectProvider(preset ?? custom, entry.model, entry.baseUrl);
  }

  function selectMode(next: SetupMode) {
    if (next === mode) return;
    setMode(next);
    setAdvanced(false);
    selectProvider(
      next === "local" ? ollama : next === "cloud" ? providers[0] : custom,
    );
  }

  const needsKey =
    mode === "cloud" && (!hasKey || draft.clearKey) && !draft.apiKey?.trim();
  const canConnect = Boolean(
    draft.baseUrl.trim() && draft.model.trim() && !needsKey,
  );
  const canSave =
    canConnect ||
    (cleanUrl(draft.baseUrl) === cleanUrl(settings.baseUrl) &&
      draft.model === settings.model &&
      !draft.clearKey &&
      !draft.apiKey?.trim());

  async function saveCredential(clear: boolean) {
    if (!bridge.saveCredential) return;
    setBusy("key");
    setMessage(undefined);
    try {
      const updated = await bridge.saveCredential(
        draft.baseUrl,
        draft.apiKey,
        clear,
      );
      onCredentialsChanged?.(updated);
      setDraft((current) => ({ ...current, apiKey: "", clearKey: false }));
      setEditingKey(false);
      setVerified(false);
      setMessage({
        text: clear
          ? "Saved key deleted from this device."
          : "API key saved and verified in secure storage. You can now load models.",
      });
    } catch (error) {
      setMessage({
        text: (error as Error).message.replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          "",
        ),
        error: true,
      });
    } finally {
      setBusy(undefined);
    }
  }

  async function run(action: "models" | "test" | "save") {
    setBusy(action);
    setMessage(undefined);
    try {
      if (action === "save") {
        const saved = await bridge.configure(
          openVoice
            ? draft
            : {
                ...draft,
                localRuntime: mode === "local" ? provider.name : undefined,
              },
        );
        if (!openVoice) {
          const current = {
            baseUrl: saved.baseUrl,
            model: saved.model,
            localRuntime: saved.localRuntime,
          };
          storeSavedModels(
            [
              current,
              ...savedModels.filter(
                (entry) => modelKey(entry) !== modelKey(current),
              ),
            ].slice(0, 50),
          );
        }
        onSave(saved);
      } else if (action === "test") {
        await bridge.testConnection(draft);
        setVerified(true);
        setMessage({
          text: "The selected model responded. Save to start using it.",
        });
      } else {
        const available = await bridge.models(draft);
        setModels(available);
        if (!draft.model.trim() && available.length)
          update({ model: available[0] });
        setMessage({
          text: available.length
            ? `Loaded ${available.length} server ${available.length === 1 ? "model" : "models"}.`
            : "The server has no available models.",
        });
      }
    } catch (error) {
      const detail = (
        error instanceof Error ? error.message : String(error)
      ).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      if (/could not read this saved key/i.test(detail)) setEditingKey(true);
      if (/\(429\)/.test(detail)) {
        const freeModels = provider.models.filter((id) => id.endsWith(":free"));
        const alternative =
          provider.name === "OpenRouter" && action === "test"
            ? freeModels[
                (freeModels.indexOf(draft.model) + 1) % freeModels.length
              ]
            : undefined;
        setVerified(false);
        setMessage({
          text:
            action === "test"
              ? `${draft.model} returned HTTP 429. The provider may be busy or your account may have reached its limit. Try another model or retry later.`
              : "The provider returned HTTP 429. Retry after the rate limit resets.",
          error: true,
          alternative: alternative === draft.model ? undefined : alternative,
        });
        return;
      }
      const text =
        mode === "local" && /fetch failed|ECONNREFUSED|timeout/i.test(detail)
          ? `Could not connect to ${provider.name}. Start the server and check its API URL.`
          : mode === "local" && /\(404\)/.test(detail)
            ? `${provider.name} could not find the requested model or API route. Check the API URL and load the available models.`
            : /\(401\)|\(403\)/.test(detail)
              ? "Check that the API key is issued by this service and has access to the model."
              : detail;
      setMessage({
        text,
        error: true,
      });
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <form
      className="provider-settings"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          if (!event.repeat && (openVoice || canSave) && !busy)
            void run("save");
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if ((openVoice || canSave) && !busy) void run("save");
      }}
    >
      <fieldset disabled={Boolean(busy)}>
        {!openVoice && <legend>Choose your connection</legend>}
        {!openVoice && (
          <>
            {savedModels.length > 0 && (
              <label>
                Saved chat models
                <select
                  value=""
                  onChange={(event) => {
                    const entry = savedModels.find(
                      (item) => modelKey(item) === event.target.value,
                    );
                    if (entry) loadSavedModel(entry);
                  }}
                >
                  <option value="">Choose a saved model</option>
                  {savedModels.map((entry) => {
                    const service = providerFor(entry)?.name ?? entry.baseUrl;
                    return (
                      <option value={modelKey(entry)} key={modelKey(entry)}>
                        {service} · {entry.model}
                      </option>
                    );
                  })}
                </select>
                <small>
                  Choose a saved model, then save the connection to switch.
                </small>
              </label>
            )}
            <div className="provider-catalog">
              {choices
                .filter(({ id }) => !isMobileApp || id !== "local")
                .map(({ id, title, hint, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={mode === id}
                    onClick={() => selectMode(id)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>
                      <strong>{title}</strong>
                      <small>{hint}</small>
                    </span>
                    {mode === id && <Check size={14} aria-hidden="true" />}
                  </button>
                ))}
            </div>
            {savedModels.some(
              (entry) => modelKey(entry) === modelKey(draft),
            ) && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  storeSavedModels(
                    savedModels.filter(
                      (entry) => modelKey(entry) !== modelKey(draft),
                    ),
                  )
                }
              >
                Remove from saved models
              </button>
            )}
            <div className="connection-step">
              <h3>Connection details</h3>
              {mode === "cloud" && (
                <label>
                  Service
                  <select
                    aria-label="Service"
                    value={provider.name}
                    onChange={(e) => {
                      const selected = providers.find(
                        (item) => item.name === e.target.value,
                      );
                      if (selected) selectProvider(selected);
                    }}
                  >
                    {providers.map((item) => (
                      <option key={item.name}>{item.name}</option>
                    ))}
                  </select>
                </label>
              )}
              {mode === "local" && (
                <>
                  <label>
                    Local runtime
                    <select
                      value={provider.name}
                      onChange={(event) => {
                        const runtime = serverPresets.find(
                          (item) => item.name === event.target.value,
                        );
                        if (runtime) selectProvider(runtime);
                      }}
                    >
                      {serverPresets.map((runtime) => (
                        <option key={runtime.name}>{runtime.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="connection-summary">
                    <Laptop size={18} aria-hidden="true" />
                    <div>
                      <strong>
                        {draft.model === localLfmModel
                          ? "LiquidAI LFM3-1.7B"
                          : draft.model || provider.name}
                      </strong>
                      <p>
                        {usesLoopback
                          ? `Start ${provider.name} at ${draft.baseUrl}, then load its models or enter a model ID.`
                          : "Questions and sources will be sent to the configured server."}
                      </p>
                    </div>
                  </div>
                </>
              )}
              {mode === "local" && provider === ollama && (
                <details className="setup-details">
                  <summary>
                    <ChevronRight size={14} /> First-time setup
                  </summary>
                  <ol>
                    <li>Install and start Ollama.</li>
                    <li>
                      Run{" "}
                      <code>ollama pull {draft.model || localLfmModel}</code> in
                      Terminal.
                    </li>
                    <li>
                      Click <b>Test connection</b> below.
                    </li>
                  </ol>
                </details>
              )}
              {mode === "cloud" && (
                <>
                  {hasKey && !editingKey ? (
                    <div className="credential-state">
                      <Check size={16} />
                      <span>
                        <strong>API key saved</strong>
                        <small>
                          Encrypted on this device · used automatically
                        </small>
                      </span>
                      <button type="button" onClick={() => setEditingKey(true)}>
                        Change
                      </button>
                    </div>
                  ) : (
                    <label>
                      API key{" "}
                      <small>
                        {hasKey
                          ? "Leave blank to keep the saved key"
                          : "Paste your service API key"}
                      </small>
                      <input
                        type="password"
                        autoComplete="off"
                        maxLength={4096}
                        value={draft.apiKey ?? ""}
                        onChange={(e) =>
                          update({ apiKey: e.target.value, clearKey: false })
                        }
                      />
                    </label>
                  )}
                  {(!hasKey || editingKey) && bridge.saveCredential && (
                    <div className="credential-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={!draft.apiKey?.trim()}
                        onClick={() => void saveCredential(false)}
                      >
                        Save key
                      </button>
                      {hasKey && (
                        <button
                          type="button"
                          onClick={() => {
                            update({ apiKey: "", clearKey: false });
                            setEditingKey(false);
                          }}
                        >
                          Cancel
                        </button>
                      )}
                      {hasKey && (
                        <button
                          type="button"
                          onClick={() => void saveCredential(true)}
                        >
                          Delete saved key
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            {!openVoice && (
              <section
                className="model-command"
                aria-label="Model command menu"
              >
                <div className="model-command-heading">
                  <div>
                    <small>
                      {draft.model === settings.model &&
                      cleanUrl(draft.baseUrl) === cleanUrl(settings.baseUrl)
                        ? "CURRENT MODEL"
                        : "SELECTED MODEL · NOT SAVED"}
                    </small>
                    <strong>{draft.model || "Choose a model"}</strong>
                  </div>
                  <kbd>{shortcutText(readShortcuts().model)}</kbd>
                </div>
                <p>Choose a model for new replies. Save connection to apply.</p>
                <input
                  aria-label="Search or enter a model"
                  role="combobox"
                  aria-expanded={true}
                  aria-controls="model-command-results"
                  aria-activedescendant={
                    matches.length
                      ? "model-option-" +
                        Math.min(modelIndex, matches.length - 1)
                      : undefined
                  }
                  autoComplete="off"
                  placeholder="Search models or paste a model ID…"
                  value={modelQuery}
                  onChange={(e) => {
                    setModelQuery(e.target.value);
                    setModelIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      setModelIndex((index) =>
                        Math.max(
                          0,
                          Math.min(
                            matches.length - 1,
                            index + (e.key === "ArrowDown" ? 1 : -1),
                          ),
                        ),
                      );
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const id =
                        matches[Math.min(modelIndex, matches.length - 1)];
                      if (id) chooseModel(id);
                    }
                  }}
                />
                <div
                  id="model-command-results"
                  role="listbox"
                  aria-label="Models"
                  className="model-command-results"
                >
                  {matches.map((id, index) => (
                    <button
                      type="button"
                      role="option"
                      id={"model-option-" + index}
                      aria-selected={id === draft.model}
                      key={id}
                      className={
                        index === modelIndex ? "command-highlight" : ""
                      }
                      onClick={() => chooseModel(id)}
                    >
                      <span>{id}</span>
                      {id === draft.model && <Check size={14} />}
                    </button>
                  ))}
                  {!matches.length && (
                    <p>Load models from your server or enter a model ID.</p>
                  )}
                </div>
                <div className="model-command-footer">
                  <small>↑ ↓ to navigate · Enter to select</small>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!draft.baseUrl.trim() || needsKey}
                    onClick={() => void run("models")}
                  >
                    Load models
                  </button>
                </div>
              </section>
            )}
            {mode !== "custom" && (
              <button
                type="button"
                className="advanced-toggle"
                aria-expanded={advanced}
                onClick={() => setAdvanced(!advanced)}
              >
                <ChevronRight size={14} /> Server URL and model
              </button>
            )}
            {(mode === "custom" || advanced) && (
              <div className="advanced-connection">
                {mode === "custom" && (
                  <div className="model-presets">
                    {serverPresets.map((item) => (
                      <button
                        type="button"
                        key={item.name}
                        className="secondary"
                        onClick={() => selectProvider(item)}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
                <label>
                  API URL
                  <input
                    type="url"
                    required
                    value={draft.baseUrl}
                    onChange={(e) => {
                      setModels([]);
                      update({
                        baseUrl: e.target.value,
                        apiKey: "",
                        clearKey: false,
                      });
                    }}
                  />
                </label>
                {mode !== "cloud" && (
                  <>
                    <label>
                      API key{" "}
                      <small>
                        {hasKey
                          ? "A key is saved for this URL"
                          : "If your server requires one"}
                      </small>
                      <input
                        type="password"
                        autoComplete="off"
                        maxLength={4096}
                        value={draft.apiKey ?? ""}
                        onChange={(e) =>
                          update({ apiKey: e.target.value, clearKey: false })
                        }
                      />
                    </label>
                    {hasKey && (
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.clearKey)}
                          onChange={(e) =>
                            update({ clearKey: e.target.checked, apiKey: "" })
                          }
                        />
                        Delete the saved key for this URL
                      </label>
                    )}
                  </>
                )}
                {hfRouting && (
                  <label>
                    Hugging Face routing
                    <select
                      value={routing}
                      onChange={(e) =>
                        update({
                          model:
                            draft.model.split(":")[0] +
                            (e.target.value === "default"
                              ? ""
                              : `:${e.target.value}`),
                        })
                      }
                    >
                      <option value="default">
                        Use the model’s default route
                      </option>
                      <option value="fastest">Fastest</option>
                      <option value="cheapest">Lowest cost</option>
                    </select>
                  </label>
                )}
              </div>
            )}
          </>
        )}
        {openVoice && (
          <section className="voice-settings">
            <label>
              Connection type
              <select
                aria-label="Connection type"
                value={draft.voiceMode}
                onChange={(e) => {
                  const voiceMode = e.target.value as Settings["voiceMode"];
                  update({
                    voiceMode,
                    transcriptionModel:
                      voiceMode === "local"
                        ? localModel
                        : isSpeechPreset(draft.transcriptionModel) && localVoice
                          ? "gpt-4o-mini-transcribe"
                          : draft.transcriptionModel,
                  });
                }}
              >
                {!isMobileApp && <option value="local">Local Whisper</option>}
                <option value="off">Disabled</option>
                <option value="same">Same server as chat</option>
                <option value="separate">Separate server</option>
              </select>
            </label>
            {localVoice && (
              <>
                <LocalSpeechSetup
                  model={localModel}
                  status={speechStatus}
                  downloading={downloading}
                  onChange={(model) => update({ transcriptionModel: model })}
                  onDownload={(model) => void downloadSpeech(model)}
                />
                {speechError && (
                  <p className="provider-feedback provider-error" role="alert">
                    {speechError}
                  </p>
                )}
              </>
            )}
            {draft.voiceMode === "separate" && (
              <label>
                Speech-to-text API URL
                <input
                  required
                  type="url"
                  value={draft.voiceBaseUrl}
                  onChange={(e) =>
                    update({
                      voiceBaseUrl: e.target.value,
                      voiceApiKey: "",
                      clearVoiceKey: false,
                    })
                  }
                />
              </label>
            )}
            {separateKey && (
              <label>
                Speech-to-text API key{" "}
                <small>
                  {hasVoiceKey
                    ? "A key is saved for this URL"
                    : "If your server requires one"}
                </small>
                <input
                  type="password"
                  maxLength={4096}
                  autoComplete="off"
                  value={draft.voiceApiKey ?? ""}
                  onChange={(e) =>
                    update({
                      voiceApiKey: e.target.value,
                      clearVoiceKey: false,
                    })
                  }
                />
              </label>
            )}
            {separateKey && hasVoiceKey && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={Boolean(draft.clearVoiceKey)}
                  onChange={(e) =>
                    update({ clearVoiceKey: e.target.checked, voiceApiKey: "" })
                  }
                />
                Delete the saved speech server key
              </label>
            )}
            {(draft.voiceMode === "same" || draft.voiceMode === "separate") && (
              <label>
                Speech-to-text model
                <input
                  required
                  maxLength={200}
                  value={draft.transcriptionModel}
                  onChange={(e) =>
                    update({ transcriptionModel: e.target.value })
                  }
                />
              </label>
            )}
            {(draft.voiceMode === "same" || draft.voiceMode === "separate") && (
              <>
                {voiceUrl === openAI && (
                  <div
                    className="model-presets"
                    aria-label="OpenAI speech models"
                  >
                    {[
                      "gpt-4o-mini-transcribe",
                      "gpt-4o-transcribe",
                      "whisper-1",
                    ].map((model) => (
                      <button
                        type="button"
                        className="secondary"
                        key={model}
                        aria-pressed={model === draft.transcriptionModel}
                        onClick={() => update({ transcriptionModel: model })}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}
                <p className="provider-hint">
                  The speech server must support the audio/transcriptions API.
                </p>
              </>
            )}
            {draft.voiceMode !== "off" && (
              <MicrophoneTest
                draft={draft}
                target={voiceTarget}
                blocked={speechBlocked}
                deviceId={microphoneId}
                onDeviceChange={onMicrophoneChange}
              />
            )}
          </section>
        )}
        {busy && (
          <ThinkingLoader
            label={
              busy === "test"
                ? "Testing model response…"
                : busy === "models"
                  ? "Loading models…"
                  : busy === "key"
                    ? "Waiting for secure storage…"
                    : "Saving…"
            }
          />
        )}
        {message && (
          <div
            className={`provider-feedback ${message.error ? "provider-error" : ""}`}
          >
            <span role="status">{message.text}</span>
            {message.alternative && (
              <button
                type="button"
                className="secondary"
                onClick={() => chooseModel(message.alternative!)}
              >
                Select {message.alternative}
              </button>
            )}
          </div>
        )}
        <div className="provider-actions">
          {!openVoice && (
            <button
              type="button"
              className={verified ? "secondary" : "primary"}
              disabled={!canConnect}
              onClick={() => void run("test")}
            >
              Test connection
            </button>
          )}
          <button
            className={verified || openVoice ? "primary" : "secondary"}
            type="submit"
            disabled={!openVoice && !canSave}
          >
            {openVoice ? "Save speech settings" : "Save connection"}
          </button>
        </div>
        {!openVoice && mode === "cloud" && (
          <p className="provider-hint">
            The connection test sends one short message. Service fees may apply.
          </p>
        )}
      </fieldset>
    </form>
  );
}
