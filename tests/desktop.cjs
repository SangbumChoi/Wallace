const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "wallace-native-"));
  await fs.writeFile(
    path.join(directory, "workspace.json"),
    JSON.stringify(require("../src/data.ts").seed),
  );
  let app;
  let nextAiResponse;
  let releaseAiResponse;
  function holdNextAiResponse() {
    nextAiResponse = new Promise((resolve) => {
      releaseAiResponse = resolve;
    });
  }
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, body, headers: req.headers });
    if (req.url.endsWith("/chat/completions") && nextAiResponse) {
      const waiting = nextAiResponse;
      nextAiResponse = undefined;
      if ((await waiting) === "fail") {
        res.writeHead(503);
        res.end();
        return;
      }
    }
    res.setHeader("Content-Type", "application/json");
    if (req.url.endsWith("/models")) {
      res.end(JSON.stringify({ data: [{ id: "llama-test-model" }] }));
      return;
    }
    res.end(
      JSON.stringify(
        req.url.endsWith("transcriptions")
          ? { text: "테스트 음성에서 변환된 텍스트" }
          : {
              model: "provider/model-actual",
              choices: [
                {
                  message: {
                    content: [
                      "## Key findings",
                      "",
                      "페이지의 Connection 관계를 바탕으로 한 요약입니다. [Product vision]",
                      "",
                      "- **Connected ideas**",
                      "",
                      "| Topic | Status |",
                      "| --- | --- |",
                      "| Notes | Ready |",
                      "",
                      "\x60\x60\x60js",
                      "const notes = 1;",
                      "\x60\x60\x60",
                      "",
                      '<img src="https://example.com/tracker.png">',
                      "",
                      "[Unsafe link](javascript:alert%281%29)",
                    ].join("\n"),
                  },
                },
              ],
            },
      ),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    app = await electron.launch({
      args: ["."],
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, WALLACE_TEST_USER_DATA: directory },
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page
      .getByRole("heading", { name: "What would you like to think through?" })
      .waitFor();
    await page.getByLabel("Ask AI", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
    const safety = await app.evaluate(({ BrowserWindow }) => {
      const p =
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        sandbox: p.sandbox,
        contextIsolation: p.contextIsolation,
        nodeIntegration: p.nodeIntegration,
      };
    });
    assert.deepEqual(safety, {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
    const primaryKey = process.platform === "darwin" ? "Meta" : "Control";
    const firstConversation = page.getByRole("button", {
      name: "Open conversation: Wallace product direction",
      exact: true,
    });
    const rename = page.getByRole("dialog", {
      name: "Rename conversation",
      exact: true,
    });
    const remove = page.getByRole("dialog", {
      name: "Delete this conversation?",
      exact: true,
    });
    const workspaceMenu = page.locator(".workspace-menu summary");
    const settingsDialog = page.getByRole("dialog", {
      name: "Keyboard shortcuts",
    });
    async function openShortcuts() {
      await workspaceMenu.click();
      await page
        .getByRole("button", { name: "Keyboard shortcuts", exact: true })
        .click();
    }
    await page.keyboard.press(primaryKey + "+D");
    assert.equal(await remove.count(), 0);
    await firstConversation.click();
    await page.keyboard.press(primaryKey + "+R");
    const nameInput = rename.getByRole("textbox", {
      name: "Conversation title",
    });
    await expect(nameInput).toBeFocused();
    await nameInput.fill("단축키로 수정");
    await rename.getByRole("button", { name: "Save title" }).click();
    await page
      .getByRole("heading", { name: "단축키로 수정", exact: true })
      .waitFor();
    await page.keyboard.press(primaryKey + "+R");
    await nameInput.fill("Wallace product direction");
    await rename.getByRole("button", { name: "Save title" }).click();
    await firstConversation.click();
    await page.keyboard.press(primaryKey + "+D");
    await expect(remove.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(firstConversation).toBeFocused();
    await page.getByLabel("Ask AI", { exact: true }).focus();
    await page.keyboard.press(primaryKey + "+D");
    assert.equal(await remove.count(), 0);

    await openShortcuts();
    const renameKey = settingsDialog.getByRole("button", {
      name: "Rename conversation shortcut",
    });
    await renameKey.click();
    await page.keyboard.press(primaryKey + "+D");
    await expect(settingsDialog.getByRole("alert")).toContainText(
      "already uses this shortcut",
    );
    await page.keyboard.press(primaryKey + "+C");
    await expect(settingsDialog.getByRole("alert")).toContainText(
      "reserved for editing",
    );
    await page.keyboard.press(primaryKey + "+Shift+K");
    await expect(renameKey).toContainText("K");
    await settingsDialog.screenshot({
      path: "test-results/shortcuts-desktop.png",
    });
    const initialViewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    await page.setViewportSize({ width: 390, height: 670 });
    const shortcutBounds = await settingsDialog.boundingBox();
    assert(
      shortcutBounds.x >= 0 && shortcutBounds.x + shortcutBounds.width <= 390,
    );
    await settingsDialog.screenshot({
      path: "test-results/shortcuts-narrow.png",
    });
    await page.setViewportSize(initialViewport);
    await settingsDialog
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await firstConversation.click();
    await page.keyboard.press(primaryKey + "+R");
    assert.equal(await rename.count(), 0);
    await page.keyboard.press(primaryKey + "+Shift+K");
    await rename.waitFor();
    await page.keyboard.press("Escape");
    await page.reload();
    await firstConversation.click();
    await page.keyboard.press(primaryKey + "+Shift+K");
    await rename.waitFor();
    await page.keyboard.press("Escape");
    await openShortcuts();
    await settingsDialog
      .getByRole("button", { name: "Restore defaults" })
      .click();
    await settingsDialog
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await firstConversation.click();
    await page.keyboard.press(primaryKey + "+R");
    await rename.waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await app.evaluate(({ app }) => {
      app.once("browser-window-created", (_event, window) => {
        window.webContents.session.protocol.handle("https", ({ url }) => {
          const child = new URL(url).pathname === "/Design";
          const title = child ? "Design" : "Roadmap";
          const id = child
            ? "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
            : "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
          return new Response(
            '<div class="notion-frame notion-scroller vertical">' +
              '<h1 class="notion-page-block" data-block-id="' +
              id +
              '">' +
              title +
              "</h1>" +
              '<div class="notion-page-content">' +
              '<div data-block-id="text" class="notion-text-block">Plan the release.</div>' +
              (child
                ? '<div data-block-id="table" class="notion-table-block"><table><tr><td>Draft</td></tr></table></div>'
                : '<div data-block-id="list" class="notion-to_do-block"><div data-block-id="child" class="notion-page-block"><a href="/Design">Design</a></div></div>') +
              "</div></div>",
            { headers: { "content-type": "text/html" } },
          );
        });
      });
    });
    await page.locator(".workspace-menu summary").click();
    await page
      .getByRole("button", { name: "Import from Notion or Slack" })
      .click();
    const migration = page.getByRole("dialog", {
      name: "Import from Notion or Slack",
    });
    const notionLink = migration.getByLabel("Public Notion link");
    const preview = migration.getByRole("button", { name: "Preview" });
    await notionLink.fill("https://example.com");
    await preview.click();
    await migration.getByRole("alert").waitFor();
    await notionLink.fill("https://team.notion.site/Roadmap");
    await preview.click();
    const addNotes = migration.getByRole("button", { name: "Add 2 notes" });
    await addNotes.waitFor();
    await migration.screenshot({
      path: "test-results/notion-link-preview.png",
    });
    const viewport =
      page.viewportSize() ||
      (await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      })));
    await page.setViewportSize({ width: 390, height: 780 });
    const bounds = await migration.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await migration.screenshot({ path: "test-results/notion-link-narrow.png" });
    await page.setViewportSize(viewport);
    await addNotes.click();
    await migration.waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Open conversation: Notion · Documents" })
      .waitFor();
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await window.wallace.load())?.pages.some(
            (item) => item.title === "Roadmap",
          ),
        ),
      )
      .toBe(true);
    const workspace = await page.evaluate(() => window.wallace.load());
    const roadmap = workspace.pages.find((item) => item.title === "Roadmap");
    const design = workspace.pages.find((item) => item.title === "Design");
    assert.match(roadmap.html, /Open in Notion/);
    assert.match(design.html, /<td>Draft<\/td>/);
    assert(
      workspace.edges.some(
        ({ source, target }) => source === roadmap.id && target === design.id,
      ),
    );
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await app.evaluate(() => {
      const original = globalThis.fetch;
      globalThis.fetch = (href, options) => {
        const url = new URL(String(href));
        if (url.origin !== "https://api.notion.com")
          return original(href, options);
        if (options.headers.Authorization !== "Bearer wallace-notion-test")
          return Promise.resolve(new Response(null, { status: 401 }));
        return Promise.resolve(
          Response.json(
            url.pathname.endsWith("/markdown")
              ? { markdown: "Private test content" }
              : {
                  properties: {
                    title: {
                      type: "title",
                      title: [{ plain_text: "Private roadmap" }],
                    },
                  },
                },
          ),
        );
      };
    });
    await page.locator(".workspace-menu summary").click();
    const migrationMenu = page.getByRole("button", {
      name: "Import from Notion or Slack",
    });
    await migrationMenu.click();
    const useConnection = migration.getByLabel(
      "Use a Notion connection for private pages",
    );
    await useConnection.check();
    const privateLink = migration.getByLabel("Notion page link");
    const tokenInput = migration.getByLabel("Notion connection token");
    const privateUrl = "https://www.notion.so/" + "c".repeat(32);
    await privateLink.fill(privateUrl);
    await tokenInput.fill("wallace-notion-test");
    await preview.click();
    await migration.getByText("Private roadmap", { exact: true }).waitFor();
    const credential = await fs.readFile(
      path.join(directory, "notion-connection.json"),
      "utf8",
    );
    assert.doesNotMatch(credential, /wallace-notion-test/);
    const closeMigration = migration.getByRole("button", {
      name: "Close import",
    });
    await closeMigration.click();
    await page.locator(".workspace-menu summary").click();
    await migrationMenu.click();
    await migration.getByText("Saved Notion connection").waitFor();
    await privateLink.fill(privateUrl);
    await preview.click();
    await migration.getByText("Private roadmap", { exact: true }).waitFor();
    await migration.getByRole("button", { name: "Disconnect" }).click();
    await tokenInput.waitFor();
    await assert.rejects(
      fs.access(path.join(directory, "notion-connection.json")),
      { code: "ENOENT" },
    );
    await closeMigration.click();
    await page.locator(".workspace-menu summary").click();
    await page.getByRole("button", { name: "AI connections" }).click();
    await page.getByRole("button", { name: /Run on this device/ }).click();
    assert.equal(await page.getByLabel("API URL", { exact: true }).count(), 0);
    await page.getByText("LiquidAI LFM3-1.7B", { exact: true }).waitFor();
    await page.getByLabel("Local runtime").selectOption("vLLM");
    await expect(page.locator(".connection-summary")).toContainText(
      "127.0.0.1:8000/v1",
    );
    await page.getByLabel("Local runtime").selectOption("llama.cpp");
    await expect(page.locator(".connection-summary")).toContainText(
      "127.0.0.1:8080/v1",
    );
    await page.getByLabel("Local runtime").selectOption("SGLang");
    await expect(page.locator(".connection-summary")).toContainText(
      "127.0.0.1:30000/v1",
    );
    await page.getByRole("button", { name: /Cloud service/ }).click();
    await app.evaluate(() => {
      const original = globalThis.fetch;
      globalThis.fetch = (href, options) => {
        if (new URL(href).origin !== "https://openrouter.ai")
          return original(href, options);
        const body = JSON.parse(options.body);
        const valid =
          href === "https://openrouter.ai/api/v1/chat/completions" &&
          options.method === "POST" &&
          options.headers.Authorization === "Bearer wallace-router-test-key" &&
          [
            "inclusionai/ling-3.2-flash:free",
            "baidu/ernie-5.5-flash-preview:free",
          ].includes(body.model);
        if (valid && body.model === "inclusionai/ling-3.2-flash:free")
          return Promise.resolve(new Response(null, { status: 429 }));
        return Promise.resolve(
          valid
            ? Response.json({ choices: [{ message: { content: "OK" } }] })
            : new Response(null, { status: 400 }),
        );
      };
    });
    const service = page.getByLabel("Service", { exact: true });
    await service.selectOption("OpenRouter");
    const lingPreset = page.getByRole("option", {
      name: "inclusionai/ling-3.2-flash:free",
      exact: true,
    });
    await expect(
      page.getByRole("option", {
        name: "baidu/ernie-5.5-flash-preview:free",
        exact: true,
      }),
    ).toHaveAttribute("aria-selected", "true");
    await lingPreset.click();
    await expect(lingPreset).toHaveAttribute("aria-selected", "true");
    const connectionTest = page.getByRole("button", {
      name: "Test connection",
      exact: true,
    });
    await expect(connectionTest).toBeDisabled();
    const aiDialog = page.getByRole("dialog");
    await aiDialog.screenshot({ path: "test-results/openrouter-desktop.png" });
    await page.setViewportSize({ width: 390, height: 780 });
    await lingPreset.scrollIntoViewIfNeeded();
    await expect(lingPreset).toBeInViewport();
    await aiDialog.screenshot({ path: "test-results/openrouter-narrow.png" });
    await page.setViewportSize(initialViewport);
    await page.getByLabel(/^API key/).fill("wallace-router-test-key");
    await connectionTest.click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /ling-3.2-flash:free returned HTTP 429/ }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Select baidu/ernie-5.5-flash-preview:free",
        exact: true,
      })
      .click();
    await connectionTest.click();
    await page
      .getByRole("status")
      .filter({ hasText: "The selected model responded" })
      .waitFor();
    await page
      .getByLabel("Service", { exact: true })
      .selectOption("Google Gemini");
    assert.equal(
      await page
        .getByRole("button", { name: "Test connection", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByRole("button", { name: /Server URL and model/ }).click();
    assert.match(
      await page.getByLabel("API URL", { exact: true }).inputValue(),
      /generativelanguage/,
    );
    await page
      .getByLabel("Service", { exact: true })
      .selectOption("Hugging Face");
    await page.getByLabel("Hugging Face routing").selectOption("cheapest");
    assert.match(
      await page.locator(".model-command-heading strong").textContent(),
      /:cheapest$/,
    );
    await page.getByRole("button", { name: /Connect your own server/ }).click();
    await page.getByRole("button", { name: "llama.cpp", exact: true }).click();
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.getByLabel("API URL", { exact: true }).fill(`${origin}/v1`);
    await page.getByRole("button", { name: "Load models" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Loaded 1 server model" })
      .waitFor();
    assert.equal(
      await page.locator(".model-command-heading strong").textContent(),
      "llama-test-model",
    );
    await page.getByLabel(/^API key/).fill("temporary-test-key");
    await page
      .getByRole("button", { name: "Test connection", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "The selected model responded" })
      .waitFor();
    assert.equal(
      requests[1].headers.authorization,
      "Bearer temporary-test-key",
    );
    const probe = JSON.parse(requests[1].body);
    assert.equal(probe.model, "llama-test-model");
    assert.equal(probe.messages.length, 1);
    assert.match(probe.messages[0].content, /connection test/);
    await page.getByLabel(/^API key/).fill("");
    await expect(page.getByLabel("Connection type")).toHaveCount(0);
    const speechProbe = await page.evaluate(async (baseUrl) => {
      const settings = await window.wallace.settings();
      const text = await window.wallace.testSpeech(
        { bytes: new Uint8Array([1, 2, 3]), mime: "audio/webm" },
        {
          ...settings,
          baseUrl,
          voiceMode: "separate",
          voiceBaseUrl: baseUrl + "/voice",
          voiceApiKey: "temporary-voice-key",
          transcriptionModel: "speech-test-model",
        },
      );
      return { text, settings: await window.wallace.settings() };
    }, origin);
    assert.match(speechProbe.text, /변환된 텍스트/);
    assert.equal(speechProbe.settings.voiceMode, "same");
    assert.equal(requests.at(-1).url, "/voice/audio/transcriptions");
    assert.equal(
      requests.at(-1).headers.authorization,
      "Bearer temporary-voice-key",
    );
    assert.match(requests.at(-1).body, /speech-test-model/);
    await page.screenshot({
      path: "test-results/provider-catalog-desktop.png",
    });
    requests.length = 0;
    await page.getByRole("button", { name: "Save connection" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.locator(".workspace-menu > summary").click();
    await page.getByRole("button", { name: "AI connections" }).click();
    await page
      .getByRole("button", { name: "Speech (STT)", exact: true })
      .click();
    await page.getByLabel("Connection type").selectOption("separate");
    await page
      .getByLabel("Speech-to-text API URL", { exact: true })
      .fill(`${origin}/voice`);
    await page.getByRole("button", { name: "Save speech settings" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await page.getByLabel("Purpose type", { exact: true }).count(),
      0,
    );
    await page
      .getByRole("button", { name: "Write a note", exact: true })
      .click();
    await page
      .getByLabel("Write a note", { exact: true })
      .fill("홈에서 남긴 일반 텍스트");
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    await page
      .getByRole("heading", { name: "홈에서 남긴 일반 텍스트", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Page title", { exact: true }).inputValue(),
      "홈에서 남긴 일반 텍스트",
    );
    assert.equal(requests.length, 0);
    await page.getByLabel("Ask AI", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page
      .getByLabel("Ask AI", { exact: true })
      .fill("홈에서 시작하는 Decision");
    holdNextAiResponse();
    await page.getByRole("button", { name: "Send question" }).click();
    const pendingAnswer = page.locator(".ai-pending-answer");
    const pendingComposer = page.locator(".composer-status");
    await expect(pendingAnswer).toContainText("Thinking…");
    await expect(pendingAnswer).toBeInViewport();
    await expect(pendingComposer).toHaveText("Generating reply");
    await page.screenshot({ path: "test-results/ai-pending-desktop.png" });
    releaseAiResponse();
    await page.locator(".ai-answer").waitFor();
    const markdownAnswer = page.locator(".ai-answer .answer-markdown");
    await expect(
      markdownAnswer.getByRole("heading", { name: "Key findings" }),
    ).toBeVisible();
    await expect(markdownAnswer.locator("li strong")).toHaveText(
      "Connected ideas",
    );
    await expect(
      markdownAnswer.getByRole("cell", { name: "Ready" }),
    ).toBeVisible();
    await expect(markdownAnswer.locator("pre code")).toContainText(
      "const notes = 1;",
    );
    await expect(
      markdownAnswer.locator("img, a[href^='javascript:']"),
    ).toHaveCount(0);
    const harnessVersion = require("../package.json").version;
    const runtimeLabel = page.locator(".ai-answer .ai-reply-runtime");
    await expect(runtimeLabel).toContainText("provider/model-actual");
    await expect(runtimeLabel).toContainText("Harness v" + harnessVersion);
    await runtimeLabel.screenshot({
      path: "test-results/model-harness-desktop.png",
    });
    await expect(pendingAnswer).toHaveCount(0);
    await expect(pendingComposer).not.toHaveText("Generating reply");
    await page
      .getByRole("heading", { name: "홈에서 시작하는 Decision" })
      .waitFor();
    const homeRequest = JSON.parse(requests[0].body);
    assert.match(
      JSON.stringify(homeRequest.messages),
      /홈에서 시작하는 Decision/,
    );
    assert.doesNotMatch(JSON.stringify(homeRequest.messages), /Product vision/);
    const stored = await page.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return (await window.wallace.load()).conversations.find(
        (item) => item.title === "홈에서 시작하는 Decision",
      );
    });
    assert.equal(stored.purpose.kind, "question");
    assert.equal(stored.aiTurns.length, 1);
    assert.deepEqual(stored.aiTurns[0].runtime, {
      model: "provider/model-actual",
      harnessVersion,
    });
    await page.locator(".purpose-details summary").click();
    await page.locator(".purpose-details select").selectOption("decision");
    await page
      .getByRole("button", { name: "Save purpose", exact: true })
      .click();
    assert.equal(await page.locator(".purpose-type").textContent(), "Decision");
    requests.length = 0;
    await page
      .getByRole("button", {
        name: "Open conversation: Wallace product direction",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "AI assistant", exact: true })
      .click();
    await page
      .getByLabel("Ask AI", { exact: true })
      .fill("제품 비전은 무엇인가요?");
    await page.getByRole("button", { name: "Send question" }).click();
    await page.locator(".ai-answer").waitFor();
    assert.match(
      await page.locator(".ai-answer .answer-markdown").textContent(),
      /Connection 관계/,
    );
    assert.match(requests[0].body, /Product vision/);
    await page.evaluate(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          const audio = new AudioContext();
          const tone = audio.createOscillator();
          const output = audio.createMediaStreamDestination();
          tone.connect(output);
          tone.start();
          const track = output.stream.getAudioTracks()[0];
          const stop = track.stop.bind(track);
          track.stop = () => {
            stop();
            void audio.close();
          };
          return output.stream;
        },
      });
    });
    const questionInput = page.getByLabel("Ask AI", { exact: true });
    await questionInput.fill("직접 작성한 초안");
    await page
      .getByRole("button", { name: "Voice input", exact: true })
      .click();
    const stopRecording = page.getByRole("button", {
      name: "Finish recording",
      exact: true,
    });
    await stopRecording.waitFor();
    await questionInput.fill("Recording 수정한 초안");
    await page.waitForTimeout(250);
    await stopRecording.click();
    await page.waitForFunction(() =>
      document
        .querySelector(".thread-composer textarea")
        .value.includes("변환된 텍스트"),
    );
    assert.equal(
      await questionInput.inputValue(),
      "Recording 수정한 초안\n테스트 음성에서 변환된 텍스트",
    );
    assert.equal(
      await questionInput.evaluate((input) => getComputedStyle(input).resize),
      "none",
    );
    assert.equal(await page.locator(".ai-answer").count(), 1);
    assert.equal(await page.locator(".thread-entry").count(), 5);
    await page.screenshot({ path: "test-results/dictation-composer.png" });
    assert.equal(requests[1].url, "/voice/audio/transcriptions");
    assert.equal(requests[0].headers.authorization, undefined);
    assert.match(requests[1].body, /gpt-4o-mini-transcribe/);
    assert.match(requests[1].headers["content-type"], /multipart\/form-data/);
    await page
      .getByLabel("Ask AI", { exact: true })
      .fill("이어서 어떤 점을 확인해야 하나요?");
    await page.setViewportSize({ width: 390, height: 780 });
    holdNextAiResponse();
    await page
      .getByRole("button", { name: "Send question", exact: true })
      .click();
    await expect(pendingAnswer).toBeInViewport();
    await expect(pendingComposer).toBeInViewport();
    await expect(pendingComposer).toHaveText("Generating reply");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    await page.screenshot({ path: "test-results/ai-pending-narrow.png" });
    releaseAiResponse();
    await page.locator(".ai-exchanges .ai-answer").nth(1).waitFor();
    await page.locator(".ai-exchanges .ai-answer").nth(1).screenshot({
      path: "test-results/model-harness-narrow.png",
    });
    await expect(pendingAnswer).toHaveCount(0);
    await page.setViewportSize(initialViewport);
    const flow = page.getByRole("region", { name: "Conversation flow" });
    await expect(flow).toBeHidden();
    await page.locator(".conversation-flow-disclosure > summary").click();
    const followup = flow.getByRole("button", { name: /^2 · Your message/ });
    await followup.click();
    await flow
      .getByRole("combobox", { name: /Message intent/ })
      .selectOption("constraint");
    await flow
      .getByRole("combobox", { name: /Link to an earlier message/ })
      .selectOption("0");
    await flow.getByRole("button", { name: /^2 · Constraint/ }).waitFor();
    await page.screenshot({
      path: "test-results/conversation-intent-flow.png",
    });
    await flow.getByRole("button", { name: "View message and reply" }).click();
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "ai-exchange-1",
    );

    const followUp = JSON.parse(
      JSON.parse(requests[2].body).messages[1].content,
    );
    assert.equal(
      followUp.recentExchanges[0].question,
      "제품 비전은 무엇인가요?",
    );
    await page
      .getByRole("button", { name: "Draft session note", exact: true })
      .click();
    const note = page.getByLabel("Session note draft");
    await note.waitFor();
    const transcriptSent = JSON.parse(
      JSON.parse(requests[3].body).messages[1].content,
    );
    assert.equal(transcriptSent.transcript.length, 2);
    assert.equal(transcriptSent.purpose.statement, "제품 비전은 무엇인가요?");
    const saveNote = page.getByRole("button", {
      name: "Save reviewed session note",
      exact: true,
    });
    assert.equal(await saveNote.isDisabled(), true);
    await note.fill("검토한 기록: 결정은 대화의 기록을 근거로 남깁니다.");
    await page
      .getByRole("checkbox", { name: /checked the facts and decisions/ })
      .check();
    await page.screenshot({ path: "test-results/ai-session-review.png" });
    await saveNote.click();
    const summary = page.getByRole("region", {
      name: "Conversation summary",
      exact: true,
    });
    await expect(summary).toBeHidden();
    await page.locator(".conversation-review > summary").click();
    await summary.getByText(/검토한 기록/).waitFor();
    await summary
      .getByRole("button", { name: "Complete purpose and create project" })
      .click();
    const steps = page.getByRole("region", {
      name: "Project steps",
      exact: true,
    });
    await steps.getByLabel("New project step").fill("Product vision 검토");
    await steps.getByRole("button", { name: "Add", exact: true }).click();
    await steps.getByLabel("Step 1 Done").check();
    await page.screenshot({ path: "test-results/purpose-conversation.png" });
    await page
      .getByRole("button", { name: "Conversation spec", exact: true })
      .click();
    await page.getByLabel("Edit HTML", { exact: true }).click();
    await page
      .getByLabel("HTML source", { exact: true })
      .fill(
        "<h2>네이티브 Conversation spec</h2><p>재실행 후에도 보존됩니다.</p>",
      );
    await page.getByRole("button", { name: "New page", exact: true }).click();
    await page.getByLabel("Page title").fill("종료 직전 Save 검증");
    await page.getByRole("button", { name: "Star node", exact: true }).click();
    await page.screenshot({ path: "test-results/native-workspace.png" });
    assert.deepEqual(errors, []);
    const closed = app.waitForEvent("close");
    await app.evaluate(({ app }) => app.quit());
    await closed;
    app = null;
    const persisted = JSON.parse(
      await fs.readFile(path.join(directory, "workspace.json"), "utf8"),
    );
    assert(persisted.pages.some((p) => p.title === "종료 직전 Save 검증"));
    assert.equal(persisted.pages.length, 11);
    const savedText = persisted.conversations.find(
      (item) => item.title === "홈에서 남긴 일반 텍스트",
    );
    assert.equal(savedText.aiTurns?.length ?? 0, 0);
    assert.deepEqual(
      persisted.pages
        .filter((p) => savedText.nodeIds.includes(p.id))
        .map((p) => p.html),
      ["<p>홈에서 남긴 일반 텍스트</p>"],
    );
    assert.equal(persisted.conversations[0].aiTurns.length, 2);
    assert(persisted.conversations[0].aiTurns[0].sources.length);
    assert(
      persisted.pages.some(
        (p) =>
          p.title.endsWith("Session note") &&
          p.html.includes("AI exchanges 1–2"),
      ),
    );
    assert.match(persisted.conversations[0].html, /네이티브 Conversation spec/);
    assert(persisted.conversations[0].purpose.completedAt);
    assert.equal(persisted.conversations[0].summary.turnCount, 2);
    assert.equal(
      persisted.conversations[0].project.steps[0].title,
      "Product vision 검토",
    );
    assert.equal(persisted.conversations[0].project.steps[0].done, true);
    assert.equal(persisted.conversations[0].favoriteNodeIds.length, 1);
    app = await electron.launch({
      args: ["."],
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, WALLACE_TEST_USER_DATA: directory },
    });
    const reopened = await app.firstWindow();
    await reopened
      .getByRole("button", {
        name: "Starred node: 종료 직전 Save 검증",
        exact: true,
      })
      .waitFor();
    await reopened
      .getByRole("heading", { name: "What would you like to think through?" })
      .waitFor();
    await reopened
      .getByRole("button", {
        name: "Open conversation: Wallace product direction",
        exact: true,
      })
      .click();
    await reopened.locator(".ai-exchanges .ai-answer").nth(1).waitFor();
    await expect(
      reopened.locator(".ai-exchanges .ai-reply-runtime").nth(1),
    ).toContainText("provider/model-actual");
    await reopened.locator(".conversation-flow-disclosure > summary").click();
    await reopened.locator(".conversation-review > summary").click();
    await reopened
      .getByRole("button", { name: /^2 · Constraint.*Follows message 1/ })
      .waitFor();
    assert(await reopened.getByLabel("Step 1 Done").isChecked());
    const failedQuestion = reopened.getByLabel("Ask AI", { exact: true });
    await failedQuestion.fill("응답 오류 확인");
    holdNextAiResponse();
    await reopened
      .getByRole("button", { name: "Send question", exact: true })
      .click();
    await reopened.locator(".ai-pending-answer").waitFor();
    releaseAiResponse("fail");
    await expect(reopened.locator(".ai-pending-answer")).toHaveCount(0);
    await expect(failedQuestion).toHaveValue("응답 오류 확인");
    await reopened.locator(".workspace-menu summary").click();
    await reopened
      .getByRole("button", { name: "Shared AI room", exact: true })
      .click();
    const room = reopened.getByRole("main", { name: "Shared AI room" });
    await room.getByLabel("Display name").fill("테스트 참가자");
    await room
      .locator("form")
      .getByRole("button", { name: "Open room", exact: true })
      .last()
      .click();
    await room
      .getByLabel("Ask the shared room")
      .fill("공유 Conversation 응답 상태 확인");
    holdNextAiResponse();
    await room.getByRole("button", { name: "Send shared question" }).click();
    await expect(room.locator(".ai-pending-answer")).toBeInViewport();
    await expect(room.locator(".composer-status")).toHaveText(
      "Generating reply",
    );
    releaseAiResponse();
    await expect(room.locator(".ai-pending-answer")).toHaveCount(0);
    await expect(room.locator(".shared-answer")).toContainText(
      "페이지의 Connection 관계",
    );
    await expect(
      room.locator(".shared-answer").getByRole("table"),
    ).toBeVisible();
    await expect(room.locator(".ai-reply-runtime")).toContainText(
      "Harness v" + harnessVersion,
    );
    await room.getByRole("button", { name: "Close room" }).click();
    await room.getByLabel("Display name").waitFor();
    console.log(
      "Native desktop passed: isolated renderer, settings, AI retrieval/request/answer, transcription transport, close flush, restart persistence.",
    );
  } finally {
    releaseAiResponse?.();
    if (app) {
      const closed = app.waitForEvent("close", { timeout: 15000 });
      await app.evaluate(({ app }) => app.quit());
      await closed;
    }
    await new Promise((r) => server.close(r));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
