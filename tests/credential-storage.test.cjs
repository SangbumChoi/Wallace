const { test } = require("node:test");
const assert = require("node:assert/strict");
const { credentialStorage } = require("../electron/credential-storage.cjs");

test("failed verification does not produce a credential to store", async () => {
  const store = credentialStorage({
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async () => Buffer.from("test ciphertext"),
    decryptStringAsync: async () => ({ result: "mismatched secret" }),
  });
  await assert.rejects(store.encode("example key"), /Could not verify the key/);
});

test("waiting for Keychain has a deadline", async () => {
  const store = credentialStorage(
    {
      decryptStringAsync: () => new Promise(() => {}),
    },
    10,
  );
  await assert.rejects(
    store.read("dGVzdA=="),
    /Secure storage did not respond/,
  );
});
