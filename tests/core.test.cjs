const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  validateWorkspace,
  atomicWrite,
  endpoint,
  contextFor,
  request,
} = require("../electron/core.cjs");
const page = (id, title = id) => ({
  id,
  title,
  html: "<p>graph knowledge</p>",
  kind: "note",
  x: 0,
  y: 0,
  updatedAt: new Date().toISOString(),
});
const ws = {
  version: 1,
  pages: [page("one"), page("two"), page("three")],
  edges: [{ id: "e", source: "one", target: "two" }],
  conversations: [
    {
      id: "c",
      title: "Conversation",
      html: "<h2>Spec</h2>",
      nodeIds: ["one", "two", "three"],
      favorite: true,
      favoriteNodeIds: ["one"],
      involved: true,
      updatedAt: "2026-11-12",
    },
  ],
};
test("workspace roundtrip preserves graph and strips unexpected properties", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "wallace-"));
  try {
    const file = path.join(folder, "workspace.json");
    const checked = validateWorkspace({ ...ws, apiKey: "never-export" });
    await atomicWrite(file, checked);
    assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")), ws);
    await atomicWrite(file, { ...ws, pages: [...ws.pages, page("four")] });
    assert.equal(JSON.parse(await fs.readFile(file, "utf8")).pages.length, 4);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});
test("invalid and dangling graph structures are rejected", () => {
  for (const invalid of [
    { ...ws, version: 2 },
    { ...ws, pages: [page("one"), page("one")] },
    { ...ws, edges: [{ id: "bad", source: "one", target: "missing" }] },
    { ...ws, pages: [{ ...page("one"), x: NaN }] },
    { ...ws, edges: [{ id: "self", source: "one", target: "one" }] },
  ])
    assert.throws(() => validateWorkspace(invalid));
});
test("only secure cloud URLs and explicit local HTTP servers accepted", () => {
  assert.equal(
    endpoint("https://api.openai.com/v1/"),
    "https://api.openai.com/v1",
  );
  assert.equal(
    endpoint("http://127.0.0.1:11434/v1"),
    "http://127.0.0.1:11434/v1",
  );
  for (const url of [
    "http://example.com/v1",
    "file:///etc/passwd",
    "https://user:password@example.com",
    "https://example.com/?key=x",
  ])
    assert.throws(() => endpoint(url));
});
test("retrieval prioritizes selected page, graph neighbors and matching content with bounds", () => {
  const found = contextFor(ws, "one", "three");
  assert.equal(found[0].id, "one");
  assert.equal(found[1].id, "two");
  assert(!found[0].text.includes("<p>"));
  const many = {
    version: 1,
    pages: Array.from({ length: 20 }, (_, i) => ({
      ...page(`${i}`),
      html: "x".repeat(10000),
    })),
    edges: [],
  };
  const result = contextFor(many, "0", "");
  assert.equal(result.length, 8);
  assert.equal(result[0].text.length, 6000);
});
test("provider requests keep secret in header and reject redirect/error responses", async () => {
  let captured;
  const mock = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ choices: [] }) };
  };
  await request(
    "https://example.com/v1",
    "secret",
    "chat/completions",
    { method: "POST", body: "{}" },
    mock,
  );
  assert.equal(captured.url, "https://example.com/v1/chat/completions");
  assert.equal(captured.options.headers.Authorization, "Bearer secret");
  assert.equal(captured.options.redirect, "error");
  await assert.rejects(
    () =>
      request(
        "https://example.com/v1",
        "secret",
        "chat/completions",
        {},
        async () => ({ ok: false, status: 401 }),
      ),
    /401/,
  );
});

test("legacy workspace migration retains every page and relationship", () => {
  const { conversations, ...legacy } = ws;
  const migrated = validateWorkspace(legacy);
  assert.deepEqual(migrated.pages, ws.pages);
  assert.deepEqual(migrated.edges, ws.edges);
  assert.deepEqual(migrated.conversations[0].nodeIds, ["one", "two", "three"]);
  assert.deepEqual(migrated.conversations[0].favoriteNodeIds, []);
});
test("conversation specs and node bookmarks survive validated roundtrip", () => {
  const checked = validateWorkspace(ws);
  assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(checked))), ws);
  for (const change of [
    { nodeIds: ["missing"] },
    { favoriteNodeIds: ["missing"] },
    { nodeIds: ["one", "one"] },
    { favorite: "yes" },
  ])
    assert.throws(() =>
      validateWorkspace({
        ...ws,
        conversations: [{ ...ws.conversations[0], ...change }],
      }),
    );
});

test("purpose, reviewed outcome, project steps, and conversation-specific graph layout roundtrip", () => {
  const dated = "2026-11-13T10:00:00.000Z";
  const conversation = {
    ...ws.conversations[0],
    purpose: {
      kind: "problem",
      statement: "Identify the source",
      completedAt: dated,
    },
    aiTurns: [
      {
        author: "민지",
        question: "Where did it start?",
        answer: "Check the logs.",
        time: dated,
      },
    ],
    summary: {
      text: "Check the logs.",
      purpose: "problem:Identify the source",
      turnCount: 1,
      reviewedAt: dated,
    },
    project: {
      pageId: "one",
      steps: [{ id: "step-1", title: "Check the logs", done: false }],
    },
    positions: { two: { x: 200, y: 64 } },
  };
  const value = {
    ...ws,
    conversations: [conversation],
    profile: { name: "민지", icon: "star" },
    edges: [{ ...ws.edges[0], relationship: "addresses" }],
  };
  assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(value))), value);
  assert.throws(
    () =>
      validateWorkspace({
        ...value,
        conversations: [
          {
            ...conversation,
            project: { ...conversation.project, pageId: "missing" },
          },
        ],
      }),
    /project steps/,
  );
  assert.throws(
    () =>
      validateWorkspace({
        ...value,
        conversations: [
          { ...conversation, positions: { missing: { x: 0, y: 0 } } },
        ],
      }),
    /graph positions/,
  );
});
