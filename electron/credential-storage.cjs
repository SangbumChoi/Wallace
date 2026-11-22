const { setTimeout: delay } = require("node:timers/promises");

function credentialStorage(storage, timeoutMs = 30000) {
  const timedOut = Symbol("secure storage timed out");

  async function withDeadline(operation, failure) {
    const timer = new AbortController();
    try {
      return await Promise.race([
        operation(),
        delay(timeoutMs, undefined, { signal: timer.signal }).then(() => {
          throw timedOut;
        }),
      ]);
    } catch (error) {
      if (error === timedOut) {
        throw new Error(
          "Secure storage did not respond. Check for a macOS Keychain prompt, unlock your Keychain if needed, and try again.",
        );
      }
      throw new Error(failure);
    } finally {
      timer.abort();
    }
  }

  return {
    read(encoded) {
      return withDeadline(async () => {
        const { result } = await storage.decryptStringAsync(
          Buffer.from(encoded, "base64"),
        );
        if (!result) throw new Error("Empty credential.");
        return result;
      }, "Wallace could not read this saved key. Allow Keychain access if prompted, then use Change to enter the key again if needed.");
    },
    encode(key) {
      return withDeadline(async () => {
        if (!(await storage.isAsyncEncryptionAvailable()))
          throw new Error("Encryption unavailable.");
        const ciphertext = await storage.encryptStringAsync(key);
        const { result } = await storage.decryptStringAsync(ciphertext);
        if (result !== key) throw new Error("Credential verification failed.");
        return ciphertext.toString("base64");
      }, "Could not verify the key in secure storage. Allow Keychain access if prompted, then save again. The previous saved key has been kept.");
    },
  };
}

module.exports = { credentialStorage };
