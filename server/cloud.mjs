import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mergeWorkspaces, sharedWorkspace } from "../shared/cloud.mjs";

const maxBytes = 25_000_000;
const digest = (value) => createHash("sha256").update(value).digest();
const revisionNumber = (value) => Number.isSafeInteger(value) && value >= 0;

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes)
      throw new RangeError("The workspace size limit is 25 MB.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function cloudServer({ file, token }) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token ?? ""))
    throw new Error(
      "WALLACE_CLOUD_TOKEN needs 32–128 URL-safe characters. Run npm run cloud:token to generate one.",
    );
  if (file !== ":memory:")
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY,
      saved_at TEXT NOT NULL,
      workspace TEXT NOT NULL
    )`);
  const current = db.prepare(
    "SELECT * FROM revisions ORDER BY id DESC LIMIT 1",
  );
  const revision = db.prepare("SELECT workspace FROM revisions WHERE id = ?");
  const insert = db.prepare(
    "INSERT INTO revisions (id, saved_at, workspace) VALUES (?, ?, ?)",
  );
  const prune = db.prepare("DELETE FROM revisions WHERE id <= ?");
  const expected = digest("Bearer " + token);

  const server = createServer(async (request, response) => {
    function reply(status, data) {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(data === undefined ? undefined : JSON.stringify(data));
    }
    let url;
    try {
      url = new URL(request.url ?? "/", "http://localhost");
    } catch {
      return reply(400, { error: "Check the path." });
    }
    if (request.method === "GET" && url.pathname === "/healthz")
      return reply(200, { ok: true });
    if (url.pathname !== "/v1/workspace")
      return reply(404, { error: "The path could not be found." });
    if (!timingSafeEqual(digest(request.headers.authorization ?? ""), expected))
      return reply(401, {
        error: "Check your shared workspace access key.",
      });

    if (request.method === "GET") {
      const row = current.get();
      if (!row)
        return reply(404, { error: "No workspace has been saved yet." });
      if (url.searchParams.get("since") === String(row.id)) return reply(304);
      return reply(200, {
        revision: row.id,
        savedAt: row.saved_at,
        workspace: JSON.parse(row.workspace),
      });
    }
    if (request.method !== "PUT")
      return reply(405, { error: "This request is not supported." });
    let input, workspace;
    try {
      input = await readBody(request);
      if (!revisionNumber(input?.baseRevision))
        throw new Error("The workspace version is invalid.");
      workspace = sharedWorkspace(input.workspace);
    } catch (error) {
      return reply(error instanceof RangeError ? 413 : 400, {
        error: error.message,
      });
    }
    try {
      db.exec("BEGIN IMMEDIATE");
      const latest = current.get();
      const version = latest?.id ?? 0;
      if (input.baseRevision !== version) {
        const base = revision.get(input.baseRevision);
        const merged =
          base &&
          latest &&
          mergeWorkspaces(
            JSON.parse(base.workspace),
            workspace,
            JSON.parse(latest.workspace),
          );
        if (!merged?.workspace) {
          db.exec("ROLLBACK");
          return reply(409, {
            error: "The server also has changes.",
            conflicts: merged?.conflicts ?? [
              "Reload the latest server version before continuing.",
            ],
          });
        }
        workspace = merged.workspace;
      }
      const serialized = JSON.stringify(workspace);
      if (Buffer.byteLength(serialized) > maxBytes) {
        db.exec("ROLLBACK");
        return reply(413, { error: "The workspace size limit is 25 MB." });
      }
      if (serialized === latest?.workspace) {
        db.exec("COMMIT");
        return reply(200, {
          revision: version,
          savedAt: latest.saved_at,
          workspace,
        });
      }
      const savedAt = new Date().toISOString();
      insert.run(version + 1, savedAt, serialized);
      prune.run(version - 99);
      db.exec("COMMIT");
      reply(200, { revision: version + 1, savedAt, workspace });
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      console.error("Workspace save failed:", error.message);
      reply(503, {
        error: "The server could not save the workspace. Try again.",
      });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.on("close", () => db.close());
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.WALLACE_CLOUD_HOST ?? "127.0.0.1";
  const file =
    process.env.WALLACE_CLOUD_DB ?? "./wallace-cloud/workspace.sqlite";
  const server = cloudServer({ file, token: process.env.WALLACE_CLOUD_TOKEN });
  server.listen(port, host, () =>
    console.log(`Wallace workspace listening on ${host}:${port}`),
  );
}
