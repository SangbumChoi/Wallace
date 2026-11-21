const fs = require("node:fs/promises");
const path = require("node:path");
const {
  validateWorkspace,
  endpoint,
  contextFor,
} = require("../shared/workspace.mjs");
async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}
async function request(base, key, route, options, fetcher = fetch) {
  const response = await fetcher(`${endpoint(base)}/${route}`, {
    ...options,
    redirect: "error",
    headers: {
      ...options.headers,
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok)
    throw new Error(
      `AI server request failed (${response.status}). Check your API key, model name, and usage limits.`,
    );
  return response.json();
}
module.exports = {
  validateWorkspace,
  atomicWrite,
  endpoint,
  contextFor,
  request,
};
