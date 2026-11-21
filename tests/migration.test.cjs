const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { ZipFile } = require("yazl");
const {
  prepareMigration,
  notionLinkPreview,
} = require("../electron/migration.cjs");
const { notionUrl } = require("../electron/notion-link.cjs");
const { prepareConnectedNotionLink } = require("../electron/notion-api.cjs");
const { appendMigration } = require("../shared/migration.mjs");

async function fixtureZip(entries) {
  const zip = new ZipFile();
  for (const [name, value] of Object.entries(entries))
    zip.addBuffer(Buffer.isBuffer(value) ? value : Buffer.from(value), name);
  zip.end();
  const chunks = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function prepare(source, entries) {
  const folder = await mkdtemp(join(tmpdir(), "wallace-migration-"));
  try {
    const archive = join(folder, "Example.zip");
    await writeFile(archive, await fixtureZip(entries));
    return await prepareMigration(archive, source);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test("Notion ZIPs preserve page hierarchy, links, tables and skip attachment contents", async () => {
  const parent = "Roadmap aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const child = "Design bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const preview = await prepare("notion", {
    "export.zip": await fixtureZip({
      [parent + ".md"]:
        "# Roadmap\n\n[Design](" +
        encodeURI(parent + "/" + child + ".html") +
        ")\n\n<iframe src='https://example.com'></iframe>",
      [parent + "/" + child + ".html"]:
        "<html><body><article><h1>Design</h1><p onmouseover='x'>Design notes</p><a href='javascript:void(0)'>unsafe</a></article></body></html>",
      "Ideas cccccccccccccccccccccccccccccccc_all.csv":
        'Name,Details\n"Week 1","first, item"\n',
      [parent + "/photo.jpg"]: "example attachment",
      "index.html": "<p>Export index</p>",
    }),
  });
  const { pages, edges } = preview.workspace;
  const roadmap = pages.find((item) => item.title === "Roadmap");
  const design = pages.find((item) => item.title === "Design");
  assert.equal(pages.length, 3);
  assert.equal(preview.attachments, 1);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].source, roadmap.id);
  assert.equal(edges[0].target, design.id);
  assert(roadmap.html.includes('href="#' + design.id + '"'));
  assert.doesNotMatch(roadmap.html, /iframe/);
  assert.doesNotMatch(design.html, /onmouseover|javascript:/);
  assert.match(
    pages.find((item) => item.title === "Ideas").html,
    /<td>first, item<\/td>/,
  );

  const empty = {
    version: 1,
    pages: [],
    edges: [],
    conversations: [
      {
        id: "existing",
        title: "Existing",
        html: "",
        nodeIds: [],
        favorite: true,
        favoriteNodeIds: [],
        involved: true,
        updatedAt: "",
      },
    ],
  };
  const selection = preview.groups.map(({ id }) => id);
  const first = appendMigration(empty, preview.workspace, selection);
  assert.equal(first.pages, 3);
  assert.equal(first.workspace.conversations[0].title, "Existing");
  first.workspace.pages[0].title = "My edit";
  const retry = appendMigration(first.workspace, preview.workspace, selection);
  assert.equal(retry.pages, 0);
  assert.equal(retry.edges, 0);
  assert.equal(retry.workspace.pages[0].title, "My edit");
});

test("published Notion URLs accept only Notion hosts and normalize tracking and block fragments", () => {
  assert.equal(
    notionUrl("https://team.notion.site/Plan/?pvs=4#block").href,
    "https://team.notion.site/Plan",
  );
  for (const value of [
    "https://notion.site.example.com/Plan",
    "https://team.notion.site:8123/Plan",
    "https://name:password@team.notion.site/Plan",
    "http://notion.so/Plan",
    "https://127.0.0.1/Plan",
  ])
    assert.equal(notionUrl(value), null);
});

test("Notion link previews preserve graph links and share page IDs with ZIP imports", async () => {
  const url = "https://team.notion.site/Plan";
  const child = url + "/Draft-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const linked = notionLinkPreview(
    [
      {
        url,
        requestedUrl: url,
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        title: "Plan",
        attachments: 1,
        html:
          '<h1>Next steps</h1><a href="' +
          child +
          '?pvs=4">Draft</a>' +
          '<img src="https://example.com/test"><script>alert(1)</script>',
      },
      {
        url: child,
        requestedUrl: child,
        parent: url,
        title: "Draft",
        attachments: 0,
        html: "<p>Write the draft.</p>",
      },
    ],
    ["One restricted page"],
  );
  const [plan, draft] = linked.workspace.pages;
  assert.equal(linked.attachments, 1);
  assert.deepEqual(linked.warnings, ["One restricted page"]);
  assert.equal(linked.workspace.edges.length, 1);
  assert.equal(linked.workspace.edges[0].target, draft.id);
  assert.ok(plan.html.includes('href="#' + draft.id + '"'));
  assert.doesNotMatch(plan.html, /script|<img|alert/);
  const zip = await prepare("notion", {
    "Plan aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md": "# Plan",
  });
  assert.equal(zip.workspace.pages[0].id, plan.id);
  const added = appendMigration(zip.workspace, linked.workspace, [
    linked.groups[0].id,
  ]);
  assert.equal(added.pages, 1);
  assert.equal(added.edges, 1);
  assert.equal(
    appendMigration(added.workspace, linked.workspace, [linked.groups[0].id])
      .pages,
    0,
  );
});

