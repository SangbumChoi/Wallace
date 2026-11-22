const { marked } = require("marked");
const sanitizeHtml = require("sanitize-html");
const { setTimeout: delay } = require("node:timers/promises");
const { collectNotionDocuments, notionUrl } = require("./notion-link.cjs");

function pageId(url) {
  const id = url.pathname.match(
    /([\da-f]{32}|[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i,
  )?.[1];
  return id?.replace(/-/g, "").toLowerCase();
}

async function prepareConnectedNotionLink(value, token, fetcher = fetch) {
  const root = notionUrl(value);
  if (!root || !pageId(root)) {
    throw new Error(
      "In Notion, choose Copy link from the page menu to get a URL that includes the page ID.",
    );
  }
  let nextRequestAt = 0;
  async function request(path, deadline) {
    await delay(Math.max(0, nextRequestAt - Date.now()));
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Notion took too long to respond.");
    nextRequestAt = Date.now() + 350;
    let response;
    try {
      response = await fetcher("https://api.notion.com/v1/" + path, {
        headers: {
          Authorization: "Bearer " + token,
          "Notion-Version": "2026-03-11",
        },
        redirect: "error",
        signal: AbortSignal.timeout(Math.min(remaining, 12000)),
      });
    } catch {
      throw new Error("Could not connect to Notion. Try again in a moment.");
    }
    if (response.status === 401)
      throw new Error("Check your Notion connection token.");
    if ([403, 404].includes(response.status))
      throw new Error(
        "Access denied. Add the connection to the Notion page and grant read access.",
      );
    if (!response.ok)
      throw new Error(
        "Could not read the Notion page (" + response.status + ").",
      );
    return response.json();
  }
  return collectNotionDocuments(root, async (url, deadline) => {
    const id = pageId(url);
    const page = await request("pages/" + id, deadline);
    const content = await request(
      "pages/" + id + "/markdown?markdown_version=v2",
      deadline,
    );
    if (
      typeof content.markdown !== "string" ||
      content.markdown.length > 1_000_000
    )
      throw new Error(
        "The Notion page could not be read or is too large. Import it as a ZIP.",
      );
    const children = [];
    let attachments = 0;
    let unsupported = Number(
      Boolean(content.truncated || content.unknown_block_ids?.length),
    );
    const html = sanitizeHtml(
      marked.parse(content.markdown, { async: false }),
      {
        allowedTags: [
          ...sanitizeHtml.defaults.allowedTags,
          "del",
          "u",
          "summary",
          "details",
        ],
        allowedAttributes: { a: ["href"] },
        transformTags: {
          page: (_tag, { url: href }) => {
            const child = notionUrl(href);
            if (child && pageId(child)) children.push(child);
            return { tagName: "a", attribs: { href } };
          },
          mention: (_tag, { url: href }) => ({
            tagName: "a",
            attribs: { href },
          }),
          quote: "blockquote",
          callout: "blockquote",
          toggle: "div",
          "*": (tagName, attribs) => {
            if (/^(img|image|pdf|file|audio|video|embed)$/.test(tagName))
              attachments++;
            if (/^(database|collection|folder|unknown)$/.test(tagName))
              unsupported++;
            return { tagName, attribs };
          },
        },
      },
    );
    const titleValue = Object.values(page.properties || {}).find(
      (value) => value.type === "title",
    )?.title;
    const title =
      titleValue?.map((span) => span.plain_text).join("") || "Notion page";
    return {
      url: notionUrl(page.url)?.href || url.href,
      id,
      title,
      html,
      attachments,
      unsupported,
      children,
    };
  });
}

module.exports = { prepareConnectedNotionLink };
