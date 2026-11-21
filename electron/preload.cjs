const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "wallace",
  Object.freeze({
    onFlush: (callback) => {
      const listener = () => {
        void callback();
      };
      ipcRenderer.on("workspace:flush", listener);
      return () => ipcRenderer.removeListener("workspace:flush", listener);
    },
    closeReady: () => ipcRenderer.invoke("window:closeReady"),
    cloudFor: (id) =>
      Object.freeze({
        link: () => ipcRenderer.invoke("cloud:link", id),
        configure: (url, key) =>
          ipcRenderer.invoke("cloud:configure", id, url, key),
        checkpoint: (revision, fingerprint) =>
          ipcRenderer.invoke("cloud:checkpoint", id, revision, fingerprint),
        fetch: (options) => ipcRenderer.invoke("cloud:fetch", id, options),
        push: (revision, workspace) =>
          ipcRenderer.invoke("cloud:push", id, revision, workspace),
        disconnect: () => ipcRenderer.invoke("cloud:disconnect", id),
      }),
    library: () => ipcRenderer.invoke("workspace:library"),
    saveLibrary: (value) => ipcRenderer.invoke("workspace:saveLibrary", value),
    load: (id) => ipcRenderer.invoke("workspace:load", id),
    save: (workspace, id) =>
      ipcRenderer.invoke("workspace:save", workspace, id),
    export: (workspace, presentation) =>
      ipcRenderer.invoke("workspace:export", workspace, presentation),
    import: () => ipcRenderer.invoke("workspace:import"),
    previewMigration: (source) =>
      ipcRenderer.invoke("migration:preview", source),
    previewNotionLink: (url, connection) =>
      ipcRenderer.invoke("migration:previewNotionLink", url, connection),
    notionConnected: () => ipcRenderer.invoke("migration:notionConnected"),
    disconnectNotion: () => ipcRenderer.invoke("migration:disconnectNotion"),
    openMigrationLink: (url) => ipcRenderer.invoke("migration:openLink", url),
    connectRoom: (input) => ipcRenderer.invoke("room:connect", input),
    roomState: () => ipcRenderer.invoke("room:state"),
    askRoom: (question) => ipcRenderer.invoke("room:ask", question),
    stopRoom: () => ipcRenderer.invoke("room:stop"),
    checkUpdate: () => ipcRenderer.invoke("updates:check"),
    saveCredential: (url, key, clear) =>
      ipcRenderer.invoke("settings:credential", url, key, clear),
    retrieval: Object.freeze({
      settings: () => ipcRenderer.invoke("retrieval:settings"),
      models: (input) => ipcRenderer.invoke("retrieval:models", input),
      save: (input) => ipcRenderer.invoke("retrieval:save", input),
      test: (input) => ipcRenderer.invoke("retrieval:test", input),
      status: (id, workspace) =>
        ipcRenderer.invoke("retrieval:status", id, workspace),
      build: (id, workspace) =>
        ipcRenderer.invoke("retrieval:build", id, workspace),
      clear: (id) => ipcRenderer.invoke("retrieval:clear", id),
      search: (id, workspace, query, mode) =>
        ipcRenderer.invoke(
          "retrieval:search",
          id,
          workspace,
          query,
          undefined,
          mode,
        ),
    }),
    mcp: Object.freeze({
      list: () => ipcRenderer.invoke("mcp:list"),
      save: (input) => ipcRenderer.invoke("mcp:save", input),
      remove: (id) => ipcRenderer.invoke("mcp:remove", id),
      tools: (id) => ipcRenderer.invoke("mcp:tools", id),
      call: (id, name, args) => ipcRenderer.invoke("mcp:call", id, name, args),
    }),
    settings: () => ipcRenderer.invoke("settings:get"),
    configure: (settings) => ipcRenderer.invoke("settings:set", settings),
    models: (input) => ipcRenderer.invoke("ai:models", input),
    testConnection: (input) => ipcRenderer.invoke("ai:test", input),
    ask: (input) => ipcRenderer.invoke("ai:ask", input),
    speechStatus: () => ipcRenderer.invoke("speech:status"),
    installSpeech: (model) => ipcRenderer.invoke("speech:install", model),
    testSpeech: (input, draft) =>
      ipcRenderer.invoke("speech:test", input, draft),
    transcribe: (input) => ipcRenderer.invoke("ai:transcribe", input),
  }),
);