test("connected Notion links use the official read endpoints and follow accessible child pages", async () => {
  const rootId = "a".repeat(32);
  const childId = "b".repeat(32);
  const root = "https://www.notion.so/Roadmap-" + rootId;
  const child = "https://www.notion.so/Design-" + childId;
  const result = await prepareConnectedNotionLink(
    root,
    "fixture-token",
    async (href, options) => {
      assert.equal(options.headers.Authorization, "Bearer fixture-token");
      assert.equal(options.redirect, "error");
      const url = new URL(href);
      assert.equal(url.origin, "https://api.notion.com");
      const [, version, resource, id, format] = url.pathname.split("/");
      assert.equal(version, "v1");
      assert.equal(resource, "pages");
      assert.ok([rootId, childId].includes(id));
      const isRoot = id === rootId;
      if (format === "markdown")
        return Response.json({
          markdown: isRoot
            ? '## Roadmap\n\n<page url="' +
              child +
              '">Design</page>\n\n![Attachment](https://example.com/image)'
            : "| Priority |\n| --- |\n| High |",
        });
      return Response.json({
        url: isRoot ? root : child,
        properties: {
          title: {
            type: "title",
            title: [{ plain_text: isRoot ? "Roadmap" : "Design" }],
          },
        },
      });
    },
  );
  assert.deepEqual(
    result.workspace.pages.map(({ title }) => title),
    ["Roadmap", "Design"],
  );
  assert.equal(result.workspace.edges.length, 1);
  assert.match(result.workspace.pages[1].html, /<td>High<\/td>/);
  assert.equal(result.attachments, 1);
  await assert.rejects(
    prepareConnectedNotionLink(
      root,
      "fixture-token",
      async () => new Response(null, { status: 404 }),
    ),
    /grant read access/,
  );
});

test("Slack ZIPs group replies across dates and identify public and private conversations", async () => {
  const root = "1767225600.000001";
  const entries = {
    "Slack/users.json": JSON.stringify([{ id: "U1", real_name: "Jin" }]),
    "Slack/channels.json": JSON.stringify([{ id: "C1", name: "product" }]),
    "Slack/dms.json": JSON.stringify([{ id: "D1", members: ["U1", "U2"] }]),
    "Slack/product/2026-01-01.json": JSON.stringify([
      { type: "message", ts: root, user: "U1", text: "Thread start" },
      {
        type: "message",
        ts: "1767225800.000013",
        user: "U1",
        text: "<@U1> &lt;safe&gt;",
      },
      {
        type: "message",
        subtype: "channel_join",
        ts: "1767225800.000018",
        user: "U1",
      },
    ]),
    "Slack/product/2026-01-02.json": JSON.stringify([
      {
        type: "message",
        ts: "1767312000.000002",
        thread_ts: root,
        user: "U2",
        text: "Thread reply",
        files: [
          { title: "Spec", permalink: "https://example.slack.com/files/spec" },
        ],
      },
      {
        type: "message",
        subtype: "message_changed",
        ts: "1767312001.000001",
        original_ts: "1767225800.000013",
        user: "U1",
        text: "Updated &lt;safe&gt;",
      },
    ]),
    "Slack/D1/2026-01-01.json": JSON.stringify([
      { type: "message", ts: root, user: "U1", text: "Private text" },
    ]),
  };
  const preview = await prepare("slack", entries);
  const publicGroup = preview.groups.find((group) => !group.sensitive);
  const privateGroup = preview.groups.find((group) => group.sensitive);
  assert.equal(publicGroup.title, "Slack · #product");
  assert.equal(privateGroup.title, "Slack · Jin, U2");
  assert.equal(preview.messages, 4);
  assert.equal(preview.workspace.pages.length, 3);
  const thread = preview.workspace.pages.find((item) =>
    item.title.endsWith("Thread"),
  );
  assert.match(
    thread.html,
    /Jin.*Thread start.*Replies.*Thread reply.*https:\/\/example\.slack\.com\/files\/spec/,
  );
  assert(
    preview.workspace.pages.some((item) =>
      /Updated &lt;safe&gt;/.test(item.html),
    ),
  );
  const sample = {
    ...preview.workspace,
    pages: [],
    edges: [],
    conversations: [
      {
        ...preview.workspace.conversations[0],
        id: "existing",
        nodeIds: [],
      },
    ],
  };
  const result = appendMigration(sample, preview.workspace, [publicGroup.id]);
  assert.equal(result.pages, 2);
  assert(
    result.workspace.pages.every((item) => !item.html.includes("Private text")),
  );
});

