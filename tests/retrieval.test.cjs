const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { retrieval } = require("../electron/retrieval.cjs");
const page = (id, text) => ({ id, title: id, html: "<p>" + text + "</p>", kind: "note", x: 0, y: 0, updatedAt: new Date().toISOString() });
const workspace = pages => ({ version: 1, pages, edges: [], conversations: [] });

test("keyword and hybrid index: scope, incremental reuse, model invalidation, deletion, and fallback", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wallace-search-"));
  const batches = [];
  let fail = false, malformed = false;
  const engine = retrieval({
    settingsFile: path.join(dir, "settings.json"), indexFile: id => path.join(dir, id + ".json"),
    storage: {},
    fetcher: async (url, options) => {
      if (fail) throw Error("offline");
      assert.equal(url, "http://127.0.0.1:11434/v1/embeddings");
      const input = JSON.parse(options.body).input;
      batches.push(input);
      return Response.json({ data: input.map((text, index) => ({ index, embedding: malformed ? [] : /car|vehicle/i.test(text) ? [1, 0] : [0, 1] })) });
    },
  });
  try {
    const ws = workspace([page("transport", "A car moves people."), page("food", "Apples are fruit.")]);
    await engine.build("one", ws);
    assert.equal(batches.length, 0);
    assert.equal((await engine.search("one", ws, "APPLES")).results[0].id, "food");
    const long = workspace([page("long", "intro ".repeat(1200) + "깊은색인목표")]);
    assert.match((await engine.search("one", long, "색인목표")).results[0].text, /깊은색인목표/);
    assert.equal((await engine.search("one", ws, ".*")).results.length, 0, "Search is literal, not regex");
    const config = { mode: "hybrid", baseUrl: "http://127.0.0.1:11434/v1", model: "fixture" };
    await engine.save(config);
    await engine.build("one", ws);
    assert.equal(batches.length, 1);
    assert.equal((await engine.status("one", ws)).vectors, 2);
    await engine.build("one", ws);
    assert.equal(batches.length, 1, "Unchanged vectors are reused");
    assert.equal((await engine.search("one", ws, "vehicle")).results[0].id, "transport");
    const scoped = workspace([ws.pages[1]]);
    assert.equal((await engine.search("one", scoped, "car")).results.some(item => item.id === "transport"), false, "No context from another conversation");
    const edited = workspace([page("transport", "A bicycle is pedal powered."), ws.pages[1]]);
    assert.equal((await engine.status("one", edited)).vectors, 1);
    assert.equal((await engine.search("one", edited, "car", undefined, "keyword")).results.length, 0, "Stale text is excluded before rebuilding");
    const before = batches.length;
    await engine.build("one", edited);
    assert.equal(batches.length, before + 1);
    assert.equal(batches.at(-1).length, 1, "Only changed content is embedded");
    assert.equal((await engine.status("two", ws)).indexed, 0);
    await engine.save({ ...config, model: "new-model" });
    assert.equal((await engine.status("one", edited)).vectors, 0);
    await engine.build("one", edited);
    fail = true;
    const fallback = await engine.search("one", edited, "bicycle");
    assert.equal(fallback.mode, "keyword");
    assert.match(fallback.warning, /unavailable/);
    assert.equal(fallback.results[0].id, "transport");
    fail = false; malformed = true;
    await assert.rejects(engine.test(config), /invalid vectors/);
    await engine.clear("one");
    assert.equal((await engine.status("one", ws)).indexed, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
