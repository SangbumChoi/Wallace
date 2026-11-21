const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  migrateSettings,
  settingsConfig,
  publicSettings,
  speechConfig,
} = require("../electron/ai-settings.cjs");

test("legacy settings keep their key at the old endpoint and retain shared transcription", () => {
  const previous = migrateSettings({
    baseUrl: "http://localhost:7000/v1/",
    model: "legacy-model",
    encryptedKey: "encrypted-legacy-key",
  });
  assert.equal(previous.voiceMode, "same");
  assert.deepEqual(previous.encryptedKeys, {
    "http://localhost:7000/v1": "encrypted-legacy-key",
  });
  const switched = publicSettings({
    ...previous,
    baseUrl: "https://router.huggingface.co/v1",
  });
  assert.equal(switched.hasKey, false);
  assert.deepEqual(switched.credentialEndpoints, ["http://localhost:7000/v1"]);
  assert.equal(switched.encryptedKeys, undefined);
});

test("local speech preserves the installed Base default and validates explicit presets", () => {
  assert.equal(
    migrateSettings({ voiceMode: "local" }).transcriptionModel,
    "whisper-base",
  );
  assert.equal(
    speechConfig({ voiceMode: "local", transcriptionModel: "whisper-tiny" })
      .transcriptionModel,
    "whisper-tiny",
  );
  assert.equal(
    speechConfig({ voiceMode: "local", transcriptionModel: "whisper-small" })
      .transcriptionModel,
    "whisper-small",
  );
  assert.throws(
    () =>
      speechConfig({
        voiceMode: "local",
        transcriptionModel: "../whisper-base",
      }),
    /Whisper/,
  );
});

test("separate voice and chat endpoints are normalized and validated", () => {
  const value = settingsConfig({
    baseUrl: "http://localhost:11434/v1/",
    model: " llama3.2 ",
    voiceMode: "separate",
    voiceBaseUrl: "https://api.openai.com/v1/",
    transcriptionModel: "whisper-1",
  });
  assert.equal(value.baseUrl, "http://localhost:11434/v1");
  assert.equal(value.model, "llama3.2");
  assert.equal(value.voiceBaseUrl, "https://api.openai.com/v1");
  assert.throws(() =>
    settingsConfig({ ...value, voiceBaseUrl: "http://external.example/v1" }),
  );
});
