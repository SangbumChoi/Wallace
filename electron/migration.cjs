const { createHash } = require("node:crypto");
const { posix, basename } = require("node:path");
const { parse } = require("csv-parse/sync");
const { marked } = require("marked");
const sanitizeHtml = require("sanitize-html");
const { validateWorkspace } = require("./core.cjs");
const { readExport, MigrationZipError } = require("./migration-zip.cjs");

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
const key = (source, ...parts) =>
  "import:" +
  source +
  ":" +
  createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
const pageTitle = (text) =>
  String(text || "Untitled note")
    .trim()
    .slice(0, 300) || "Untitled note";
const notionId = (name) =>
  name
    .match(
      /(?:^|[^a-f0-9])([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?=\b|_)/i,
    )?.[1]
    ?.replace(/-/g, "")
    .toLowerCase();
const noExtension = (name) =>
  name.slice(0, name.length - posix.extname(name).length);

function decode(value) {
  try {
    return decodeURIComponent(value).normalize("NFC");
  } catch {
    return value;
  }
}

function migration(source, filename, attachments) {
  const pages = [];
  const edges = new Map();
  const conversations = new Map();
  const privateConversations = new Set();
  let messages = 0;
  let htmlBytes = 0;
  function group(id, title, html, updatedAt, sensitive = false) {
    if (!conversations.has(id)) {
      conversations.set(id, {
        id,
        title: pageTitle(title),
        html,
        updatedAt,
        nodeIds: [],
        favorite: false,
        favoriteNodeIds: [],
        involved: true,
      });
    }
    if (sensitive) privateConversations.add(id);
  }
  function page(groupId, record) {
    htmlBytes += Buffer.byteLength(record.html);
    if (
      pages.length >= 5000 ||
      record.html.length > 1000000 ||
      htmlBytes > 23_000_000
    )
      throw new Error(
        "The documents are too large. Export them in smaller batches.",
      );
    const items = conversations.get(groupId).nodeIds;
    pages.push({
      ...record,
      x: 30 + (items.length % 4) * 245,
      y: 40 + Math.floor(items.length / 4) * 150,
    });
    items.push(record.id);
  }
  function link(sourceId, target) {
    if (!sourceId || !target || sourceId === target) return;
    const id = key(source, "edge", sourceId, target);
    edges.set(id, { id, source: sourceId, target, relationship: "relates" });
  }
  function finish() {
    if (!pages.length) {
      throw new Error(
        source === "notion"
          ? "No Notion pages found. Choose a ZIP exported as Markdown and CSV or HTML."
          : "No Slack messages found. Choose a Slack ZIP export in JSON format.",
      );
    }
    const workspace = validateWorkspace({
      version: 1,
      pages,
      edges: [...edges.values()],
      conversations: [...conversations.values()],
    });
    return {
      filename,
      workspace,
      attachments,
      messages,
      groups: workspace.conversations.map(({ id, title, nodeIds }) => ({
        id,
        title,
        pages: nodeIds.length,
        sensitive: privateConversations.has(id),
      })),
    };
  }
  return {
    group,
    page,
    link,
    finish,
    countMessages: (count) => {
      messages += count;
    },
  };
}

function renderCsv(text) {
  const [header, ...rows] = parse(text, {
    skip_empty_lines: true,
    relax_column_count: true,
  });
  if (!header) return "<p>Empty table</p>";
  const row = (cells, tag) =>
    "<tr>" +
    cells
      .map(
        (cell) =>
          "<" +
          tag +
          ">" +
          escapeHtml(cell).replace(/\r?\n/g, "<br>") +
          "</" +
          tag +
          ">",
      )
      .join("") +
    "</tr>";
  return (
    "<table><thead>" +
    row(header, "th") +
    "</thead><tbody>" +
    rows.map((cells) => row(cells, "td")).join("") +
    "</tbody></table>"
  );
}

function cleanNotionHtml(html, linkAttributes) {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "details",
      "summary",
      "del",
    ],
    allowedAttributes: {
      a: ["href"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => {
        const href = linkAttributes(attributes.href || "");
        return href
          ? { tagName: "a", attribs: { href } }
          : { tagName: "span", attribs: {} };
      },
    },
  });
}

