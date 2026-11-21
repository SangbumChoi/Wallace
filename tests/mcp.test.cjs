const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const z = require("zod");
const { mcpConnections } = require("../electron/mcp.cjs");
const { randomBytes, createCipheriv, createDecipheriv } = require("node:crypto");

test("MCP connects, lists and runs tools, preserves encrypted credentials and deletes connections", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "wallace-mcp-test-"));
  const key = randomBytes(32);
  const storage = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async text => {
      const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decryptStringAsync: async buffer => {
      const decipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
      decipher.setAuthTag(buffer.subarray(12, 28));
      return { result: Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString() };
    }
  };
  let calls = 0;
  const transports = [];
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== "Bearer test-mcp-secret") { res.writeHead(401).end(); return; }
    if (req.method !== "POST") { res.writeHead(405).end(); return; }
    const mcp = new McpServer({ name: "fixture", version: "1.0" });
    mcp.registerTool("echo", { inputSchema: { message: z.string() } }, async ({ message }) => { calls++; return { content: [{ type: "text", text: message }] }; });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    transports.push(transport);
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const file = path.join(directory, "connections.json");
  const mcp = mcpConnections(file, storage);
  try {
    const url = "http://127.0.0.1:" + server.address().port + "/mcp";
    const saved = await mcp.save({ name: "Fixture", url, token: "test-mcp-secret" });
    assert.equal(saved.hasToken, true);
    assert.equal("token" in saved, false);
    assert.equal((await fs.readFile(file, "utf8")).includes("test-mcp-secret"), false);
    assert.equal((await mcp.tools(saved.id))[0].name, "echo");
    assert.equal(calls, 0, "Discovery must not execute a tool");
    assert.deepEqual(await mcp.call(saved.id, "echo", { message: "Verified tool result" }), { text: "Verified tool result", isError: false });
    assert.equal(calls, 1);
    await mcp.save({ ...saved, name: "Renamed", token: "" });
    assert.equal((await mcpConnections(file, storage).list())[0].hasToken, true);
    await assert.rejects(mcp.call(saved.id, "unknown", {}));
    await assert.rejects(mcp.save({ name: "Unsafe", url: "http://example.com/mcp", token: "secret" }));
    await assert.rejects(mcp.save({ name: "Unsafe", url: "https://example.com/mcp?token=secret" }));
    await mcp.save({ ...saved, clearToken: true });
    assert.equal((await mcp.list())[0].hasToken, false);
    await mcp.remove(saved.id);
    assert.deepEqual(await mcp.list(), []);
  } finally {
    await Promise.all(transports.map(item => item.close()));
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
