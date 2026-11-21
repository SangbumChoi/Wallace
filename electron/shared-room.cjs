const http = require("node:http");
const os = require("node:os");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
} = require("node:crypto");
const { atomicWrite } = require("./core.cjs");

const randomToken = () => randomBytes(24).toString("hex");
const matches = (actual, expected) =>
  typeof actual === "string" &&
  actual.length === expected.length &&
  timingSafeEqual(Buffer.from(actual, "ascii"), Buffer.from(expected, "ascii"));
const privateIPv4 = (host) =>
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+(?:\.\d+){1,2}$/.test(
    host,
  );

function field(value, limit, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > limit)
    throw new Error(`${label} must be ${limit} characters or fewer.`);
  return value.trim();
}

async function body(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 24_000) throw new Error("The question is too long.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sharedRoom(directory, respond) {
  let active;
  let connecting = false;

  async function start(input) {
    const name = field(input?.name, 40, "Name");
    const title = field(input?.title, 80, "Room name");
    let id = randomUUID();
    const kinds = ["question", "decision", "problem"];
    let purpose = input.purpose
      ? field(input.purpose, 12000, "Purpose")
      : undefined;
    let purposeKind = kinds.includes(input.purposeKind)
      ? input.purposeKind
      : undefined;
    const file = path.join(
      directory,
      createHash("sha256").update(title).digest("hex") + ".json",
    );
    let turns = [];
    try {
      const saved = JSON.parse(await fs.readFile(file, "utf8"));
      id = saved.id ?? id;
      purpose ??= saved.purpose;
      purposeKind ??= saved.purposeKind;
      turns = saved.turns.map((turn) =>
        turn.status === "pending"
          ? {
              ...turn,
              status: "error",
              answer: "The host closed the room before the answer was ready.",
            }
          : turn,
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const code = randomToken();
    const members = new Map();
    let disk = Promise.resolve();
    let answers = Promise.resolve();
    let pending = 0;
    let stopping = false;
    let stopPromise;
    const pruneMembers = () => {
      for (const [token, member] of members) {
        if (Date.now() - member.lastSeen > 5 * 60 * 1000) members.delete(token);
      }
    };
    const state = () => {
      pruneMembers();
      return {
        id,
        title,
        purpose: purpose ?? turns[0]?.question,
        purposeKind: purposeKind ?? (turns.length ? "question" : undefined),
        turns,
        members: members.size + 1,
        role: "host",
      };
    };
    const persist = () => {
      const snapshot = {
        id,
        title,
        purpose,
        purposeKind,
        turns: turns.map((turn) => ({ ...turn })),
      };
      const next = disk.then(() => atomicWrite(file, snapshot));
      disk = next.catch(() => {});
      return next;
    };
    async function ask(author, question) {
      question = field(question, 4000, "Question");
      if (stopping || pending >= 4)
        throw new Error("Wait for an answer before asking another question.");
      if (turns.length >= 300)
        throw new Error("This room can store up to 300 questions.");
      pending++;
      const turn = {
        id: randomUUID(),
        author,
        question,
        time: new Date().toISOString(),
        status: "pending",
      };
      turns.push(turn);
      try {
        await persist();
      } catch (error) {
        turns = turns.filter((item) => item !== turn);
        pending--;
        throw error;
      }
      answers = answers
        .then(async () => {
          const history = turns
            .slice(0, turns.indexOf(turn))
            .filter((item) => item.status === "done")
            .slice(-6);
          try {
            const { answer, runtime } = await respond(question, history, {
              purpose: purpose ?? turns[0]?.question,
              purposeKind: purposeKind ?? "question",
            });
            turn.answer = answer.slice(0, 8000);
            turn.runtime = runtime;
            turn.status = "done";
          } catch {
            turn.answer =
              "The host’s AI did not respond. Check the connection and try again.";
            turn.status = "error";
          } finally {
            pending--;
            await persist();
          }
        })
        .catch((error) =>
          console.error("Shared room save failed:", error.message),
        );
    }

    const server = http.createServer(async (req, res) => {
      const reply = (status, value) => {
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(value));
      };
      try {
        if (
          stopping ||
          !privateIPv4(req.socket.remoteAddress ?? "") ||
          req.headers.origin
        )
          return reply(403, { error: "Connect from the same local network." });
        const auth = /^Bearer ([0-9a-f]{48})$/.exec(
          req.headers.authorization ?? "",
        )?.[1];
        pruneMembers();
        if (req.method === "POST" && req.url === "/join") {
          if (!matches(auth, code))
            return reply(401, { error: "Check your invitation details." });
          const name = field((await body(req)).name, 40, "Name");
          if (members.size >= 20)
            return reply(409, { error: "This room is full." });
          const token = randomToken();
          members.set(token, { name, lastSeen: Date.now() });
          return reply(200, { token });
        }
        const member = members.get(auth);
        if (!member)
          return reply(401, {
            error: "Reconnect using your invitation details.",
          });
        member.lastSeen = Date.now();
        if (req.method === "GET" && req.url === "/state") {
          const { role, ...snapshot } = state();
          return reply(200, snapshot);
        }
        if (req.method === "POST" && req.url === "/ask") {
          await ask(member.name, (await body(req)).question);
          return reply(200, {});
        }
        if (req.method === "POST" && req.url === "/leave") {
          members.delete(auth);
          return reply(200, {});
        }
        reply(404, { error: "This request is not supported." });
      } catch (error) {
        reply(400, { error: error.message });
      }
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 5000;
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "0.0.0.0", resolve);
    });
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter(
        (entry) =>
          entry?.family === "IPv4" &&
          !entry.internal &&
          privateIPv4(entry.address),
      )
      .map((entry) => entry.address);
    const invitations = [...new Set(addresses)].map(
      (address) => `http://${address}:${server.address().port}#${code}`,
    );
    try {
      await persist();
    } catch (error) {
      server.close();
      throw error;
    }
    return {
      state: () => ({ ...state(), invitations }),
      ask: (question) => ask(name, question),
      stop() {
        stopping = true;
        stopPromise ??= (async () => {
          await new Promise((resolve) => server.close(resolve));
          await answers;
          await disk;
        })();
        return stopPromise;
      },
      closeNow() {
        server.close();
        server.closeAllConnections();
      },
    };
  }

  async function join(input) {
    const invite = new URL(field(input?.invite, 240, "Invite link"));
    if (
      invite.protocol !== "http:" ||
      !privateIPv4(invite.hostname) ||
      !invite.port ||
      invite.username ||
      invite.password ||
      invite.search ||
      invite.pathname !== "/" ||
      !/^#[0-9a-f]{48}$/.test(invite.hash)
    )
      throw new Error("Enter the local invite link copied from Wallace.");
    const name = field(input.name, 40, "Name");
    async function request(route, token, payload) {
      const res = await fetch(invite.origin + route, {
        method: payload === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Could not connect to the room.");
      return data;
    }
    const { token } = await request("/join", invite.hash.slice(1), { name });
    return {
      state: async () => ({
        ...(await request("/state", token)),
        role: "member",
      }),
      ask: (question) => request("/ask", token, { question }),
      stop: () => request("/leave", token, {}).catch(() => {}),
      closeNow: () => {
        void request("/leave", token, {}).catch(() => {});
      },
    };
  }

  return {
    async connect(input) {
      if (active || connecting)
        throw new Error("You are already connected to a shared room.");
      connecting = true;
      try {
        active =
          input?.role === "host" ? await start(input) : await join(input);
        return await active.state();
      } catch (error) {
        active?.closeNow();
        active = undefined;
        throw error;
      } finally {
        connecting = false;
      }
    },
    state: () => active?.state() ?? null,
    ask(question) {
      if (!active) throw new Error("Connect to a shared room first.");
      return active.ask(question);
    },
    async stop() {
      if (active) {
        await active.stop();
        active = undefined;
      }
    },
    closeNow: () => active?.closeNow(),
  };
}

module.exports = { sharedRoom };
