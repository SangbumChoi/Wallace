const { _electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { Workbook } = require("exceljs");

(async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "wallace-knowledge-"),
  );
  const prompts = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const prompt = body.messages.at(-1).content;
    prompts.push(prompt);
    const compact = body.messages[0].content.includes(
      "concise reusable knowledge note",
    );
    const content = compact
      ? "The Atlas onboarding pilot tracks activation."
      : [
          "Here are two files.",
          "",
          "```html index.html",
          "<h1>Atlas onboarding pilot</h1>",
          "```",
          "",
          "```xlsx metrics.xlsx",
          "Metric,Value",
          "Activation,14",
          "```",
        ].join("\n");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        model: "fixture-chat",
        choices: [{ message: { content } }],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const launch = () =>
    _electron.launch({
      args: ["."],
      env: { ...process.env, WALLACE_TEST_USER_DATA: directory },
    });
  let app;
  try {
    app = await launch();
    let page = await app.firstWindow();
    await page
      .getByRole("heading", { name: "What would you like to think through?" })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: /^Open conversation:/ }).count(),
      0,
    );
    await page.evaluate(
      async (port) =>
        window.wallace.configure({
          ...(await window.wallace.settings()),
          baseUrl: "http://127.0.0.1:" + port + "/v1",
          model: "fixture-chat",
        }),
      server.address().port,
    );

    const book = new Workbook();
    book.addWorksheet("Pilot").addRows([
      ["Metric", "Value"],
      ["Activation", 14],
    ]);
    await page.locator('input[type="file"]').setInputFiles({
      name: "pilot.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    });
    await page.getByText("1 file", { exact: true }).waitFor();
    await page
      .getByLabel("Ask AI", { exact: true })
      .fill("Atlas onboarding pilot");
    await page.getByRole("button", { name: "Send question" }).click();
    await page.getByRole("button", { name: "Download index.html" }).waitFor();
    await page.getByRole("button", { name: "Download metrics.xlsx" }).waitFor();
    assert.match(prompts[0], /Activation \| 14/);
    const saved = page.getByRole("button", { name: "Open saved note" });
    await page
      .getByRole("button", { name: "End conversation", exact: true })
      .click();
    await saved.waitFor();
    await expect(
      page.getByRole("complementary", { name: "Connection graph" }),
    ).toBeVisible();
    assert.match(prompts[1], /pilot.xlsx/);
    await page.getByRole("button", { name: "Reopen conversation" }).waitFor();
    await page.screenshot({
      path: "test-results/ended-conversation-graph.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("complementary", { name: "Connection graph" }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    await page.screenshot({
      path: "test-results/ended-conversation-mobile.png",
    });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page
      .getByRole("heading", { name: "What would you like to think through?" })
      .waitFor();
    const stored = await page.evaluate(() => window.wallace.load());
    const first = stored.conversations[0];
    assert(first.archived && first.endedAt && first.compactPageId);
    assert.equal(stored.pages.length, 4);
    assert.equal(
      stored.edges.filter((edge) => edge.source === first.compactPageId).length,
      3,
    );
    const generated = stored.pages.find(
      (node) => node.title === "metrics.xlsx",
    );
    const restoredBook = new Workbook();
    await restoredBook.xlsx.load(
      Buffer.from(generated.attachment.data, "base64"),
    );
    assert.equal(restoredBook.worksheets[0].getCell("A2").text, "Activation");
    await page
      .getByLabel("Ask AI", { exact: true })
      .fill("Atlas onboarding pilot follow-up");
    await page.getByRole("button", { name: "Send question" }).click();
    await page.getByRole("button", { name: "Download index.html" }).waitFor();
    await page
      .getByRole("button", { name: "End conversation", exact: true })
      .click();
    await page.getByRole("button", { name: "Open saved note" }).waitFor();
    await page.waitForFunction(
      (id) =>
        window.wallace
          .load()
          .then((w) => w?.edges.some((e) => e.target === id)),
      first.compactPageId,
    );
    const search = page.getByLabel("Search notes and conversations");
    await search.fill("Activation");
    await expect(
      page
        .getByRole("region", { name: "Matching notes" })
        .getByRole("button", { name: "pilot.xlsx" }),
    ).toBeVisible();
    await search.clear();
    await page.keyboard.press("Meta+Shift+m");
    await page.getByRole("button", { name: "Tools & MCP" }).click();
    for (const name of ["Google Drive", "Google Calendar", "Slack", "Notion"])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    await page
      .getByRole("button", { name: "Google Calendar", exact: true })
      .click();
    await expect(page.getByLabel("Server URL", { exact: true })).toHaveValue(
      "https://calendarmcp.googleapis.com/mcp/v1",
    );
    console.log(
      "Verified blank workspace, Excel upload and generation, one-click ending, persisted graph links, mobile panel, and MCP presets.",
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
