const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
(async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "wallace-index-ui-"),
  );
  await fs.writeFile(
    path.join(directory, "workspace.json"),
    JSON.stringify(require("../src/data.ts").seed),
  );
  let calls = 0;
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== "Bearer fixture-embedding-secret") {
      res.writeHead(401).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    if (req.url.endsWith("/models")) {
      res.end(JSON.stringify({ data: [{ id: "fixture-embed" }] }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const { input } = JSON.parse(body);
    calls++;
    res.end(
      JSON.stringify({
        data: input.map((text, index) => ({
          index,
          embedding: [text.length / 10000, 1, 0],
        })),
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let app;
  try {
    app = await electron.launch({
      args: ["."],
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, WALLACE_TEST_USER_DATA: directory },
    });
    const page = await app.firstWindow();
    await page.getByLabel("Ask AI", { exact: true }).waitFor();
    await page.keyboard.press("Meta+Shift+m");
    await page.getByRole("button", { name: "Embeddings & index" }).click();
    await page
      .getByRole("button", { name: "Update index", exact: true })
      .click();
    await page
      .getByText("Index updated. Unchanged embeddings were reused.", {
        exact: true,
      })
      .waitFor();
    assert.equal(calls, 0);
    await page.getByLabel("Test workspace search").fill("Product vision");
    await page
      .getByRole("button", { name: "Search notes", exact: true })
      .click();
    await expect(page.locator(".index-results")).toContainText(
      "Product vision",
    );
    await page.getByRole("button", { name: /Hybrid Keyword matches/ }).click();
    await page
      .getByLabel("Embedding server URL")
      .fill("http://127.0.0.1:" + server.address().port + "/v1");
    await page.getByLabel(/^API key/).fill("fixture-embedding-secret");
    await page.getByRole("button", { name: "Load server models" }).click();
    await page
      .getByText("Server models loaded. Choose an embedding model and test it.")
      .waitFor();
    await page
      .getByLabel("Embedding model", { exact: true })
      .fill("fixture-embed");
    await page.getByRole("button", { name: "Test embedding model" }).click();
    await page.getByText("Embedding model responded · 3 dimensions.").waitFor();
    await page.getByRole("button", { name: "Save search settings" }).click();
    await page.getByText("Search settings saved.", { exact: true }).waitFor();
    assert.equal(
      (
        await fs.readFile(
          path.join(directory, "retrieval-settings.json"),
          "utf8",
        )
      ).includes("fixture-embedding-secret"),
      false,
    );
    await page
      .getByRole("button", { name: "Update index", exact: true })
      .click();
    await page
      .getByText("Index updated. Unchanged embeddings were reused.", {
        exact: true,
      })
      .waitFor();
    const indexedCalls = calls;
    await page
      .getByRole("button", { name: "Update index", exact: true })
      .click();
    await page
      .getByText("Index updated. Unchanged embeddings were reused.", {
        exact: true,
      })
      .waitFor();
    assert.equal(calls, indexedCalls);
    await page.getByLabel("Test workspace search").fill("related ideas");
    await page
      .getByRole("button", { name: "Search notes", exact: true })
      .click();
    await page.getByText("Hybrid results", { exact: true }).waitFor();
    await page.screenshot({ path: "test-results/search-settings-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", {
        name: "Hybrid Keyword matches + semantic embeddings",
      })
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: "test-results/search-settings-mobile.png" });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByRole("button", { name: "Clear index", exact: true })
      .click();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByText("Not built yet", { exact: true }).waitFor();
    console.log(
      "Search desktop passed: keyword indexing, embedding model listing/test, encrypted key, incremental indexing, hybrid results, clearing, and mobile layout.",
    );
  } finally {
    await app?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