test("wrong export formats give a readable error", async () => {
  await assert.rejects(
    prepare("slack", { "README.md": "# Unrelated" }),
    /No Slack messages found/,
  );
  await assert.rejects(
    prepare("notion", { "Overview.pdf": "fake PDF" }),
    /No Notion pages found/,
  );
});

test("migrates a Notion launch workspace and makes related notes available to AI", async () => {
  const launch = "Atlas Launch " + "a".repeat(32);
  const research = "Customer Research " + "b".repeat(32);
  const decisions = "Decision Log " + "c".repeat(32);
  const interviews = "Interview Notes " + "d".repeat(32);
  const tracker = "Launch Tracker " + "e".repeat(32);
  const researchPath = launch + "/" + research;
  const decisionPath = launch + "/" + decisions;
  const preview = await prepare("notion", {
    "ExportBlock-Atlas.zip": await fixtureZip({
      [launch + ".md"]: [
        "# Atlas Launch",
        "Pilot onboarding for ten customer teams.",
        "[Research](" + encodeURI(researchPath + ".md") + ")",
        "[Decisions](" + encodeURI(decisionPath + ".md") + ")",
      ].join("\n\n"),
      [researchPath + ".md"]: [
        "# Customer Research",
        "Four teams manually reconciled their CSV imports.",
        "[Interviews](" + encodeURI(research + "/" + interviews + ".md") + ")",
        "[Related decision](" + encodeURI(decisions + ".md") + ")",
      ].join("\n\n"),
      [researchPath + "/" + interviews + ".md"]:
        "# Interview Notes\n\n> We need to see validation errors before importing.",
      [decisionPath + ".md"]:
        "# Decision Log\n\n## Confirmed\n\nShip a CSV validation preview before the pilot.",
      [launch + "/" + tracker + "_all.csv"]:
        'Name,Status,Owner,Acceptance criteria\n"CSV preview",In progress,Mina,"Show invalid rows, with reasons"\n"Pilot invites",Ready,Alex,"Ten customer teams"\n',
      [researchPath + "/onboarding-flow.png"]: "attachment placeholder",
    }),
  });
  assert.equal(preview.attachments, 1);
  const workspace = { version: 1, pages: [], edges: [], conversations: [] };
  const selection = preview.groups.map((group) => group.id);
  const imported = appendMigration(workspace, preview.workspace, selection);
  assert.equal(imported.pages, 5);
  const { pages, edges, conversations } = imported.workspace;
  const byTitle = new Map(pages.map((page) => [page.title, page]));
  const linked = (from, to) =>
    edges.some(
      (edge) =>
        edge.source === byTitle.get(from).id &&
        edge.target === byTitle.get(to).id,
    );
  assert(linked("Atlas Launch", "Customer Research"));
  assert(linked("Customer Research", "Interview Notes"));
  assert(linked("Customer Research", "Decision Log"));
  assert.match(
    byTitle.get("Launch Tracker").html,
    /<td>Show invalid rows, with reasons<\/td>/,
  );
  assert(
    byTitle
      .get("Customer Research")
      .html.includes('href="#' + byTitle.get("Decision Log").id + '"'),
  );
  const group = conversations.find((conversation) =>
    conversation.nodeIds.includes(byTitle.get("Atlas Launch").id),
  );
  const scope = new Set(group.nodeIds);
  const { prepareQuestion } = require("../shared/ai.mjs");
  const { sources, messages } = prepareQuestion({
    question: "What CSV validation should we ship before the pilot?",
    selectedId: byTitle.get("Customer Research").id,
    workspace: {
      version: 1,
      pages: pages.filter((page) => scope.has(page.id)),
      edges: edges.filter(
        (edge) => scope.has(edge.source) && scope.has(edge.target),
      ),
      conversations: [group],
    },
  });
  assert(sources.some((source) => source.title === "Decision Log"));
  assert.match(
    messages.at(-1).content,
    /Ship a CSV validation preview before the pilot/,
  );

  byTitle.get("Decision Log").title = "Reviewed Decision Log";
  const retry = appendMigration(
    imported.workspace,
    preview.workspace,
    selection,
  );
  assert.equal(retry.pages, 0);
  assert.equal(retry.edges, 0);
  assert.equal(
    retry.workspace.pages.find(
      (page) => page.id === byTitle.get("Decision Log").id,
    ).title,
    "Reviewed Decision Log",
  );
});