function importNotion(files, output) {
  const docs = [...files].filter(
    ([name]) => !/(?:^|\/)index\.html$/i.test(name),
  );
  const byPath = new Map();
  const byNotionId = new Map();
  const byId = new Map();
  for (const [name, record] of docs) {
    const original = notionId(posix.basename(name));
    const table = posix.extname(name).toLowerCase() === ".csv";
    const id = key(
      "notion",
      "page",
      original || name,
      table ? "table" : "page",
    );
    if (byId.has(id)) continue;
    const doc = {
      ...record,
      name,
      id,
      original,
      table,
      title: pageTitle(
        decode(posix.basename(noExtension(name)))
          .replace(/ [a-f0-9-]{32,36}(?:_all)?$/i, "")
          .replace(/_all$/, ""),
      ),
    };
    byId.set(id, doc);
    byPath.set(noExtension(name), doc);
    if (original) byNotionId.set(original, doc);
  }
  function parentOf(doc) {
    let folder = posix.dirname(doc.name);
    while (folder !== ".") {
      const found =
        byPath.get(folder) || byNotionId.get(notionId(posix.basename(folder)));
      if (found && found.id !== doc.id) return found;
      folder = posix.dirname(folder);
    }
    return undefined;
  }
  function linkedDoc(doc, href) {
    const link = decode(href.split(/[?#]/)[0]);
    const external = /^https?:\/\//i.test(link);
    if (
      external &&
      !/^https?:\/\/(?:[^/]+\.)?(?:notion\.so|notion\.site)\//i.test(link)
    )
      return undefined;
    const relative = posix.normalize(posix.join(posix.dirname(doc.name), link));
    return byPath.get(noExtension(relative)) || byNotionId.get(notionId(link));
  }
  for (const doc of byId.values()) {
    const parent = parentOf(doc);
    let html;
    if (doc.table) {
      try {
        html = renderCsv(doc.text);
      } catch {
        throw new Error("Could not read the CSV table. " + doc.title);
      }
    } else if (posix.extname(doc.name).toLowerCase() === ".html") {
      html =
        /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(doc.text)?.[1] ?? doc.text;
    } else {
      html = marked.parse(doc.text, { async: false });
    }
    const extractedTitle = sanitizeHtml(
      /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "",
      { allowedTags: [], allowedAttributes: {} },
    ).trim();
    const safe = cleanNotionHtml(html, (href) => {
      const target = linkedDoc(doc, href);
      if (target) {
        output.link(doc.id, target.id);
        return "#" + target.id;
      }
      return /^https?:|^mailto:/i.test(href) ? href : undefined;
    });
    const group = key("notion", "collection", "pages");
    output.group(
      group,
      "Notion · Documents",
      "<p>Pages and tables imported from Notion.</p>",
      doc.modified,
    );
    output.page(group, {
      id: doc.id,
      title: extractedTitle ? pageTitle(extractedTitle) : doc.title,
      html: safe || "<p>Empty page</p>",
      kind: doc.table ? "resource" : "note",
      updatedAt: doc.modified,
    });
    output.link(parent?.id, doc.id);
  }
}

function notionLinkPreview(documents, warnings) {
  const [root] = documents;
  const output = migration(
    "notion",
    root.title,
    documents.reduce((total, doc) => total + doc.attachments, 0),
  );
  const group = key("notion", "collection", "pages");
  const now = new Date().toISOString();
  const nativeId = (doc) =>
    notionId(doc.id || "") || notionId(new URL(doc.url).pathname);
  const id = (doc) => key("notion", "page", nativeId(doc) || doc.url, "page");
  const aliases = new Map();
  for (const doc of documents) {
    const importedId = id(doc);
    if (nativeId(doc)) aliases.set(nativeId(doc), importedId);
    for (const url of [doc.url, doc.requestedUrl]) aliases.set(url, importedId);
  }
  output.group(
    group,
    "Notion · Documents",
    "<p>Pages and tables imported from Notion.</p>",
    now,
  );
  const seen = new Set();
  for (const doc of documents) {
    const docId = id(doc);
    output.link(aliases.get(doc.parent), docId);
    if (seen.has(docId)) continue;
    seen.add(docId);
    const html = cleanNotionHtml(doc.html, (href) => {
      if (!href) return undefined;
      try {
        const url = new URL(href, doc.url);
        if (!["http:", "https:", "mailto:"].includes(url.protocol)) return;
        if (
          url.hostname === "notion.so" ||
          /\.notion\.(?:so|site)$/.test(url.hostname)
        ) {
          const path = url.origin + url.pathname.replace(/\/$/, "");
          const target =
            aliases.get(path) || aliases.get(notionId(url.pathname));
          if (target && target !== docId) {
            output.link(docId, target);
            return "#" + target;
          }
        }
        return url.href;
      } catch {
        return undefined;
      }
    });
    output.page(group, {
      id: docId,
      title: pageTitle(doc.title),
      html:
        (html || "<p>Empty page</p>") +
        '<p><a href="' +
        escapeHtml(doc.url) +
        '">Open in Notion</a></p>',
      kind: "note",
      updatedAt: now,
    });
  }
  return { ...output.finish(), warnings };
}

function json(record, name) {
  try {
    const value = JSON.parse(record.text);
    if (Array.isArray(value)) return value;
  } catch {}
  throw new Error("Could not read the Slack JSON file. " + name);
}

function slackText(value, users) {
  return String(value ?? "")
    .trim()
    .split(/(<[^<>\r\n]+>)/g)
    .map((part) => {
      const mention = /^<@([A-Z0-9]+)>$/.exec(part);
      if (mention)
        return escapeHtml("@" + (users.get(mention[1]) || mention[1]));
      const token = /^<(https?:\/\/[^|>]+)(?:\|([^>]*))?>$/i.exec(part);
      if (token)
        return (
          '<a href="' +
          escapeHtml(token[1].replaceAll("&amp;", "&")) +
          '">' +
          escapeHtml(token[2] || token[1]) +
          "</a>"
        );
      return escapeHtml(
        part.replace(
          /&(?:amp|lt|gt);/g,
          (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">" })[entity],
        ),
      ).replace(/\r?\n/g, "<br>");
    })
    .join("");
}

const skippedEvent =
  /^(?:channel|group)_(?:join|leave|topic|purpose|name|archive|unarchive)$/;
function slackMessage(item) {
  if (
    item?.type !== "message" ||
    item.subtype === "message_deleted" ||
    skippedEvent.test(item.subtype ?? "")
  )
    return undefined;
  const detail = item.message ?? item;
  const ts = item.original_ts || detail.ts;
  const time = new Date(Number(ts) * 1000);
  if (
    typeof ts !== "string" ||
    !/^\d+(?:\.\d+)?$/.test(ts) ||
    Number.isNaN(time.valueOf())
  )
    return undefined;
  return {
    ...detail,
    ts,
    time: time.toISOString(),
    edited: item.subtype === "message_changed" || !!detail.edited,
  };
}

function slackHtml(message, users, isReply) {
  const author =
    users.get(message.user) ||
    message.username ||
    message.user ||
    message.bot_id ||
    "Slack";
  const links = [];
  for (const file of Array.isArray(message.files) ? message.files : []) {
    if (!file) continue;
    const url = file.permalink || file.permalink_public;
    links.push(
      typeof url === "string" && /^https?:\/\//i.test(url)
        ? '<a href="' +
            escapeHtml(url) +
            '">' +
            escapeHtml(file.title || file.name || "Slack file") +
            "</a>"
        : escapeHtml(file.title || file.name || "Slack file"),
    );
  }
  const body = slackText(message.text, users);
  const attachments = (
    Array.isArray(message.attachments) ? message.attachments : []
  )
    .filter(Boolean)
    .map(({ title, text, fallback, title_link }) => {
      const heading =
        typeof title_link === "string" && /^https?:\/\//i.test(title_link)
          ? '<a href="' +
            escapeHtml(title_link) +
            '">' +
            escapeHtml(title || title_link) +
            "</a>"
          : escapeHtml(title);
      return [heading, slackText(text || fallback, users)]
        .filter(Boolean)
        .join("<br>");
    })
    .filter(Boolean);
  if (!body && !links.length && !attachments.length) return "";
  return (
    "<p><strong>" +
    escapeHtml(author) +
    "</strong> <small>" +
    message.time +
    (isReply ? " · Replies" : "") +
    "</small><br>" +
    body +
    (attachments.length ? "<br>" + attachments.join("<br>") : "") +
    (links.length ? "<br>" + links.join(" · ") : "") +
    "</p>"
  );
}

function importSlack(files, output) {
  const users = new Map();
  const info = new Map();
  const histories = new Map();
  for (const [path, record] of files) {
    const name = posix.basename(path).toLowerCase();
    if (/^(?:org_)?users\.json$/.test(name)) {
      for (const user of json(record, path)) {
        if (typeof user?.id === "string")
          users.set(
            user.id,
            user.profile?.display_name ||
              user.real_name ||
              user.name ||
              user.id,
          );
      }
    }
    if (/^(?:channels|groups|dms|mpims)\.json$/.test(name)) {
      for (const channel of json(record, path)) {
        if (!channel || typeof channel.id !== "string") continue;
        const sensitive = name !== "channels.json" || !!channel.is_private;
        const item = { channel, sensitive };
        info.set(channel.id, item);
        if (typeof channel.name === "string") info.set(channel.name, item);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name) || !path.includes("/"))
      continue;
    const folder = posix.basename(posix.dirname(path));
    const history = histories.get(folder) || new Map();
    for (const raw of json(record, path)) {
      const message = slackMessage(raw);
      if (message && (!history.has(message.ts) || message.edited))
        history.set(message.ts, message);
    }
    histories.set(folder, history);
  }
  for (const [folder, history] of histories) {
    const { channel, sensitive } = info.get(folder) || { sensitive: true };
    const { id = folder, name = folder, members } = channel || {};
    const title =
      !channel?.name && Array.isArray(members)
        ? members.map((member) => users.get(member) || member).join(", ")
        : "#" + name;
    const group = key("slack", "conversation", id);
    const messages = [...history.values()].sort(
      (a, b) => a.time.localeCompare(b.time) || a.ts.localeCompare(b.ts),
    );
    const threads = new Set(
      messages
        .filter(
          (message) => message.thread_ts && message.thread_ts !== message.ts,
        )
        .map((message) => message.thread_ts),
    );
    const batches = new Map();
    for (const message of messages) {
      const thread =
        message.thread_ts !== message.ts ? message.thread_ts : undefined;
      const body = slackHtml(message, users, !!thread);
      if (!body) continue;
      const day = message.time.slice(0, 10);
      const bucket = thread ?? (threads.has(message.ts) ? message.ts : day);
      const batch = batches.get(bucket) || {
        day,
        thread: bucket !== day,
        entries: [],
      };
      batch.entries.push({ body, time: message.time });
      batches.set(bucket, batch);
    }
    let previousPage;
    for (const [bucket, { day, thread, entries }] of batches) {
      output.group(
        group,
        "Slack · " + title,
        "<p>Messages imported from Slack. Times are in UTC.</p>",
        entries.at(-1).time,
        sensitive,
      );
      output.countMessages(entries.length);
      const chunks = [];
      let content = "";
      for (const { body } of entries) {
        if (content && content.length + body.length > 650000) {
          chunks.push(content);
          content = "";
        }
        content += body;
      }
      if (content) chunks.push(content);
      chunks.forEach((html, index) => {
        const pageId = key("slack", "messages", id, bucket, html);
        output.page(group, {
          id: pageId,
          title: pageTitle(
            title +
              " · " +
              day +
              (thread ? " · Thread" : "") +
              (chunks.length > 1 ? " · " + (index + 1) : ""),
          ),
          html,
          kind: "note",
          updatedAt: entries.at(-1).time,
        });
        output.link(previousPage, pageId);
        previousPage = pageId;
      });
    }
  }
}

async function prepareMigration(file, source) {
  if (source !== "notion" && source !== "slack")
    throw new Error("Choose Notion or Slack.");
  let archive;
  try {
    archive = await readExport(file, source);
  } catch (error) {
    if (error instanceof MigrationZipError) throw error;
    throw new Error("Could not read the ZIP. Check the export and try again.");
  }
  const output = migration(source, basename(file), archive.attachments);
  if (source === "notion") importNotion(archive.files, output);
  else importSlack(archive.files, output);
  return output.finish();
}

module.exports = { prepareMigration, notionLinkPreview };
