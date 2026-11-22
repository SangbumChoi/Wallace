const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { notionLinkPreview } = require("./migration.cjs");

const pageLimit = 25;
const unavailable =
  "Could not open the public Notion page. Check the published link or try a Notion connection or ZIP import.";

function notionUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      !(
        url.hostname === "notion.so" ||
        url.hostname === "notion.site" ||
        url.hostname.endsWith(".notion.so") ||
        url.hostname.endsWith(".notion.site")
      )
    )
      return null;
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url;
  } catch {
    return null;
  }
}

// Runs in an isolated world in the temporary Notion window.
function readPageSlice() {
  const content = document.querySelector(".notion-page-content");
  const heading = document.querySelector(".notion-frame .notion-page-block");
  const scroller = content?.closest(".notion-scroller.vertical");
  if (!content || !heading || !scroller) return null;

  const slotSelector = '[data-virtual-item-slot="true"]';
  const slots = Array.from(content.querySelectorAll(slotSelector)).filter(
    (slot) => !slot.parentElement.closest(slotSelector),
  );
  const entries = slots.length
    ? slots.map((slot) => slot.querySelector("[data-index]")).filter(Boolean)
    : Array.from(content.children);

  const blocks = entries.flatMap((entry, index) => {
    const block = entry.matches("[data-block-id]")
      ? entry
      : entry.querySelector("[data-block-id]");
    if (!block) return [];
    const tag = block?.className?.match?.(/\bnotion-([a-z_]+)-block\b/)?.[1];
    const copy = block.cloneNode(true);
    const attachments = Number(
      /^(image|file|pdf|audio|video|embed)$/.test(tag),
    );
    const unsupported = Number(
      /^(collection_view|collection_view_page|toggle)$/.test(tag),
    );
    const child =
      tag === "page"
        ? block.querySelector("a[href]") || block.closest("a[href]")
        : null;
    if (
      attachments ||
      /^collection_view/.test(tag) ||
      tag === "table_of_contents"
    )
      return {
        index: Number(entry.dataset.index ?? index),
        html: "",
        attachments,
        unsupported,
      };

    for (const link of copy.querySelectorAll("a[href]")) {
      try {
        link.setAttribute(
          "href",
          new URL(link.getAttribute("href"), location.href).href,
        );
      } catch {
        link.removeAttribute("href");
      }
    }
    copy
      .querySelectorAll('img,svg,button,[aria-hidden="true"]')
      .forEach((node) => node.remove());
    let html = copy.innerHTML;
    if (/^(header|sub_header|sub_sub_header)$/.test(tag))
      html =
        copy.querySelector("h1,h2,h3,h4")?.outerHTML || "<h2>" + html + "</h2>";
    if (tag === "quote" || tag === "callout")
      html = "<blockquote>" + html + "</blockquote>";
    if (tag === "divider") html = "<hr>";
    if (tag === "table") html = copy.querySelector("table")?.outerHTML || html;
    if (tag === "code") {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent =
        block.querySelector("pre")?.innerText || block.innerText;
      pre.append(code);
      html = pre.outerHTML;
    }
    if (child || tag === "page") {
      const link = document.createElement("a");
      if (child) link.setAttribute("href", child.href);
      link.textContent = block.innerText.trim();
      html = "<p>" + link.outerHTML + "</p>";
    }
    const list = { bulleted_list: "ul", numbered_list: "ol", to_do: "ul" }[tag];
    return {
      index: Number(entry.dataset.index ?? index),
      html,
      list,
      attachments,
      unsupported,
    };
  });

  const bottom =
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
  if (!bottom) scroller.scrollTop += Math.max(100, scroller.clientHeight * 0.8);
  return {
    title: heading.innerText.trim() || document.title,
    id: heading.getAttribute("data-block-id"),
    bottom,
    blocks,
    children: Array.from(
      content.querySelectorAll(".notion-page-block a[href]"),
      (link) => link.href,
    ),
  };
}

function assembleBlocks(blocks) {
  const parts = [];
  let list;
  for (const block of blocks) {
    if (list && list !== block.list) parts.push("</" + list + ">");
    if (block.list && list !== block.list) parts.push("<" + block.list + ">");
    list = block.list;
    parts.push(list ? "<li>" + block.html + "</li>" : block.html);
  }
  if (list) parts.push("</" + list + ">");
  return parts.join("");
}

