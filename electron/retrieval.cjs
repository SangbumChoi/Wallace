const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const {
  atomicWrite,
  endpoint,
  request,
  validateWorkspace,
} = require("./core.cjs");
const defaults = {
  mode: "keyword",
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "",
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
function chunksFor(workspace) {
  const chunks = [];
  for (const page of validateWorkspace(workspace).pages) {
    const text = page.html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    for (let offset = 0; offset < Math.max(1, text.length); offset += 1200) {
      const part = text.slice(offset, offset + 1400);
      chunks.push({
        id: page.id,
        title: page.title,
        text: part,
        offset,
        hash: hash(page.id + "\0" + page.title + "\0" + offset + "\0" + part),
      });
      if (chunks.length > 20000)
        throw Error("This workspace exceeds the 20,000 passage index limit.");
    }
  }
  return chunks;
}
function postings(chunks) {
  const result = Object.create(null);
  chunks.forEach((chunk, index) => {
    for (const term of new Set(
      (chunk.title + " " + chunk.text)
        .toLowerCase()
        .match(/[\p{L}\p{N}_]+/gu) ?? [],
    ))
      (result[term] ??= []).push(index);
  });
  return result;
}
function cosine(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
function retrieval({ settingsFile, indexFile, storage, fetcher = fetch }) {
  let settingsQueue = Promise.resolve();
  const builds = new Map();
  const progress = new Map();
  async function read(file, fallback) {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return fallback;
      throw error;
    }
  }
  const config = () => read(settingsFile, defaults);
  const signature = (c) => c.baseUrl + "\0" + c.model;
  const publicConfig = (c) => ({
    mode: c.mode,
    baseUrl: c.baseUrl,
    model: c.model,
    hasKey: !!c.encryptedKey,
  });
  function validate(input) {
    if (!["keyword", "hybrid"].includes(input?.mode))
      throw Error("Choose a search mode.");
    const model = typeof input.model === "string" ? input.model.trim() : "";
    if (model.length > 200 || (input.mode === "hybrid" && !model))
      throw Error("Enter an embedding model name.");
    return { mode: input.mode, baseUrl: endpoint(input.baseUrl), model };
  }
  async function key(c) {
    return c.encryptedKey
      ? (
          await storage.decryptStringAsync(
            Buffer.from(c.encryptedKey, "base64"),
          )
        ).result
      : "";
  }
  async function embed(c, texts, suppliedKey) {
    const data = await request(
      c.baseUrl,
      suppliedKey ?? (await key(c)),
      "embeddings",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: c.model,
          input: texts,
          encoding_format: "float",
        }),
      },
      fetcher,
    );
    if (!Array.isArray(data.data) || data.data.length !== texts.length)
      throw Error("The embedding server returned an incomplete result.");
    const vectors = new Array(texts.length);
    for (const item of data.data) {
      if (
        !Number.isInteger(item.index) ||
        item.index < 0 ||
        item.index >= texts.length ||
        vectors[item.index] ||
        !Array.isArray(item.embedding) ||
        !item.embedding.length ||
        item.embedding.length > 16384 ||
        item.embedding.some((n) => typeof n !== "number" || !Number.isFinite(n))
      )
        throw Error("The embedding server returned invalid vectors.");
      vectors[item.index] = item.embedding;
    }
    if (vectors.some((v) => v.length !== vectors[0].length))
      throw Error("Embedding dimensions do not match.");
    return vectors;
  }
  async function draft(input) {
    const next = validate(input),
      old = await config();
    return {
      ...next,
      encryptedKey:
        next.baseUrl === old.baseUrl && !input.clearKey
          ? old.encryptedKey
          : undefined,
    };
  }
  function typedKey(value) {
    if (
      value !== undefined &&
      (typeof value !== "string" || value.length > 4096 || /[\r\n]/.test(value))
    )
      throw Error("Check the API key format.");
    return value?.trim();
  }
  async function status(id, workspace) {
    const c = await config(),
      chunks = chunksFor(workspace);
    const index = await read(indexFile(id), null);
    const current = new Set(chunks.map((item) => item.hash));
    const matching = (index?.chunks ?? []).filter((item) =>
      current.has(item.hash),
    );
    const vectors =
      index?.signature === signature(c)
        ? matching.filter((item) => item.vector).length
        : 0;
    return {
      passages: chunks.length,
      indexed: matching.length,
      vectors,
      stale: Math.max(0, chunks.length - vectors),
      updatedAt: index?.updatedAt ?? null,
      progress: progress.get(id) ?? null,
    };
  }
  async function search(id, workspace, query, selectedId, overrideMode) {
    if (typeof query !== "string" || !query.trim() || query.length > 12000)
      throw Error("Enter a search query.");
    const chunks = chunksFor(workspace),
      c = await config();
    const index = await read(indexFile(id), null);
    const term = query.toLowerCase().trim();
    const words = [...new Set(term.match(/[\p{L}\p{N}_]+/gu) ?? [])];
    // Use the saved inverted index only when it exactly matches the current scope.
    const useSaved =
      index?.chunks.length === chunks.length &&
      chunks.every((item, i) => item.hash === index.chunks[i].hash);
    const inverted = useSaved ? index.postings : postings(chunks);
    const exact = new Map();
    for (const word of words)
      for (const i of inverted[word] ?? [])
        exact.set(i, (exact.get(i) ?? 0) + 2);
    let mode = "keyword",
      warning = "";
    const vectorMap = new Map(
      index?.signature === signature(c)
        ? index.chunks
            .filter((item) => item.vector)
            .map((item) => [item.hash, item.vector])
        : [],
    );
    let queryVector;
    if ((overrideMode ?? c.mode) === "hybrid" && chunks.length) {
      if (chunks.some((item) => vectorMap.has(item.hash))) {
        try {
          [queryVector] = await embed(c, [query]);
          mode = "hybrid";
        } catch {
          warning = "Embedding search unavailable. Used local keyword search.";
        }
      } else warning = "No current embedding index. Used local keyword search.";
    }
    const ranked = chunks
      .map((item, i) => {
        const text = (item.title + " " + item.text).toLowerCase();
        const lexical =
          (exact.get(i) ?? 0) +
          (text.includes(term) ? 8 : 0) +
          words.filter((word) => text.includes(word)).length;
        const vector = vectorMap.get(item.hash);
        if (queryVector && vector && vector.length !== queryVector.length)
          warning = "Some embedding dimensions changed. Rebuild the index.";
        const semantic =
          queryVector && vector ? Math.max(0, cosine(queryVector, vector)) : 0;
        return {
          ...item,
          score: lexical + semantic * 5 + (selectedId === item.id ? 20 : 0),
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    const results = [];
    const seen = new Set();
    for (const item of ranked) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      results.push({
        id: item.id,
        title: item.title,
        text: item.text,
        score: item.score,
      });
      if (results.length === 8) break;
    }
    return { mode, warning, results };
  }
  return {
    settings: async () => publicConfig(await config()),
    save: (input) => {
      const next = settingsQueue.then(async () => {
        const c = await draft(input),
          token = typedKey(input.apiKey);
        if (token && !input.clearKey) {
          if (!(await storage.isAsyncEncryptionAvailable()))
            throw Error("Secure storage unavailable.");
          c.encryptedKey = (await storage.encryptStringAsync(token)).toString(
            "base64",
          );
        }
        await atomicWrite(settingsFile, c);
        return publicConfig(c);
      });
      settingsQueue = next.catch(() => {});
      return next;
    },
    test: async (input) => {
      const c = await draft(input);
      if (!c.model) throw Error("Enter an embedding model name.");
      const [vector] = await embed(
        c,
        ["Wallace embedding connection test."],
        typedKey(input.apiKey) || undefined,
      );
      return { dimensions: vector.length };
    },
    models: async (input) => {
      const c = await draft({ ...input, mode: "keyword" });
      const data = await request(
        c.baseUrl,
        typedKey(input.apiKey) || (await key(c)),
        "models",
        { method: "GET" },
        fetcher,
      );
      if (!Array.isArray(data.data))
        throw Error("The server did not return a model list.");
      return data.data
        .map((item) => item.id)
        .filter((id) => typeof id === "string" && id.length <= 200)
        .slice(0, 2000);
    },
    status,
    build: (id, workspace) => {
      if (builds.has(id))
        throw Error("An index update is already running for this workspace.");
      const task = (async () => {
        const c = await config(),
          chunks = chunksFor(workspace);
        const old = await read(indexFile(id), null);
        const cache = new Map(
          old?.signature === signature(c)
            ? old.chunks
                .filter((item) => item.vector)
                .map((item) => [item.hash, item.vector])
            : [],
        );
        const pending = chunks.filter((item) => !cache.has(item.hash));
        progress.set(id, {
          completed: chunks.length - pending.length,
          total: chunks.length,
        });
        if (c.mode === "hybrid") {
          for (let i = 0; i < pending.length; i += 16) {
            const batch = pending.slice(i, i + 16);
            const vectors = await embed(
              c,
              batch.map((item) => item.title + "\n" + item.text),
            );
            vectors.forEach((vector, index) =>
              cache.set(batch[index].hash, vector),
            );
            progress.set(id, {
              completed:
                chunks.length -
                pending.length +
                Math.min(i + 16, pending.length),
              total: chunks.length,
            });
          }
          const dimensions = new Set(
            chunks.map((item) => cache.get(item.hash)?.length),
          );
          if (dimensions.size > 1)
            throw Error(
              "Embedding dimensions changed. Clear the index and rebuild.",
            );
        }
        if (signature(await config()) !== signature(c))
          throw Error(
            "Embedding settings changed. Rebuild using the new model.",
          );
        await atomicWrite(indexFile(id), {
          signature: signature(c),
          updatedAt: new Date().toISOString(),
          chunks: chunks.map((item) => ({
            ...item,
            ...(cache.has(item.hash) ? { vector: cache.get(item.hash) } : {}),
          })),
          postings: postings(chunks),
        });
      })().finally(() => {
        builds.delete(id);
        progress.delete(id);
      });
      builds.set(id, task);
      return task.then(() => status(id, workspace));
    },
    clear: async (id) => {
      if (builds.has(id))
        throw Error("Wait for the current index update to finish.");
      await fs.rm(indexFile(id), { force: true });
    },
    search,
  };
}
module.exports = { retrieval, chunksFor, cosine };
