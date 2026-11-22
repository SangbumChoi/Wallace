const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { cloudServer } = require("../server/cloud.mjs");

test("shared workspace authenticates, merges separate note edits, and protects competing edits", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "wallace-cloud-"));
  const file = path.join(folder, "workspace.sqlite");
  const token = "test-only-cloud-token-0123456789abc";
  let server;
  const note = (id) => ({
    id,
    title: id,
    html: "",
    kind: "note",
    x: 0,
    y: 0,
    updatedAt: "2026-11-14",
  });
  const first = {
    version: 1,
    profile: { name: "Private profile", icon: "initial" },
    pages: [note("a"), note("b")],
    conversations: [
      {
        id: "c",
        title: "Notes",
        html: "",
        nodeIds: ["a", "b"],
        favorite: false,
        involved: true,
        updatedAt: "2026-11-14",
      },
    ],
    edges: [{ id: "e", source: "a", target: "b" }],
  };
  async function start() {
    server = cloudServer({ file, token });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return "http://127.0.0.1:" + server.address().port + "/v1/workspace";
  }
  async function stop() {
    if (!server?.listening) return;
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    let url = await start();
    const headers = {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    };
    const put = (baseRevision, workspace) =>
      fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({ baseRevision, workspace }),
      });
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers })).status, 404);
    const published = await (await put(0, first)).json();
    assert.equal(published.revision, 1);
    assert.equal(published.workspace.profile, undefined);
    assert.equal((await fetch(url + "?since=1", { headers })).status, 304);
    const left = structuredClone(published.workspace);
    const right = structuredClone(published.workspace);
    left.pages[0].html = "<p>left</p>";
    right.pages[1].html = "<p>right</p>";
    assert.equal((await (await put(1, left)).json()).revision, 2);
    const merged = await (await put(1, right)).json();
    assert.equal(merged.revision, 3);
    assert.deepEqual(
      merged.workspace.pages.map((page) => page.html),
      ["<p>left</p>", "<p>right</p>"],
    );
    right.pages[0].html = "<p>competing</p>";
    const conflict = await put(1, right);
    assert.equal(conflict.status, 409);
    assert.deepEqual((await conflict.json()).conflicts, ["Note · a"]);
    await stop();
    url = await start();
    assert.deepEqual(await (await fetch(url, { headers })).json(), merged);
  } finally {
    await stop();
    await fs.rm(folder, { recursive: true, force: true });
  }
});
