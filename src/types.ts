export type Kind = "note" | "project" | "meeting" | "resource";
export type Attachment = { name: string; data: string };
export type Page = {
  attachment?: Attachment;
  id: string;
  title: string;
  html: string;
  kind: Kind;
  x: number;
  y: number;
  updatedAt: string;
};
export type Relationship = "relates" | "addresses" | "supports";
export type Edge = {
  id: string;
  source: string;
  target: string;
  relationship?: Relationship;
};
export type PurposeKind = "question" | "decision" | "problem";
export type ConversationPurpose = {
  kind: PurposeKind;
  statement: string;
  completedAt?: string;
};
export type ProjectStep = { id: string; title: string; done: boolean };
export type WorkspaceProfile = {
  name: string;
  icon: "initial" | "star" | "sparkles" | "book";
  photo?: string;
};
export type TurnIntent = {
  kind: "clarify" | "constraint" | "direction" | "evidence" | "decision";
  previous?: number;
};

export type AiTurn = {
  runtime?: AiRuntime;
  intent?: TurnIntent;
  author?: string;
  question: string;
  answer: string;
  time: string;
  sources?: Answer["sources"];
};
export type SessionDraft = { text: string; turnCount: number };
export type Conversation = {
  archived?: boolean;
  endedAt?: string;
  compactPageId?: string;
  id: string;
  title: string;
  html: string;
  nodeIds: string[];
  favorite: boolean;
  favoriteNodeIds: string[];
  aiTurns?: AiTurn[];
  sessionDraft?: SessionDraft;
  purpose?: ConversationPurpose;
  summary?: {
    text: string;
    turnCount: number;
    reviewedAt: string;
    purpose?: string;
  };
  project?: { pageId: string; steps: ProjectStep[] };
  positions?: Record<string, { x: number; y: number }>;
  involved: boolean;
  updatedAt: string;
};
export type Workspace = {
  version: 1;
  pages: Page[];
  edges: Edge[];
  conversations: Conversation[];
  profile?: WorkspaceProfile;
};
export type MigrationSource = "notion" | "slack";
export type MigrationPreview = {
  filename: string;
  workspace: Workspace;
  attachments: number;
  messages: number;
  warnings?: string[];
  groups: { id: string; title: string; pages: number; sensitive: boolean }[];
};
export type CloudLink = { url: string; revision: number; fingerprint?: string };
export type CloudResult =
  | { status: 200; revision: number; savedAt: string; workspace: Workspace }
  | { status: 304 | 404 }
  | { status: 409; conflicts: string[] };
export type CloudBridge = {
  link(): Promise<CloudLink | null>;
  configure(url: string, key: string): Promise<void>;
  checkpoint(revision: number, fingerprint: string): Promise<void>;
  fetch(options?: { since: number }): Promise<CloudResult>;
  push(revision: number, workspace: Workspace): Promise<CloudResult>;
  disconnect(): Promise<void>;
};
export type Settings = {
  compactModel?: string;
  localRuntime?: string;
  baseUrl: string;
  model: string;
  transcriptionModel: string;
  hasKey: boolean;
  credentialEndpoints: string[];
  voiceMode: "local" | "same" | "separate" | "off";
  voiceBaseUrl: string;
};
export type ConnectionDraft = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearKey?: boolean;
};
export type SettingsDraft = Settings &
  ConnectionDraft & { voiceApiKey?: string; clearVoiceKey?: boolean };
export type SpeechModel = "whisper-tiny" | "whisper-base" | "whisper-small";
export type SpeechStatus = {
  ready: boolean;
  installed: SpeechModel[];
  stage: "runtime" | "model" | null;
  installing: SpeechModel | null;
};
export type SpeechAudio = { bytes: Uint8Array; mime: string };
export type AiRuntime = { model: string; harnessVersion: string };
export type Answer = {
  retrievalNotice?: string;
  answer: string;
  sources: { id: string; title: string }[];
  runtime?: AiRuntime;
};
export type RoomConnection =
  | {
      role: "host";
      name: string;
      title: string;
      purpose?: string;
      purposeKind?: PurposeKind;
    }
  | { role: "member"; name: string; invite: string };
