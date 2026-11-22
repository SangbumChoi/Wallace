const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1480, height: 960 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((seed) => {
      if (!localStorage.getItem("wallace-preview"))
        localStorage.setItem("wallace-preview", JSON.stringify(seed));
    }, require("../src/data.ts").seed);
    await page.goto("http://127.0.0.1:5173");
    const homeHeading = page.getByRole("heading", {
      name: "What would you like to think through?",
    });
    const firstConversation = page.getByRole("button", {
      name: "Open conversation: Wallace product direction",
      exact: true,
    });
    await homeHeading.waitFor();
    assert.equal(await page.getByRole("main").getByRole("combobox").count(), 0);
    await page
      .getByRole("main")
      .getByLabel("Ask AI", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("main")
        .getByText("Join with an invite", { exact: true })
        .count(),
      0,
    );
    const composerLayout = () =>
      page.locator(".thread-composer").evaluate((form) => {
        const { width, height } = form.getBoundingClientRect();
        const input = form.querySelector("textarea");
        return {
          width,
          height,
          font: getComputedStyle(input).fontSize,
          placeholder: input.placeholder,
          buttons: Array.from(
            form.querySelectorAll("button"),
            (button) =>
              button.getAttribute("aria-label") || button.textContent.trim(),
          ),
        };
      });
    const desktopHomeComposer = await composerLayout();
    await page.screenshot({ path: "test-results/ai-home-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileHomeComposer = await composerLayout();
    await page.screenshot({ path: "test-results/ai-home-mobile.png" });
    assert(
      await page
        .getByRole("main")
        .getByLabel("Ask AI", { exact: true })
        .isVisible(),
    );
    await page.getByRole("button", { name: "Open conversation list" }).click();
    await firstConversation.click();
    assert.deepEqual(await composerLayout(), mobileHomeComposer);
    await page.screenshot({ path: "test-results/ai-conversation-mobile.png" });
    await page.setViewportSize({ width: 1480, height: 960 });
    assert.deepEqual(await composerLayout(), desktopHomeComposer);
    await page.screenshot({ path: "test-results/ai-conversation-desktop.png" });
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await homeHeading.waitFor();
    await firstConversation.click();
    await page.getByLabel("Ask AI", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Conversation spec", exact: true })
      .click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator(".detail-panel").count(), 0);
    assert.equal(await page.locator(".topbar").count(), 0);
    const thread = await page.locator(".conversation-thread").boundingBox();
    const spec = await page.locator(".spec-panel").boundingBox();
    assert(spec.y >= thread.y + thread.height - 1);
    const sidebar = await page.locator(".compact-sidebar").boundingBox();
    assert(sidebar.width < 200);
    await fs.mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/conversation-desktop.png" });
    assert.equal(await page.locator(".thread-entry").count(), 5);
    await page
      .getByRole("button", { name: "Connection graph", exact: true })
      .click();
    await page.locator(".conversation-canvas > summary").click();
    assert.equal(await page.locator(".react-flow__node").count(), 5);
    await page
      .getByRole("button", { name: "Connection graph", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Open conversation: Knowledge discovery",
        exact: true,
      })
      .click();
    assert.equal(await page.locator(".thread-entry").count(), 2);
    await page
      .getByRole("button", { name: "Add to Favorites", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Starred conversation: Knowledge discovery",
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Remove from my list", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", {
          name: "Open conversation: Knowledge discovery",
          exact: true,
        })
        .count(),
      0,
    );
    await page
      .getByLabel("Search notes and conversations")
      .fill("Knowledge discovery");
    await page
      .getByRole("button", {
        name: "Open conversation: Knowledge discovery",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Add to my list", exact: true })
      .click();
    await page.getByLabel("Search notes and conversations").fill("");
    const rename = page.getByRole("button", {
      name: "Rename conversation: Knowledge discovery",
      exact: true,
    });
    const row = rename.locator("..");
    const rowButton = row.getByRole("button", {
      name: "Open conversation: Knowledge discovery",
    });
    assert.equal(await rowButton.getAttribute("aria-current"), "page");
    const rowBackground = await row.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await rowButton.hover();
    await rowButton.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    assert.equal(
      await rowButton.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
      "rgba(0, 0, 0, 0)",
    );
    assert.equal(
      await row.evaluate((element) => getComputedStyle(element).backgroundColor),
      rowBackground,
    );
    const rowBounds = await row.boundingBox();
    const rowTitleBounds = await rowButton
      .getByText("Knowledge discovery")
      .boundingBox();
    await rename.click();
    const titleEditor = page.getByRole("textbox", {
      name: "Rename conversation",
      exact: true,
    });
    const editorBounds = await titleEditor.boundingBox();
    assert.equal(editorBounds.x, rowTitleBounds.x);
    assert.equal(editorBounds.height, rowBounds.height);
    await titleEditor.fill("취소할 Title");
    await titleEditor.press("Escape");
    await rename.click();
    assert.equal(await titleEditor.inputValue(), "Knowledge discovery");
    await titleEditor.fill("  지식 탐색 개선  ");
    await titleEditor.press("Enter");
    await page
      .getByRole("heading", { name: "지식 탐색 개선", exact: true })
      .waitFor();
    await page
      .getByRole("button", {
        name: "Open conversation: 지식 탐색 개선",
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", {
        name: "Starred conversation: 지식 탐색 개선",
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Conversation spec", exact: true })
      .click();
    await page.getByLabel("Edit HTML", { exact: true }).click();
    await page
      .getByLabel("HTML source", { exact: true })
      .fill(
        "<h2>두 번째 대화의 스펙</h2><p>각 대화의 스펙은 별도로 저장됩니다.</p>",
      );
    await page
      .getByRole("button", {
        name: "Starred conversation: Wallace product direction",
        exact: true,
      })
      .click();
    assert.equal(await page.locator(".thread-entry").count(), 5);
    await page
      .getByRole("button", { name: "Conversation spec", exact: true })
      .click();
    assert(
      !(await page
        .locator(".prose")
        .textContent()
        .then((s) => s.includes("두 번째 대화의 스펙"))),
    );
    await page.getByRole("button", { name: "New page", exact: true }).click();
    await page.getByLabel("Page title", { exact: true }).fill("UI 검증 노드");
    await page.getByLabel("Page content", { exact: true }).fill("노드 본문");
    await page.getByRole("button", { name: "Star node", exact: true }).click();
    await page.getByLabel("Edit HTML", { exact: true }).click();
    await page
      .getByLabel("HTML source", { exact: true })
      .fill(
        '<h2>커스텀 HTML</h2><p>Save 검증</p><img src=x onerror="alert(1)"><script>window.pwned=true</script>',
      );
    await page.getByLabel("Reading mode").click();
    assert.equal(await page.locator(".prose script,.prose img").count(), 0);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    await page.waitForTimeout(700);
    await page.reload();
    await page
      .getByRole("button", {
        name: "Starred conversation: 지식 탐색 개선",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Conversation spec", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "두 번째 대화의 스펙", exact: true })
      .waitFor();
    assert.equal(await page.locator(".thread-entry").count(), 2);
    await page
      .getByRole("button", { name: "Starred node: UI 검증 노드", exact: true })
      .click();
    assert.equal(await page.locator(".thread-entry").count(), 6);
    assert.equal(
      await page.getByLabel("Page title", { exact: true }).inputValue(),
      "UI 검증 노드",
    );
    await page
      .getByRole("heading", { name: "커스텀 HTML", exact: true })
      .waitFor();
    await page
      .getByLabel("Search notes and conversations")
      .fill("Knowledge discovery");
    assert.equal(
      await page
        .getByRole("button", {
          name: "Open conversation: Wallace product direction",
          exact: true,
        })
        .count(),
      0,
    );
    await page.getByLabel("Search notes and conversations").fill("");
    await page
      .getByRole("button", { name: "New conversation graph", exact: true })
      .click();
    assert.equal(await page.locator(".thread-entry").count(), 0);
    await page.getByLabel("Ask AI", { exact: true }).waitFor();
    assert.equal(
      await page
        .locator(
          ".purpose-summary,.saved-context,.conversation-records,.panel-tabs",
        )
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Write a note", exact: true })
      .click();
    const composer = page.getByLabel("Write a note", { exact: true });
    await composer.fill("입력창에서 만든 노드");
    await composer.press("Enter");
    assert.equal(await page.locator(".thread-entry").count(), 1);
    assert.equal(
      await page.getByLabel("Ask AI", { exact: true }).inputValue(),
      "",
    );
    await page
      .getByRole("button", { name: "Conversation spec", exact: true })
      .click();
    await page.getByLabel("Editing mode", { exact: true }).click();
    await page
      .getByLabel("Conversation spec title")
      .fill("독립적인 New conversation");
    await page
      .getByLabel("Conversation spec content")
      .fill("새 대화에서 남기는 스펙입니다.");
    await page
      .getByRole("button", {
        name: "Open conversation: Wallace product direction",
        exact: true,
      })
      .click();
    assert.equal(await page.locator(".thread-entry").count(), 6);
    await page
      .getByRole("button", {
        name: "Open conversation: 독립적인 New conversation",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "AI assistant", exact: true })
      .click();
    await page.getByLabel("Ask AI", { exact: true }).fill("요약해 줘");
    await page.getByRole("button", { name: "Send question" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "installed Wallace app" })
      .waitFor();
    await page
      .getByRole("button", { name: "Conversation spec", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open conversation list" }).click();
    await page
      .getByRole("button", {
        name: "Open conversation: Wallace product direction",
        exact: true,
      })
      .click();
    assert.equal(await page.locator(".compact-sidebar").isVisible(), false);
    await page.waitForTimeout(200);
    await page.locator(".conversation-body").evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({ path: "test-results/conversation-mobile.png" });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("button", { name: "Open conversation list" }).click();
    await page
      .getByRole("button", { name: "Workspace graph", exact: true })
      .click();
    await page.getByLabel("Search graph notes").fill("Product vision");
    await page
      .locator(".knowledge-node")
      .getByText("Product vision", { exact: true })
      .click();
    await page.getByLabel("Search graph notes").fill("");
    const selectedNote = page.getByRole("region", {
      name: "Connections to the selected note",
    });
    await selectedNote
      .getByRole("button", { name: /A space for connected ideas/ })
      .click();
    await page.screenshot({ path: "test-results/cloud-graph-mobile.png" });
    await selectedNote
      .getByRole("button", { name: "Open note", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Page title", { exact: true }).inputValue(),
      "A space for connected ideas",
    );
    await page.setViewportSize({ width: 1480, height: 960 });
    await page.locator(".workspace-menu summary").click();
    await page.getByRole("button", { name: "My profile" }).click();
    const profile = page.getByRole("dialog", { name: "My profile" });
    await profile.getByLabel("Display name").fill("민지 <연구>");
    await profile.getByRole("radio", { name: "Star", exact: true }).check();
    await profile.getByRole("button", { name: "Save", exact: true }).click();
    await page.locator(".workspace-menu summary").click();
    const downloadReady = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download as slides" }).click();
    const download = await downloadReady;
    assert.equal(download.suggestedFilename(), "Wallace-workspace.html");
    const slides = await fs.readFile(await download.path(), "utf8");
    assert.match(slides, /민지 &lt;연구&gt;’s workspace/);
    assert.match(slides, /class="avatar" aria-hidden="true">★/);
    assert.match(slides, /독립적인 New conversation/);
    await firstConversation.click();
    const header = page.locator(".thread-heading");
    const removeFavorite = header.getByRole("button", {
      name: "Remove from Favorites",
      exact: true,
    });
    assert.equal(await removeFavorite.getAttribute("aria-pressed"), "true");
    await removeFavorite.click();
    assert.equal(
      await header
        .getByRole("button", { name: "Add to Favorites", exact: true })
        .getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(
      await page
        .getByRole("button", {
          name: "Starred conversation: Wallace product direction",
          exact: true,
        })
        .count(),
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await header
      .getByRole("button", { name: "Rename conversation", exact: true })
      .click();
    const renameDialog = page.getByRole("dialog", {
      name: "Rename conversation",
      exact: true,
    });
    await renameDialog
      .getByLabel("Conversation title", { exact: true })
      .fill("Conversation 상단에서 수정");
    await renameDialog
      .getByRole("button", { name: "Save title", exact: true })
      .click();
    await header
      .getByRole("heading", { name: "Conversation 상단에서 수정", exact: true })
      .waitFor();
    await page.screenshot({
      path: "test-results/conversation-actions-mobile.png",
    });
    const deleteButton = header.getByRole("button", {
      name: "Delete conversation",
      exact: true,
    });
    await deleteButton.click();
    const confirmDelete = page.getByRole("dialog", {
      name: "Delete this conversation?",
      exact: true,
    });
    await confirmDelete
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await header
      .getByRole("heading", { name: "Conversation 상단에서 수정" })
      .waitFor();
    await deleteButton.click();
    await confirmDelete
      .getByRole("button", { name: "Delete conversation", exact: true })
      .click();
    await homeHeading.waitFor();
    await page.setViewportSize({ width: 1480, height: 960 });
    assert.equal(
      await page
        .getByRole("button", {
          name: "Open conversation: Conversation 상단에서 수정",
          exact: true,
        })
        .count(),
      0,
    );
    await page
      .getByRole("button", {
        name: "Open conversation: 지식 탐색 개선",
        exact: true,
      })
      .click();
    assert.equal(await page.locator(".thread-entry").count(), 2);
    await deleteButton.click();
    await confirmDelete
      .getByRole("button", { name: "Delete conversation", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Open conversation: 독립적인 New conversation",
        exact: true,
      })
      .click();
    await deleteButton.click();
    await confirmDelete
      .getByRole("button", { name: "Delete conversation", exact: true })
      .click();
    await page.waitForFunction(() => {
      const value = JSON.parse(localStorage.getItem("wallace-preview"));
      return value?.conversations.length === 0 && value.pages.length === 0;
    });
    await page.reload();
    await homeHeading.waitFor();
    assert.equal(
      await page.getByRole("button", { name: /^Open conversation:/ }).count(),
      0,
    );
    await page.getByRole("button", { name: "New page", exact: true }).click();
    await page.getByLabel("Page title", { exact: true }).waitFor();
    assert.equal(await page.locator(".thread-entry").count(), 1);
    assert.deepEqual(errors, []);
    console.log(
      "UI passed: conversation navigation, graph scoping, membership lists, graph/node favorites, independent specs, creation, HTML sanitization, reload persistence, search, narrow layout.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
