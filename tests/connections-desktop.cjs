const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const z = require("zod");
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "wallace-connections-"));
  const transports = [];
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== "Bearer fixture-mcp-token") { res.writeHead(401).end(); return; }
    if (req.method !== "POST") { res.writeHead(405).end(); return; }
    const mcp = new McpServer({ name: "fixture", version: "1" });
    mcp.registerTool("lookup", { description: "Look up a test note", inputSchema: { topic: z.string() } }, async ({ topic }) => ({ content: [{ type: "text", text: "Found: " + topic }] }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    transports.push(transport);
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let app;
  try {
    const launch = () => electron.launch({ args: ["."], cwd: path.resolve(__dirname, ".."), env: { ...process.env, WALLACE_TEST_USER_DATA: directory } });
    app = await launch();
    let page = await app.firstWindow();
    await page.getByLabel("Ask AI", { exact: true }).waitFor();
    await page.keyboard.press("Meta+Shift+m");
    await expect(page.getByRole("combobox", { name: "Search or enter a model" })).toBeFocused();
    await page.getByLabel(/^API key/).fill("fixture-provider-token");
    await page.getByRole("button", { name: "Save key", exact: true }).click();
    await page.getByText("API key saved", { exact: true }).waitFor();
    assert.equal((await fs.readFile(path.join(directory, "settings.json"), "utf8")).includes("fixture-provider-token"), false);
    const saved = await page.evaluate(() => window.wallace.settings());
    assert.equal(saved.hasKey, true);
    assert.equal(JSON.stringify(saved).includes("fixture-provider-token"), false);
    await page.screenshot({ path: "test-results/connections-desktop.png" });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByLabel("Ask AI", { exact: true }).waitFor();
    await app.evaluate(() => {
      const original = globalThis.fetch;
      globalThis.fetch = (url, options) => {
        if (url !== "https://api.openai.com/v1/chat/completions") return original(url, options);
        return Promise.resolve(options.headers.Authorization === "Bearer fixture-provider-token"
          ? Response.json({ choices: [{ message: { content: "OK" } }] })
          : new Response(null, { status: 401 }));
      };
    });
    await page.keyboard.press("Meta+Shift+m");
    await page.getByRole("button", { name: "Test connection", exact: true }).click();
    await page.getByText("The selected model responded. Save to start using it.").waitFor();

    await page.getByRole("button", { name: "Tools & MCP", exact: true }).click();
    await page.getByRole("button", { name: "Add connection" }).click();
    await page.getByLabel("Connection name").fill("Knowledge source");
    await page.getByLabel("Server URL", { exact: true }).fill("http://127.0.0.1:" + server.address().port + "/mcp");
    await page.getByLabel(/^Access token/).fill("fixture-mcp-token");
    await page.getByRole("button", { name: "Save and connect" }).click();
    await page.getByRole("button", { name: "Run tool", exact: true }).waitFor();
    await page.getByLabel("topic").fill("Workspace purpose");
    await page.getByRole("button", { name: "Run tool", exact: true }).click();
    await page.getByText("Found: Workspace purpose", { exact: true }).waitFor();
    assert.equal((await fs.readFile(path.join(directory, "mcp-connections.json"), "utf8")).includes("fixture-mcp-token"), false);
    await page.screenshot({ path: "test-results/mcp-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: "test-results/mcp-mobile.png" });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("button", { name: "Use in conversation" }).click();
    await expect(page.getByLabel("Ask AI", { exact: true })).toContainText("Found: Workspace purpose");
    await page.keyboard.press("Meta+Shift+m");
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.getByRole("button", { name: "Delete saved key" }).click();
    await page.getByText("Saved key deleted from this device.", { exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.wallace.settings())).hasKey, false);
    console.log("Connections passed: native encrypted key save/delete, MCP authentication, discovery, tool inputs/results, draft handoff, desktop and mobile.");
  } finally {
    await app?.close();
    await Promise.all(transports.map(transport => transport.close()));
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