export type SharedRoomState = {
  id?: string;
  role: "host" | "member";
  title: string;
  members: number;
  invitations?: string[];
  purpose?: string;
  purposeKind?: PurposeKind;
  turns: {
    id: string;
    author: string;
    question: string;
    time: string;
    status: "pending" | "done" | "error";
    answer?: string;
    runtime?: AiRuntime;
  }[];
};

export type WorkspaceLibrary = {
  active: string;
  items: { id: string; name: string }[];
};

export type McpConnection = {
  id: string;
  name: string;
  url: string;
  hasToken: boolean;
};
export type McpTool = {
  name: string;
  description?: string;
  inputSchema: {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
};
export type RetrievalSettings = {
  mode: "keyword" | "hybrid";
  baseUrl: string;
  model: string;
  hasKey: boolean;
};
export type RetrievalDraft = RetrievalSettings & {
  apiKey?: string;
  clearKey?: boolean;
};
export type IndexStatus = {
  passages: number;
  indexed: number;
  vectors: number;
  stale: number;
  updatedAt: string | null;
  progress: { completed: number; total: number } | null;
};
export type SearchResults = {
  mode: string;
  warning: string;
  results: { id: string; title: string; text: string; score: number }[];
};
export interface Bridge {
  retrieval?: {
    settings(): Promise<RetrievalSettings>;
    models(input: RetrievalDraft): Promise<string[]>;
    save(input: RetrievalDraft): Promise<RetrievalSettings>;
    test(input: RetrievalDraft): Promise<{ dimensions: number }>;
    status(id: string, workspace: Workspace): Promise<IndexStatus>;
    build(id: string, workspace: Workspace): Promise<IndexStatus>;
    clear(id: string): Promise<void>;
    search(
      id: string,
      workspace: Workspace,
      query: string,
      mode: "keyword" | "hybrid",
    ): Promise<SearchResults>;
  };
  saveCredential?(
    url: string,
    key?: string,
    clear?: boolean,
  ): Promise<Settings>;
  mcp?: {
    list(): Promise<McpConnection[]>;
    save(input: {
      id?: string;
      name: string;
      url: string;
      token?: string;
      clearToken?: boolean;
    }): Promise<McpConnection>;
    remove(id: string): Promise<void>;
    tools(id: string): Promise<McpTool[]>;
    call(
      id: string,
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ text: string; isError: boolean }>;
  };
  cloudFor?(id: string): CloudBridge;
  library(): Promise<WorkspaceLibrary>;
  saveLibrary(value: WorkspaceLibrary): Promise<void>;
  onFlush?(callback: () => Promise<void>): () => void;
  closeReady?(): Promise<void>;
  load(id?: string): Promise<Workspace | null>;
  save(value: Workspace, id?: string): Promise<void>;
  export(value: Workspace, presentation?: string): Promise<boolean>;
  import(): Promise<Workspace | null>;
  previewMigration?(source: MigrationSource): Promise<MigrationPreview | null>;
  previewNotionLink?(
    url: string,
    connection?: { token: string },
  ): Promise<MigrationPreview>;
  notionConnected?(): Promise<boolean>;
  disconnectNotion?(): Promise<void>;
  openMigrationLink?(url: string): Promise<void>;
  connectRoom(input: RoomConnection): Promise<SharedRoomState>;
  roomState(): Promise<SharedRoomState | null>;
  askRoom(question: string): Promise<void>;
  stopRoom(): Promise<void>;
  checkUpdate(): Promise<void>;
  settings(): Promise<Settings>;
  configure(value: SettingsDraft): Promise<Settings>;
  models(input: ConnectionDraft): Promise<string[]>;
  testConnection(input: ConnectionDraft): Promise<void>;
  ask(input: {
    workspaceId?: string;
    question: string;
    workspace: Workspace;
    selectedId?: string;
    purpose?: "session-note" | "compact";
  }): Promise<Answer>;
  speechStatus(): Promise<SpeechStatus>;
  installSpeech(model: SpeechModel): Promise<void>;
  testSpeech(input: SpeechAudio, draft: SettingsDraft): Promise<string>;
  transcribe(input: SpeechAudio): Promise<string>;
}
declare global {
  interface Window {
    wallace?: Bridge;
  }
}