async function readDocument(browser, url, deadline) {
  const contents = browser.webContents;
  const execute = () =>
    contents.executeJavaScriptInIsolatedWorld(101, [
      { code: "(" + readPageSlice.toString() + ")()" },
    ]);
  try {
    await Promise.race([
      browser.loadURL(url.href),
      delay(12000, undefined, { ref: false }).then(() => {
        throw new Error();
      }),
    ]);
  } catch {
    contents.stop();
    throw new Error(unavailable);
  }
  const loaded = notionUrl(contents.getURL());
  if (!loaded) throw new Error(unavailable);
  const pageDeadline = Math.min(deadline, Date.now() + 15000);
  const collected = new Map();
  const children = new Set();
  let bytes = 0;
  let bottomSamples = 0;
  for (let attempt = 0; Date.now() < pageDeadline; attempt++) {
    const slice = await execute().catch(() => null);
    if (slice) {
      for (const href of slice.children) {
        const child = notionUrl(href);
        if (child?.hostname === loaded.hostname) children.add(child.href);
      }
      for (const block of slice.blocks) {
        if (!collected.has(block.index)) bytes += Buffer.byteLength(block.html);
        collected.set(block.index, block);
      }
      if (bytes > 2_500_000)
        throw new Error("The Notion page is too large. Import it as a ZIP.");
      bottomSamples = slice.bottom ? bottomSamples + 1 : 0;
      if (bottomSamples >= 3 && (collected.size || attempt >= 5)) {
        const blocks = Array.from(collected.values()).sort(
          (a, b) => a.index - b.index,
        );
        return {
          url: loaded.href,
          id: slice.id,
          title: slice.title,
          html: assembleBlocks(blocks),
          attachments: blocks.reduce(
            (sum, block) => sum + block.attachments,
            0,
          ),
          unsupported: blocks.reduce(
            (sum, block) => sum + block.unsupported,
            0,
          ),
          children: Array.from(children, (href) => new URL(href)),
        };
      }
    }
    await delay(slice ? 110 : 240);
  }
  throw new Error(unavailable);
}

async function prepareNotionLink(value) {
  const root = notionUrl(value);
  if (!root)
    throw new Error(
      "Enter a published HTTPS link from notion.site or notion.so.",
    );
  const { BrowserWindow, session } = require("electron");
  const temporary = session.fromPartition("notion-import-" + randomUUID(), {
    cache: false,
  });
  const userAgent = temporary
    .getUserAgent()
    .replace(/\s(?:Electron|Wallace)\/[^\s]+/gi, "");
  temporary.setUserAgent(userAgent);
  temporary.setPermissionRequestHandler((_contents, _permission, respond) =>
    respond(false),
  );
  temporary.setPermissionCheckHandler(() => false);
  temporary.on("will-download", (event) => event.preventDefault());
  temporary.webRequest.onBeforeRequest((details, callback) => {
    const { resourceType, url } = details;
    const allowedNotionRequest =
      ["mainFrame", "script", "stylesheet", "xhr", "other"].includes(
        resourceType,
      ) && notionUrl(url);
    const verificationRequest =
      ["subFrame", "script", "stylesheet", "xhr", "other"].includes(
        resourceType,
      ) && new URL(url).origin === "https://challenges.cloudflare.com";
    callback({ cancel: !allowedNotionRequest && !verificationRequest });
  });
  const browser = new BrowserWindow({
    show: false,
    width: 1150,
    height: 900,
    webPreferences: {
      session: temporary,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  browser.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  browser.webContents.on("will-navigate", (event) => {
    if (!notionUrl(event.url)) event.preventDefault();
  });
  try {
    return await collectNotionDocuments(root, (url, deadline) =>
      readDocument(browser, url, deadline),
    );
  } finally {
    browser.destroy();
    await temporary.clearStorageData().catch(() => {});
  }
}

async function collectNotionDocuments(root, read) {
  const documents = [];
  const visited = new Set([root.href]);
  const pending = [{ url: root, parent: undefined }];
  const deadline = Date.now() + 55000;
  let inaccessible = 0;
  let unsupported = 0;
  while (
    pending.length &&
    documents.length < pageLimit &&
    Date.now() < deadline
  ) {
    const { url, parent } = pending.shift();
    let doc;
    try {
      doc = await read(url, deadline);
    } catch (error) {
      if (!parent) throw error;
      inaccessible++;
      continue;
    }
    documents.push({ ...doc, parent, requestedUrl: url.href });
    visited.add(doc.url);
    unsupported += doc.unsupported;
    for (const child of doc.children) {
      if (visited.has(child.href)) continue;
      visited.add(child.href);
      pending.push({ url: child, parent: doc.url });
    }
  }
  const warnings = [];
  if (pending.length)
    warnings.push(
      documents.length >= pageLimit
        ? "You can import up to 25 pages at once. Use individual subpage links for the rest."
        : "The import timed out before the remaining subpages could be read.",
    );
  if (inaccessible)
    warnings.push(
      "Skipped inaccessible or timed-out subpages: " + inaccessible + ".",
    );
  if (unsupported)
    warnings.push("Some database views or collapsed content may be missing.");
  return notionLinkPreview(documents, warnings);
}

module.exports = { prepareNotionLink, notionUrl, collectNotionDocuments };
