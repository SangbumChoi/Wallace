const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { atomicWrite } = require("./core.cjs");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

function mcpConnections(file, storage) {
  let queue = Promise.resolve();
  async function read() {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
  function mutate(fn) {
    const next = queue.then(fn);
    queue = next.catch(() => {});
    return next;
  }
  function publicConnection(item) {
    return {
      id: item.id,
      name: item.name,
      url: item.url,
      hasToken: !!item.token,
    };
  }
  function endpoint(value) {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    )
      throw Error(
        "Use HTTPS, or HTTP on localhost. Put tokens in the token field, not the URL.",
      );
    return url.href;
  }
  async function session(id, action) {
    const item = (await read()).find((item) => item.id === id);
    if (!item) throw Error("This MCP connection no longer exists.");
    const token = item.token
      ? (await storage.decryptStringAsync(Buffer.from(item.token, "base64")))
          .result
      : "";
    const client = new Client({ name: "Wallace", version: "0.10.8" });
    const transport = new StreamableHTTPClientTransport(new URL(item.url), {
      requestInit: {
        headers: token ? { Authorization: "Bearer " + token } : {},
      },
      fetch: (url, options) =>
        fetch(url, {
          ...options,
          redirect: "error",
          signal: AbortSignal.any([
            ...(options?.signal ? [options.signal] : []),
            AbortSignal.timeout(30000),
          ]),
        }),
    });
    try {
      await client.connect(transport, { timeout: 15000 });
      return await action(client);
    } catch {
      throw Error(
        "MCP request failed. Check the server URL, token, tool inputs, and Streamable HTTP support.",
      );
    } finally {
      await client.close().catch(() => {});
    }
  }
  async function tools(client) {
    const result = [];
    let cursor;
    for (let page = 0; page < 20; page++) {
      const response = await client.listTools(cursor ? { cursor } : {});
      result.push(...response.tools);
      cursor = response.nextCursor;
      if (!cursor) return result;
    }
    throw Error("This server returned too many pages of tools.");
  }
  return {
    list: async () => (await read()).map(publicConnection),
    save: (input) =>
      mutate(async () => {
        const entries = await read();
        const url = endpoint(input.url);
        const old = input.id
          ? entries.find((item) => item.id === input.id)
          : entries.find((item) => item.url === url);
        if (input.id && !old) throw Error("Connection not found.");
        if (
          typeof input.name !== "string" ||
          !input.name.trim() ||
          input.name.length > 120
        )
          throw Error("Enter a connection name.");
        if (
          input.token !== undefined &&
          (typeof input.token !== "string" ||
            input.token.length > 4096 ||
            /[\r\n]/.test(input.token))
        )
          throw Error("Invalid token.");
        let token = old?.url === url ? old.token : undefined;
        if (input.clearToken) token = undefined;
        else if (input.token?.trim()) {
          if (!(await storage.isAsyncEncryptionAvailable()))
            throw Error("Secure storage is unavailable.");
          token = (
            await storage.encryptStringAsync(input.token.trim())
          ).toString("base64");
        }
        const item = {
          id: old?.id ?? randomUUID(),
          name: input.name.trim(),
          url,
          token,
        };
        await atomicWrite(file, [
          ...entries.filter((entry) => entry.id !== item.id),
          item,
        ]);
        return publicConnection(item);
      }),
    remove: (id) =>
      mutate(async () =>
        atomicWrite(
          file,
          (await read()).filter((item) => item.id !== id),
        ),
      ),
    tools: (id) => session(id, tools),
    call: (id, name, args) =>
      session(id, async (client) => {
        if (
          !args ||
          typeof args !== "object" ||
          Array.isArray(args) ||
          JSON.stringify(args).length > 50000
        )
          throw Error("Enter valid tool inputs.");
        if (!(await tools(client)).some((tool) => tool.name === name))
          throw Error("Tool not found.");
        const result = await client.callTool(
          { name, arguments: args },
          undefined,
          { timeout: 60000 },
        );
        // Only text is returned to the renderer. Tool output is never executed as HTML.
        const text = (result.content ?? [])
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n");
        return {
          text: (
            text ||
            JSON.stringify(result.structuredContent ?? "No text returned.")
          ).slice(0, 50000),
          isError: !!result.isError,
        };
      }),
  };
}
module.exports = { mcpConnections };
