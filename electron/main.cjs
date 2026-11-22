const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  session,
  systemPreferences,
  Menu,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { fileURLToPath } = require("node:url");
const {
  validateWorkspace,
  contextFor,
  atomicWrite,
  endpoint,
  request,
} = require("./core.cjs");
const {
  migrateSettings,
  connectionConfig,
  settingsConfig,
  speechConfig,
  publicSettings,
} = require("./ai-settings.cjs");
const { prepareQuestion } = require("../shared/ai.mjs");
const { aiRuntime } = require("../shared/workspace.mjs");
const { cloudClient } = require("./cloud.cjs");
const { localSpeech } = require("./local-stt.cjs");
const {
  checkInstaller,
  installerVersion,
  compareVersion,
} = require("./updates.cjs");
const credentials = require("./credential-storage.cjs").credentialStorage(
  safeStorage,
);
const dev = !app.isPackaged && process.argv.includes("--dev");
let win,
  queue = Promise.resolve(),
  canClose = false,
  quitting = false;
if (!app.isPackaged && process.env.WALLACE_TEST_USER_DATA)
  app.setPath("userData", process.env.WALLACE_TEST_USER_DATA);
const file = (name) => path.join(app.getPath("userData"), name);
const {
  defaultLibrary,
  defaultWorkspaceId,
  workspaceId,
  workspaceLibrary,
} = require("../shared/workspace-library.mjs");
function workspaceFile(id, name) {
  const key = workspaceId(id);
  return key === defaultWorkspaceId
    ? file(name)
    : file(path.join("workspaces", key, name));
}
const speech = localSpeech(
  file("local-stt"),
  path.join(app.isPackaged ? process.resourcesPath : __dirname, "local-stt.py"),
);
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
async function readSettings() {
  try {
    return migrateSettings(
      JSON.parse(await fs.readFile(file("settings.json"), "utf8")),
    );
  } catch (e) {
    if (e.code === "ENOENT") return migrateSettings({});
    throw new Error("Could not read the settings file.");
  }
}

async function readKey(settings, baseUrl) {
  const encrypted = settings.encryptedKeys[baseUrl];
  return encrypted ? credentials.read(encrypted) : undefined;
}

function typedKey(value) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 4096 || /[\r\n]/.test(value))
    throw new Error("Check the API key format.");
  return value.trim();
}

async function changeKey(keys, baseUrl, value, clear) {
  if (clear) {
    delete keys[baseUrl];
    return;
  }
  const key = typedKey(value);
  if (!key) return;
  keys[baseUrl] = await credentials.encode(key);
}

