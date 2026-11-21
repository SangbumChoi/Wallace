const fs = require("node:fs/promises");
const { cloudEndpoint } = require("../shared/cloud.mjs");
const { atomicWrite } = require("./core.cjs");

function cloudClient(file, safeStorage) {
  async function read() {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  async function request(method, options) {
    const config = await read();
    if (!config) throw new Error("Connect to a shared server first.");
    const { result: key } = await safeStorage.decryptStringAsync(
      Buffer.from(config.key, "base64"),
    );
    const url =
      config.url +
      "/v1/workspace" +
      (method === "GET" && options
        ? `?since=${encodeURIComponent(options.since)}`
        : "");
    const result = await fetch(url, {
      method,
      headers: {
        Authorization: "Bearer " + key,
        ...(method === "PUT" && { "Content-Type": "application/json" }),
      },
      body: method === "PUT" ? JSON.stringify(options) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (result.status === 304 || result.status === 404)
      return { status: result.status };
    const value = await result.json();
    if (result.status === 200 || result.status === 409)
      return { ...value, status: result.status };
    throw new Error(value.error || "Could not connect to the shared server.");
  }
  return {
    async link() {
      const config = await read();
      return (
        config && {
          url: config.url,
          revision: config.revision,
          fingerprint: config.fingerprint,
        }
      );
    },
    async configure(url, key) {
      const base = cloudEndpoint(url);
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(key))
        throw new Error("Check your shared workspace access key.");
      if (!(await safeStorage.isAsyncEncryptionAvailable()))
        throw new Error("Secure storage is unavailable on this device.");
      const existing = await read();
      if (existing && existing.url !== base)
        throw new Error("Disconnect from the current server first.");
      await atomicWrite(file, {
        url: base,
        key: (await safeStorage.encryptStringAsync(key)).toString("base64"),
        revision: existing?.revision ?? 0,
        fingerprint: existing?.fingerprint,
      });
    },
    async checkpoint(revision, fingerprint) {
      if (
        !Number.isSafeInteger(revision) ||
        revision < 0 ||
        !/^[a-f0-9]{64}$/.test(fingerprint)
      )
        throw new Error("The shared revision is invalid.");
      const config = await read();
      if (!config) throw new Error("Connect to a shared server first.");
      await atomicWrite(file, { ...config, revision, fingerprint });
    },
    fetch: (options) => request("GET", options),
    push: (baseRevision, workspace) =>
      request("PUT", { baseRevision, workspace }),
    disconnect: () =>
      fs.unlink(file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      }),
  };
}
module.exports = { cloudClient };
