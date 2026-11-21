const { endpoint } = require("./core.cjs");
const { speechModel } = require("./local-stt.cjs");

const defaultEndpoint = "https://api.openai.com/v1";
const defaults = {
  baseUrl: defaultEndpoint,
  model: "gpt-4.1-mini",
  voiceMode: "same",
  voiceBaseUrl: defaultEndpoint,
  transcriptionModel: "gpt-4o-mini-transcribe",
};

function migrateSettings(raw) {
  const { encryptedKey, encryptedKeys = {}, ...settings } = raw;
  const config = { ...defaults, ...settings };
  config.baseUrl = endpoint(config.baseUrl);
  config.voiceBaseUrl = endpoint(config.voiceBaseUrl);
  if (config.voiceMode === "local")
    config.transcriptionModel = speechModel(raw.transcriptionModel);
  return {
    ...config,
    encryptedKeys: {
      ...(encryptedKey ? { [config.baseUrl]: encryptedKey } : {}),
      ...encryptedKeys,
    },
  };
}

function validateModel(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 200)
    throw new Error("Enter a model name of up to 200 characters.");
  return value.trim();
}

function connectionConfig(input) {
  if (!input || typeof input.baseUrl !== "string")
    throw new Error("Enter the API URL.");
  return {
    baseUrl: endpoint(input.baseUrl.trim()),
    model: validateModel(input.model),
  };
}

function settingsConfig(input) {
  const chat = connectionConfig(input);
  return {
    ...chat,
    ...speechConfig(input),
    ...(["Ollama", "vLLM", "llama.cpp", "SGLang"].includes(
      input.localRuntime,
    ) && { localRuntime: input.localRuntime }),
    ...(input.compactModel?.trim() && {
      compactModel: validateModel(input.compactModel),
    }),
  };
}

function speechConfig(input) {
  const voiceMode = input.voiceMode ?? "same";
  if (!["local", "same", "separate", "off"].includes(voiceMode))
    throw new Error("Choose a speech-to-text connection.");
  return {
    voiceMode,
    voiceBaseUrl:
      voiceMode === "separate" ? endpoint(input.voiceBaseUrl) : defaultEndpoint,
    transcriptionModel:
      voiceMode === "local"
        ? speechModel(input.transcriptionModel)
        : voiceMode === "off"
          ? defaults.transcriptionModel
          : validateModel(input.transcriptionModel),
  };
}

function publicSettings(settings) {
  const { encryptedKeys, ...config } = settings;
  return {
    ...config,
    hasKey: Boolean(encryptedKeys[config.baseUrl]),
    credentialEndpoints: Object.keys(encryptedKeys),
  };
}

module.exports = {
  defaults,
  migrateSettings,
  connectionConfig,
  settingsConfig,
  speechConfig,
  publicSettings,
};