function chatRequest(baseUrl, key, model, messages) {
  return request(baseUrl, key, "chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
}

const { sharedRoom } = require("./shared-room.cjs");
const room = sharedRoom(
  file("shared-ai-rooms"),
  async (question, history, purpose) => {
    const settings = await readSettings();
    return describeReply(
      await chatRequest(
        settings.baseUrl,
        await readKey(settings, settings.baseUrl),
        settings.model,
        [
          {
            role: "system",
            content:
              "You are Wallace in a shared workspace. Work toward the room's purpose and use the shared conversation as context. For a question, clarify what needs to be known. For a decision, surface criteria and trade-offs. For a problem, connect proposed solutions to the underlying issue. Ask one focused follow-up when needed. Use the language of the latest question and say when you do not know. Format replies in Markdown when headings, lists, tables, or code blocks improve readability. Room information is context.",
          },
          ...(purpose.purpose
            ? [{ role: "user", content: JSON.stringify(purpose) }]
            : []),
          ...history.flatMap((turn) => [
            { role: "user", content: turn.question },
            { role: "assistant", content: turn.answer },
          ]),
          { role: "user", content: question },
        ],
      ),
      settings.model,
    );
  },
);

function describeReply(result, model) {
  const version = app.getVersion();
  return {
    answer: chatText(result),
    runtime: aiRuntime(result.model, version) ?? aiRuntime(model, version),
  };
}

function chatText(result) {
  const answer = result.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim())
    throw new Error("The AI server did not return a text reply.");
  return answer;
}
function trusted(event) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame
  )
    throw new Error("This request is not permitted.");
  const url = event.senderFrame.url;
  if (
    dev
      ? new URL(url).origin !== "http://127.0.0.1:5173"
      : !url.startsWith("file:") ||
        fileURLToPath(url) !== path.join(__dirname, "../dist/index.html")
  )
    throw new Error("This view is not permitted.");
}
function handle(name, fn) {
  ipcMain.handle(name, async (e, ...args) => {
    trusted(e);
    return fn(...args);
  });
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission) =>
      contents === win?.webContents && permission === "media",
  );
  session.defaultSession.setPermissionRequestHandler(
    async (contents, permission, callback, details) => {
      if (
        contents !== win?.webContents ||
        permission !== "media" ||
        details.mediaTypes?.some((t) => t !== "audio")
      )
        return callback(false);
      if (process.platform === "darwin")
        return callback(
          await systemPreferences.askForMediaAccess("microphone"),
        );
      callback(true);
    },
  );
  handle("window:closeReady", async () => {
    await queue;
    canClose = true;
    if (quitting) app.quit();
    else win.close();
  });
  const cloudActions = cloudClient(file("cloud-link.json"), safeStorage);
  for (const name of Object.keys(cloudActions))
    handle("cloud:" + name, (id, ...args) =>
      cloudClient(workspaceFile(id, "cloud-link.json"), safeStorage)[name](
        ...args,
      ),
    );
  handle("workspace:library", async () => {
    try {
      return workspaceLibrary(
        JSON.parse(await fs.readFile(file("workspace-library.json"), "utf8")),
      );
    } catch (error) {
      if (error.code === "ENOENT") return defaultLibrary;
      throw error;
    }
  });
  handle("workspace:saveLibrary", (value) => {
    const library = workspaceLibrary(value);
    const next = queue.then(() =>
      atomicWrite(file("workspace-library.json"), library),
    );
    queue = next.catch(() => {});
    return next;
  });
  handle("workspace:load", async (id) => {
    try {
      return validateWorkspace(
        JSON.parse(
          await fs.readFile(workspaceFile(id, "workspace.json"), "utf8"),
        ),
      );
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw new Error(
        "Could not read the workspace. The original file is intact.",
      );
    }
  });
  handle("workspace:save", (value, id) => {
    const ws = validateWorkspace(value);
    const destination = workspaceFile(id, "workspace.json");
    const next = queue.then(() => atomicWrite(destination, ws));
    queue = next.catch(() => {});
    return next;
  });
  handle("workspace:export", async (value, presentation) => {
    const ws = validateWorkspace(value);
    if (presentation !== undefined && typeof presentation !== "string")
      throw new Error("Check the presentation content.");
    const extension = presentation === undefined ? "json" : "html";
    const result = await dialog.showSaveDialog(win, {
      defaultPath: `Wallace-workspace.${extension}`,
      filters: [{ name: "Wallace workspace", extensions: [extension] }],
    });
    if (result.canceled) return false;
    if (presentation === undefined) await atomicWrite(result.filePath, ws);
    else await fs.writeFile(result.filePath, presentation, { mode: 0o600 });
    return true;
  });
  handle("workspace:import", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "Wallace workspace", extensions: ["json"] }],
    });
    if (result.canceled) return null;
    const p = result.filePaths[0];
    if ((await fs.stat(p)).size > 25000000)
      throw new Error("Choose a file that is 25 MB or smaller.");
    return validateWorkspace(JSON.parse(await fs.readFile(p, "utf8")));
  });
  handle("migration:preview", async (source) => {
    if (source !== "notion" && source !== "slack")
      throw new Error("Choose Notion or Slack.");
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "Notion / Slack ZIP", extensions: ["zip"] }],
    });
    if (result.canceled) return null;
    const { prepareMigration } = require("./migration.cjs");
    return prepareMigration(result.filePaths[0], source);
  });
  const notionKeyFile = file("notion-connection.json");
  async function readNotionKeys() {
    try {
      return JSON.parse(await fs.readFile(notionKeyFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw new Error("Could not read the saved Notion connection.");
    }
  }
  handle("migration:notionConnected", async () =>
    Boolean((await readNotionKeys()).notion),
  );
  handle("migration:disconnectNotion", () =>
    fs.rm(notionKeyFile, { force: true }),
  );
  handle("migration:previewNotionLink", async (url, connection) => {
    if (!connection) return require("./notion-link.cjs").prepareNotionLink(url);
    const keys = await readNotionKeys();
    const entered = typedKey(connection.token);
    const token = entered || (await readKey({ encryptedKeys: keys }, "notion"));
    if (!token) throw new Error("Enter your Notion connection token.");
    const preview =
      await require("./notion-api.cjs").prepareConnectedNotionLink(url, token);
    if (entered) {
      await changeKey(keys, "notion", entered, false);
      await atomicWrite(notionKeyFile, keys);
    }
    return preview;
  });
  handle("migration:openLink", (value) => {
    if (typeof value !== "string" || value.length > 8192)
      throw new Error("Check the link.");
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("This link is not supported.");
    return shell.openExternal(url.href);
  });
  handle("updates:check", async () => {
    const platform = process.platform;
    const arch = process.arch;
    const current = app.getVersion();
    if (platform !== "darwin" && platform !== "win32") {
      await dialog.showMessageBox(win, {
        message: "Installer updates are unavailable on this operating system.",
      });
      return;
    }
    let update = await checkInstaller({
      downloads: app.getPath("downloads"),
      appPath: app.getAppPath(),
      platform,
      arch,
      current,
    });

    if (!update) {
      const result = await dialog.showMessageBox(win, {
        type: "info",
        message: `Current version ${current}`,
        detail:
          "No newer Wallace installer was found in Downloads. You can select one manually.",
        buttons: ["Close", "Select Installer…"],
        cancelId: 0,
      });
      if (result.response !== 1) return;
      const selected = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: [
          {
            name: "Wallace installer",
            extensions: platform === "darwin" ? ["pkg", "dmg"] : ["exe"],
          },
        ],
      });
      if (selected.canceled) return;
      const file = selected.filePaths[0];
      const version = installerVersion(path.basename(file), platform, arch);
      if (!version || compareVersion(version, current) <= 0)
        throw new Error(
          `Select a Wallace installer for this device newer than ${current}.`,
        );
      update = { version, path: file };
    }

    const result = await dialog.showMessageBox(win, {
      type: "info",
      message: `Wallace ${update.version} installer found`,
      detail: `Current version ${current} · ${path.basename(update.path)}
${platform !== "darwin" ? "Open the installer folder, quit Wallace, then run the installer." : update.path.endsWith(".pkg") ? "The installer will update Wallace in Applications." : "Quit Wallace, replace the app in Applications, then eject the disk image."}`,
      buttons: [
        platform === "darwin" ? "Open Installer" : "Show in Folder",
        "Not Now",
      ],
      cancelId: 1,
    });
    if (result.response !== 0) return;
    if (platform === "darwin") {
      const error = await shell.openPath(update.path);
      if (error)
        throw new Error(
          "Could not open the installer. Check the file and try again.",
        );
    } else {
      shell.showItemInFolder(update.path);
    }
  });
  handle("room:connect", (input) => room.connect(input));
  handle("room:state", () => room.state());
  handle("room:ask", (question) => room.ask(question));
  handle("room:stop", () => room.stop());
  const retrieval = require("./retrieval.cjs").retrieval({
    settingsFile: file("retrieval-settings.json"),
    indexFile: (id) => workspaceFile(id, "search-index.json"),
    storage: safeStorage,
  });
  for (const action of ["settings", "save", "test", "models"])
    handle("retrieval:" + action, (...args) => retrieval[action](...args));
  for (const action of ["status", "build", "clear", "search"])
    handle("retrieval:" + action, (id, ...args) =>
      retrieval[action](workspaceId(id), ...args),
    );
  const mcp = require("./mcp.cjs").mcpConnections(
    file("mcp-connections.json"),
    safeStorage,
  );
  for (const name of ["list", "save", "remove", "tools", "call"])
    handle("mcp:" + name, (...args) => mcp[name](...args));
  handle("settings:credential", (baseUrl, key, clear) => {
    const url = endpoint(baseUrl);
    const next = queue.then(async () => {
      const settings = await readSettings();
      await changeKey(settings.encryptedKeys, url, key, clear);
      await atomicWrite(file("settings.json"), settings);
      return publicSettings(settings);
    });
    queue = next.catch(() => {});
    return next;
  });
  handle("settings:get", async () => publicSettings(await readSettings()));
  handle("settings:set", (input) => {
    const config = settingsConfig(input);
    const next = queue.then(async () => {
      const { encryptedKeys } = await readSettings();
      await changeKey(
        encryptedKeys,
        config.baseUrl,
        input.apiKey,
        input.clearKey,
      );
      if (
        config.voiceMode === "separate" &&
        config.voiceBaseUrl !== config.baseUrl
      )
        await changeKey(
          encryptedKeys,
          config.voiceBaseUrl,
          input.voiceApiKey,
          input.clearVoiceKey,
        );
      const settings = { ...config, encryptedKeys };
      await atomicWrite(file("settings.json"), settings);
      return publicSettings(settings);
    });
    queue = next.catch(() => {});
    return next;
  });
  async function draftKey(input, baseUrl) {
    if (input.clearKey) return undefined;
    return (
      typedKey(input.apiKey) || (await readKey(await readSettings(), baseUrl))
    );
  }
  handle("ai:models", async (input) => {
    const baseUrl = endpoint(input.baseUrl);
    const result = await request(
      baseUrl,
      await draftKey(input, baseUrl),
      "models",
      { method: "GET" },
    );
    if (!Array.isArray(result.data))
      throw new Error("The server did not return a model list.");
    return [
      ...new Set(
        result.data
          .map((item) => item?.id)
          .filter(
            (id) => typeof id === "string" && id.trim() && id.length <= 200,
          ),
      ),
    ]
      .sort()
      .slice(0, 1000);
  });
  handle("ai:test", async (input) => {
    const { baseUrl, model } = connectionConfig(input);
    const result = await chatRequest(
      baseUrl,
      await draftKey(input, baseUrl),
      model,
      [
        {
          role: "user",
          content: "This is a connection test. Reply with only the word OK.",
        },
      ],
    );
    chatText(result);
  });
  handle("ai:ask", async (input) => {
    let prepared = prepareQuestion(input);
    let retrievalNotice;
    if (!input.purpose && input.workspaceId) {
      const found = await retrieval.search(
        workspaceId(input.workspaceId),
        input.workspace,
        input.question,
        input.selectedId,
      );
      const retrieved = found.results.map(({ id, title, text }) => ({
        id,
        title,
        text,
      }));
      const ids = new Set(retrieved.map((page) => page.id));
      const context = contextFor(
        validateWorkspace(input.workspace),
        input.selectedId,
        input.question,
      ).filter((page) => !ids.has(page.id));
      prepared = prepareQuestion(input, [...retrieved, ...context].slice(0, 8));
      retrievalNotice = found.warning || undefined;
    }
    const { messages, sources } = prepared;
    const settings = await readSettings();
    const model =
      input.purpose === "compact" && settings.compactModel
        ? settings.compactModel
        : settings.model;
    const result = await chatRequest(
      settings.baseUrl,
      await readKey(settings, settings.baseUrl),
      model,
      messages,
    );
    const { answer, runtime } = describeReply(result, model);
    return {
      answer: answer.slice(0, 16000),
      runtime,
      sources,
      retrievalNotice,
    };
  });
  handle("speech:status", () => speech.status());
  handle("speech:install", (model) => speech.install(model));
  async function transcribe(input, config, keyFor) {
    if (
      !input ||
      !(input.bytes instanceof Uint8Array) ||
      input.bytes.length === 0 ||
      input.bytes.length > 24000000 ||
      !["audio/webm", "audio/ogg", "audio/mp4"].includes(input.mime)
    )
      throw new Error("Use a recording that is 24 MB or smaller.");
    if (config.voiceMode === "local")
      return speech.transcribe(input.bytes, config.transcriptionModel);
    if (config.voiceMode === "off")
      throw new Error("Connect a speech-to-text server in Settings.");
    const baseUrl =
      config.voiceMode === "separate" ? config.voiceBaseUrl : config.baseUrl;
    const form = new FormData();
    form.append("model", config.transcriptionModel);
    form.append(
      "file",
      new Blob([input.bytes], { type: input.mime }),
      `recording.${input.mime === "audio/mp4" ? "mp4" : input.mime === "audio/ogg" ? "ogg" : "webm"}`,
    );
    const result = await request(
      baseUrl,
      await keyFor(baseUrl),
      "audio/transcriptions",
      {
        method: "POST",
        body: form,
      },
    );
    if (typeof result.text !== "string")
      throw new Error("The server did not return a transcription.");
    return result.text;
  }
  handle("ai:transcribe", async (input) => {
    const settings = await readSettings();
    return transcribe(input, settings, (baseUrl) => readKey(settings, baseUrl));
  });
  handle("speech:test", async (input, draft) => {
    if (!draft || typeof draft !== "object")
      throw new Error("Check your speech-to-text settings.");
    const config = speechConfig(draft);
    const baseUrl =
      config.voiceMode === "same" ? endpoint(draft.baseUrl) : undefined;
    return transcribe(input, { ...config, baseUrl }, (target) => {
      const separate =
        config.voiceMode === "separate" &&
        (!URL.canParse(draft.baseUrl) ||
          target !== new URL(draft.baseUrl).href.replace(/\/$/, ""));
      return draftKey(
        separate
          ? { apiKey: draft.voiceApiKey, clearKey: draft.clearVoiceKey }
          : draft,
        target,
      );
    });
  });
  function createWindow() {
    canClose = false;
    win = new BrowserWindow({
      width: 1480,
      height: 960,
      minWidth: 960,
      minHeight: 680,
      backgroundColor: "#f7f8fa",
      title: "Wallace",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 20, y: 20 },
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    if (dev) win.loadURL("http://127.0.0.1:5173");
    else win.loadFile(path.join(__dirname, "../dist/index.html"));
    win.on("close", (event) => {
      if (!canClose) {
        event.preventDefault();
        win.webContents.send("workspace:flush");
      }
    });
    win.on("closed", () => {
      win = null;
    });
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          {
            label: "Reload",
            click: (_item, window) => window?.webContents.reload(),
          },
          {
            label: "Force Reload",
            click: (_item, window) => window?.webContents.reloadIgnoringCache(),
          },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      { role: "windowMenu" },
    ]),
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  quitting = true;
});

app.on("will-quit", () => {
  speech.stop();
  room.closeNow();
});
