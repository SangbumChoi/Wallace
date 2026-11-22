import { useState, useEffect, useRef, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  ConnectionMode,
  applyNodeChanges,
  addEdge,
  type Node,
  type NodeProps,
  type NodeChange,
  type Connection,
} from "@xyflow/react";
import {
  Archive,
  Check,
  Paperclip,
  Network,
  Plus,
  Search,
  Settings2,
  ArrowUpRight,
  ArrowUp,
  FileText,
  Mic,
  Square,
  Sparkles,
  X,
  ChevronDown,
  PanelLeft,
  Code2,
  Eye,
  Cloud,
  Download,
  RefreshCw,
  Upload,
  Link2,
  Trash2,
  FolderOpen,
  BookOpen,
  AlignLeft,
  Star,
  MessageSquare,
  Users,
  House,
  Pencil,
  Keyboard,
} from "lucide-react";
import DOMPurify from "dompurify";
import wallaceIcon from "../build/favicon.png";
import ConversationGraphOutline from "./ConversationGraphOutline";
import { relatedKnowledge } from "./knowledgeLinks";
import {
  acceptedFiles,
  uploadedFile,
  generatedFiles,
  generatedAttachment,
  downloadAttachment,
  maxWorkspaceFileCharacters,
} from "./conversationFiles";
import {
  defaultWorkspaceId,
  workspaceLibrary,
} from "../shared/workspace-library.mjs";
import { bridge, isMobileApp } from "./bridge";
import ProfilePhoto from "./ProfilePhoto";
import SearchSettings from "./SearchSettings";
import CompactArchive, { CompactModelSettings } from "./CompactArchive";
import McpSettings from "./McpSettings";
import AiSettings from "./AiSettings";
import CloudSettings from "./CloudSettings";
import WorkspaceMigration from "./WorkspaceMigration";
import ShortcutSettings from "./ShortcutSettings";
import {
  readShortcuts,
  shortcutAria,
  shortcutFromEvent,
  shortcutStorageKey,
  shortcutText,
} from "./shortcuts";
import { appendMigration } from "../shared/migration.mjs";
import {
  exclusiveConversationPages,
  removeConversation,
} from "../shared/workspace.mjs";
import WorkspaceGraph from "./WorkspaceGraph";
import useWorkspaceCloud from "./useWorkspaceCloud";
import useDictation, {
  appendDictation,
  focusDictationInput,
} from "./useDictation";
import RenameableSidebarRow from "./RenameableSidebarRow";
import AiConversation from "./AiConversation";
import ConversationPurpose from "./ConversationPurpose";
import SharedRoom from "./SharedRoom";
import {
  defaultProfile,
  purposeReference,
  relationshipLabels,
  withConversations,
} from "./workspace";
import { escapeHtml, workspacePresentation } from "./workspacePresentation";
import type {
  Workspace,
  Page,
  Kind,
  Settings,
  Conversation,
  Relationship,
  SharedRoomState,
  MigrationPreview,
  WorkspaceProfile,
  WorkspaceLibrary,
} from "./types";
const kinds: Record<
  Kind,
  { label: string; color: string; icon: typeof FileText }
> = {
  project: { label: "Project", color: "#6b63c7", icon: FolderOpen },
  note: { label: "Note", color: "#398e7e", icon: FileText },
  meeting: { label: "Meeting notes", color: "#b57f3f", icon: Mic },
  resource: { label: "Resource", color: "#5082b6", icon: BookOpen },
};
function clean(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "style",
      "form",
      "input",
      "button",
      "iframe",
      "video",
      "audio",
      "img",
    ],
    FORBID_ATTR: ["style"],
  });
}
function textOf(html: string) {
  return (
    new DOMParser().parseFromString(clean(html), "text/html").body
      .textContent || ""
  );
}
type GraphNode = Node<{ page: Page; active: boolean; dim: boolean }>;
function PageNode({ data }: NodeProps<GraphNode>) {
  const k = kinds[data.page.kind];
  const Icon = k.icon;
  return (
    <div
      className={`page-node ${data.active ? "active" : ""} ${data.dim ? "dim" : ""}`}
      style={{ "--node-color": k.color } as React.CSSProperties}
    >
      <Handle type="source" position={Position.Left} id="left" />
      <div className="node-top">
        <span className="node-icon">
          <Icon size={16} />
        </span>
        <span>{k.label}</span>
        {data.active && <span className="selected-dot" />}
      </div>
      <strong>{data.page.title || "Untitled page"}</strong>
      <p>{textOf(data.page.html).slice(0, 44) || "Capture a new thought."}</p>
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  );
}
const nodeTypes = { page: PageNode };
const sidebarMin = 160;
const sidebarMax = 400;
const sidebarDefault = 184;
const sidebarWidthKey = "wallace.sidebarWidth";
const newConversationTitle = "New conversation";
const previousNewConversationTitle = "\uc0c8\ub85c\uc6b4 \ub300\ud654";
const emptyConversation: Conversation = {
  id: "",
  title: "",
  html: "",
  nodeIds: [],
  favorite: false,
  favoriteNodeIds: [],
  involved: false,
  updatedAt: "",
};

function clampSidebarWidth(width: number) {
  return Math.max(sidebarMin, Math.min(sidebarMax, width));
}

function readSidebarWidth() {
  const saved = localStorage.getItem(sidebarWidthKey);
  const width = saved === null ? sidebarDefault : Number(saved);
  return Number.isFinite(width) ? clampSidebarWidth(width) : sidebarDefault;
}
const profileIcons = { star: Star, sparkles: Sparkles, book: BookOpen };
const profileIconLabels = {
  initial: "Initials",
  star: "Star",
  sparkles: "Sparkles",
  book: "Book",
};

function ProfileIcon({ profile }: { profile: WorkspaceProfile }) {
  if (profile.photo)
    return <img className="profile-avatar-image" src={profile.photo} alt="" />;
  if (profile.icon === "initial") return Array.from(profile.name)[0];
  const Icon = profileIcons[profile.icon];
  return <Icon size={14} aria-hidden="true" />;
}

export default function App() {
  const [library, setLibrary] = useState<WorkspaceLibrary>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    bridge
      .library()
      .then((value) => {
        if (active) setLibrary(value);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!library)
    return (
      <div className="loading" role="status">
        {error || "Loading workspace…"}
      </div>
    );
  return (
    <WorkspaceApp
      key={library.active}
      library={library}
      onLibrary={setLibrary}
    />
  );
}

function WorkspaceApp({
  library,
  onLibrary,
}: {
  library: WorkspaceLibrary;
  onLibrary: (value: WorkspaceLibrary) => void;
}) {
  const workspaceId = library.active;
  const workspaceName = library.items.find(
    (item) => item.id === workspaceId,
  )!.name;
  const [workspaceAction, setWorkspaceAction] = useState<
    "create" | "rename" | "switch" | null
  >(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const workspacePending = useRef(false);
  const [ws, setWs] = useState<Workspace>({
    version: 1,
    pages: [],
    edges: [],
    conversations: [],
  });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [activeConversation, setActiveConversation] = useState("");
  const [documentTarget, setDocumentTarget] = useState<"spec" | "node">("spec");
  const [workspaceGraph, setWorkspaceGraph] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(readShortcuts);
  const [graphVisible, setGraphVisible] = useState(false);
  const [screen, setScreen] = useState<"home" | "conversation" | "room">(
    "home",
  );
  const [homeQuestion, setHomeQuestion] = useState("");
  const [homeDraft, setHomeDraft] = useState("");
  const [recordMode, setRecordMode] = useState(false);
  const showHome = screen === "home";
  const showSharedRoom = screen === "room";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const sidebarDrag = useRef<{
    startX: number;
    startWidth: number;
    width: number;
  } | null>(null);
  const [resizingSidebar, setResizingSidebar] = useState(false);

  function saveSidebarWidth(width: number) {
    setSidebarWidth(width);
    localStorage.setItem(sidebarWidthKey, String(width));
  }

  function finishSidebarResize() {
    if (!sidebarDrag.current) return;
    saveSidebarWidth(sidebarDrag.current.width);
    sidebarDrag.current = null;
    setResizingSidebar(false);
  }
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const workspaceMenu = useRef<HTMLDetailsElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"read" | "edit" | "html">("read");
  const [saved, setSaved] = useState("Loading");
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState<false | "ai" | "voice">(
    false,
  );
  const [connectionTab, setConnectionTab] = useState<
    "model" | "mcp" | "search" | "speech" | "compact"
  >("model");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileIcon, setProfileIcon] =
    useState<WorkspaceProfile["icon"]>("initial");
  const [profilePhoto, setProfilePhoto] = useState<string>();
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);
  const [microphoneId, setMicrophoneId] = useState(
    () => localStorage.getItem("wallace.microphone") ?? "",
  );
  const [settings, setSettings] = useState<Settings | null>(null);
  const [panel, setPanel] = useState<"page" | "ai">("ai");
  const [questions, setQuestions] = useState<Record<string, string>>({});
  const composer = useRef<HTMLTextAreaElement>(null);
  const newPageButton = useRef<HTMLButtonElement>(null);
  const [aiRequests, setAiRequests] = useState<
    Record<string, { question?: string }>
  >({});
  const inFlight = useRef(new Map<string, object>());
  const requestGeneration = useRef(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [conversationAction, setConversationAction] = useState<{
    id: string;
    type: "rename" | "delete" | "archive" | "knowledge";
  } | null>(null);
  const flow = useRef<{
    fitView: (options?: {
      padding?: number;
      maxZoom?: number;
    }) => Promise<boolean>;
  } | null>(null);
  useEffect(() => {
    const resize = () => {
      void flow.current?.fitView({ padding: 0.18, maxZoom: 1 });
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const wsRef = useRef(ws);
  const getCurrentWorkspace = useCallback(() => wsRef.current, []);
  const applyCloudWorkspace = useCallback((value: Workspace) => {
    wsRef.current = value;
    setTab("read");
    setWs(value);
    setActiveConversation((id) =>
      value.conversations.some((item) => item.id === id)
        ? id
        : (value.conversations[0]?.id ?? ""),
    );
    if (!value.conversations.length)
      setScreen((current) => (current === "conversation" ? "home" : current));
  }, []);
  const cloud = useWorkspaceCloud({
    ready,
    workspace: ws,
    workspaceId,
    getCurrent: getCurrentWorkspace,
    apply: applyCloudWorkspace,
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const conversation =
    ws.conversations.find((c) => c.id === activeConversation) ||
    ws.conversations[0] ||
    emptyConversation;
  const actionConversation = ws.conversations.find(
    ({ id }) => id === conversationAction?.id,
  );
  const draft = showHome ? homeDraft : (drafts[conversation.id] ?? "");
  const question = questions[conversation.id] ?? "";
  const inputText = recordMode ? draft : showHome ? homeQuestion : question;
  const dictation = useDictation({
    settings,
    microphoneId,
    onSettings: () => setSettingsOpen("voice"),
    onNotice: setNotice,
    scope:
      screen !== "conversation" || workspaceGraph
        ? workspaceGraph
          ? "graph"
          : screen
        : conversation.id + ":" + requestGeneration.current,
  });
  const isRecording = dictation.phase === "recording";
  const turns = conversation.aiTurns ?? [];
  const request = aiRequests[conversation.id];
  const pendingAnswer = !showHome && !!request?.question;
  const canSubmit =
    Boolean(inputText.trim()) &&
    (showHome || (!conversation.endedAt && (recordMode || !request)));
  const profile = ws.profile ?? defaultProfile;
  const savedContext = textOf(conversation.html).trim();
  const hasContext = Boolean(savedContext || conversation.nodeIds.length);
  const graphPages = ws.pages
    .filter((p) => conversation.nodeIds.includes(p.id))
    .map((page) => ({ ...page, ...conversation.positions?.[page.id] }));
  const graphEdges = ws.edges.filter(
    (e) =>
      conversation.nodeIds.includes(e.source) &&
      conversation.nodeIds.includes(e.target),
  );
  const attachedFiles = graphPages.filter((page) => page.attachment);
  const [attachingFiles, setAttachingFiles] = useState(false);
  const [endingConversation, setEndingConversation] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const graphPagesById = new Map(graphPages.map((p) => [p.id, p]));
  const replies = new Map(graphEdges.map((edge) => [edge.target, edge.source]));
  const nodePage = graphPagesById.get(selected);
  const page: Page | undefined =
    documentTarget === "spec"
      ? {
          id: `spec:${conversation.id}`,
          title: conversation.title,
          html: conversation.html,
          kind: "project",
          x: 0,
          y: 0,
          updatedAt: conversation.updatedAt,
        }
      : nodePage;
  const conversationResults = ws.conversations.filter(
    (c) =>
      !c.archived &&
      (c.involved || query.trim() !== "") &&
      `${c.title} ${c.purpose?.statement ?? ""} ${textOf(c.html)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const noteQuery = query.trim().toLowerCase();
  const matchingNotes = noteQuery
    ? ws.pages
        .map((page) => ({
          page,
          titleMatch: page.title.toLowerCase().includes(noteQuery),
        }))
        .filter(
          ({ page, titleMatch }) =>
            titleMatch ||
            page.html
              .slice(0, 25000)
              .replace(/<[^>]*>/g, " ")
              .toLowerCase()
              .includes(noteQuery),
        )
        .sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch))
        .slice(0, 8)
    : [];
  const favoriteNodes = ws.conversations
    .filter((c) => !c.archived)
    .flatMap((c) =>
      c.favoriteNodeIds.map((id) => ({
        conversation: c,
        page: ws.pages.find((p) => p.id === id)!,
      })),
    )
    .filter((item) =>
      item.page.title.toLowerCase().includes(query.toLowerCase()),
    );
  const favorites = ws.conversations.filter(
    (c) =>
      !c.archived &&
      c.favorite &&
      c.title.toLowerCase().includes(query.toLowerCase()),
  );
  const knowledgeSavedNotice =
    screen === "conversation" &&
    !workspaceGraph &&
    (notice === "Knowledge note saved." ||
      notice.startsWith("Knowledge saved. Conversation archived."));
  const compactNoteId = conversation.compactPageId;
  const compactLinkedIds = new Set(
    compactNoteId
      ? ws.edges.flatMap((edge) =>
          edge.source === compactNoteId
            ? [edge.target]
            : edge.target === compactNoteId
              ? [edge.source]
              : [],
        )
      : [],
  );
  const compactLinkedPages = ws.pages.filter((page) =>
    compactLinkedIds.has(page.id),
  );
  const connected = ws.edges.filter(
    (e) => e.source === selected || e.target === selected,
  );
  const connectedIds = new Set(
    connected.map((edge) =>
      edge.source === selected ? edge.target : edge.source,
    ),
  );
  const linkablePages = ws.pages.filter(
    (item) => item.id !== selected && !connectedIds.has(item.id),
  );
  useEffect(() => {
    alive.current = true;
    Promise.all([bridge.load(workspaceId), bridge.settings()])
      .then(([value, s]) => {
        if (!alive.current) return;
        if (value || workspaceId !== defaultWorkspaceId) {
          const normalized = withConversations(
            value ?? { version: 1, pages: [], edges: [], conversations: [] },
          );
          setWs(normalized);
          wsRef.current = normalized;
          setActiveConversation(normalized.conversations[0]?.id ?? "");
          setSelected(normalized.conversations[0]?.nodeIds[0] ?? "");
        }
        setSettings(s);
        setReady(true);
        setSaved("Saved");
      })
      .catch((e) => {
        if (alive.current) {
          setLoadError(true);
          setNotice(e instanceof Error ? e.message : String(e?.message ?? e));
        }
      });
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    wsRef.current = ws;
    if (!ready) return;
    setSaved("Saving…");
    saveTimer.current = setTimeout(() => {
      bridge
        .save(ws, workspaceId)
        .then(() => {
          if (wsRef.current === ws) setSaved("Saved");
        })
        .catch((e) => {
          setSaved("Save failed");
          setNotice(e.message);
        });
    }, 450);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ws, ready]);
  useEffect(
    () =>
      bridge.onFlush?.(async () => {
        try {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          if (ready) await bridge.save(wsRef.current, workspaceId);
          await bridge.closeReady?.();
        } catch (e) {
          setSaved("Save failed");
          setNotice(
            `The window stayed open because saving failed. ${(e as Error).message}`,
          );
        }
      }),
    [ready],
  );
  useEffect(() => {
    const flush = () => {
      if (ready && saveTimer.current) {
        clearTimeout(saveTimer.current);
        void bridge.save(wsRef.current, workspaceId).catch(() => {});
      }
    };
    const flushOnBackground = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flushOnBackground);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flushOnBackground);
    };
  }, [ready]);
  useEffect(() => {
    if (tab === "edit" && editor.current)
      editor.current.innerHTML = clean(page?.html || "");
  }, [tab, selected, documentTarget, activeConversation, panel]);
  useEffect(() => {
    if (
      !settingsOpen &&
      !deleteOpen &&
      !actionConversation &&
      !profileOpen &&
      !cloudOpen &&
      !migrationOpen &&
      !shortcutsOpen &&
      !workspaceAction
    )
      return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
        ),
      ).filter(
        (element) =>
          element.getClientRects().length > 0 && !element.matches(":disabled"),
      );
    const items = focusable();
    (dialog.querySelector<HTMLElement>("input") || items[0])?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusable();
      const first = list[0],
        last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [
    settingsOpen,
    deleteOpen,
    actionConversation?.id,
    conversationAction?.type,
    profileOpen,
    cloudOpen,
    migrationOpen,
    shortcutsOpen,
    workspaceAction,
  ]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  const updateConversation = (
    changes: Partial<Conversation>,
    id = conversation.id,
  ) =>
    setWs((w) => ({
      ...w,
      conversations: w.conversations.map((c) =>
        c.id === id
          ? { ...c, ...changes, updatedAt: new Date().toISOString() }
          : c,
      ),
    }));
  const openConversation = (c: Conversation) => {
    setWorkspaceGraph(false);
    setScreen("conversation");
    setSidebarOpen(false);
    setGraphVisible(false);
    setActiveConversation(c.id);
    setSelected(c.nodeIds[0] || "");
    setDocumentTarget("spec");
    setPanel("ai");
    setRecordMode(false);
    setTab("read");
  };
  function openHome() {
    setSidebarOpen(false);
    setWorkspaceGraph(false);
    setScreen("home");
    setRecordMode(false);
  }
  function deleteConversation(id: string) {
    setWs((current) => removeConversation(current, id));
    inFlight.current.delete(id);
    setAiRequests(({ [id]: _request, ...remaining }) => remaining);
    setDrafts(({ [id]: _draft, ...remaining }) => remaining);
    setQuestions(({ [id]: _question, ...remaining }) => remaining);
    setConversationAction(null);
    openHome();
    setNotice("Conversation deleted.");
    requestAnimationFrame(() => composer.current?.focus());
  }
  useEffect(() => {
    const t = setTimeout(() => {
      void flow.current?.fitView({ padding: 0.2, maxZoom: 1 });
    }, 60);
    return () => clearTimeout(t);
  }, [activeConversation, ready, graphVisible, graphPages.length]);
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = 0;
  }, [activeConversation]);
  useEffect(() => {
    if (screen !== "conversation" || panel !== "ai" || workspaceGraph) return;
    if (request?.question) {
      thread.current
        ?.querySelector(".ai-pending-answer")
        ?.scrollIntoView({ block: "nearest" });
    } else if (request || conversation.sessionDraft) {
      document
        .getElementById("ai-conversation-end")
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [
    panel,
    screen,
    workspaceGraph,
    request,
    turns.length,
    conversation.id,
    !!conversation.sessionDraft,
  ]);
  function openGraphPage(id: string) {
    const owner =
      ws.conversations.find(
        (item) => item.id === conversation.id && item.nodeIds.includes(id),
      ) ?? ws.conversations.find((item) => item.nodeIds.includes(id));
    const target =
      owner ?? (conversation.id ? conversation : newConversation());
    if (!owner) {
      setWs((current) => ({
        ...current,
        conversations: current.conversations.map((item) =>
          item.id === target.id
            ? { ...item, nodeIds: [...item.nodeIds, id] }
            : item,
        ),
      }));
    }
    openConversation(target);
    setSelected(id);
    setDocumentTarget("node");
    setPanel("page");
    requestAnimationFrame(() =>
      document
        .getElementById("thread-detail")
        ?.scrollIntoView({ block: "start" }),
    );
  }
  const newConversation = (firstQuestion?: string) => {
    const c: Conversation = {
      id: crypto.randomUUID(),
      title: firstQuestion
        ? Array.from(firstQuestion.split("\n")[0]).slice(0, 60).join("")
        : newConversationTitle,
      html: "",
      nodeIds: [],
      favorite: false,
      favoriteNodeIds: [],
      involved: true,
      updatedAt: new Date().toISOString(),
      ...(firstQuestion && {
        purpose: { kind: "question", statement: firstQuestion },
      }),
    };
    setWs((w) => ({ ...w, conversations: [...w.conversations, c] }));
    openConversation(c);
    return c;
  };
  const patch = (id: string, changes: Partial<Page>) => {
    if (id === `spec:${conversation.id}`) {
      updateConversation({
        ...("title" in changes ? { title: changes.title } : {}),
        ...("html" in changes ? { html: changes.html } : {}),
      });
      return;
    }
    setWs((w) => ({
      ...w,
      pages: w.pages.map((p) =>
        p.id === id
          ? { ...p, ...changes, updatedAt: new Date().toISOString() }
          : p,
      ),
    }));
  };
  const newPage = useCallback(
    (
      kind: Kind = "note",
      html = "<p>Capture a new thought here.</p>",
      title = "Untitled page",
      mode: "edit" | "read" = "edit",
      conversationId = activeConversation,
    ) => {
      const id = crypto.randomUUID();
      setWs((w) => {
        const parent = w.pages.find(
          (p) =>
            p.id === selected &&
            w.conversations
              .find((c) => c.id === conversationId)
              ?.nodeIds.includes(p.id),
        );
        const origin =
          w.conversations.find((c) => c.id === conversationId)?.positions?.[
            selected
          ] ?? parent;
        return {
          ...w,
          conversations: w.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  nodeIds: [...c.nodeIds, id],
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
          pages: [
            ...w.pages,
            {
              id,
              title,
              html,
              kind,
              x: (origin?.x ?? 300) + 80 + (w.pages.length % 3) * 50,
              y: (origin?.y ?? 180) + 180,
              updatedAt: new Date().toISOString(),
            },
          ],
          edges: parent
            ? [
                ...w.edges,
                { id: crypto.randomUUID(), source: parent.id, target: id },
              ]
            : w.edges,
        };
      });
      setActiveConversation(conversationId);
      setSelected(id);
      setDocumentTarget("node");
      setPanel("page");
      setTab(mode);
      return id;
    },
    [selected, activeConversation],
  );
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        !e.defaultPrevented &&
        shortcutFromEvent(e) === shortcuts.model &&
        !document.querySelector("[role=dialog]")
      ) {
        e.preventDefault();
        setConnectionTab("model");
        setSettingsOpen("ai");
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLInputElement>(".model-command input")
            ?.focus(),
        );
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        if (!document.querySelector("[role=dialog]"))
          newPageButton.current?.click();
      }
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setShortcutsOpen(false);
        setDeleteOpen(false);
        setConversationAction(null);
        if (!profilePhotoBusy) setProfileOpen(false);
        setCloudOpen(false);
        setMigrationOpen(false);
        if (!workspacePending.current) setWorkspaceAction(null);
        setSidebarOpen(false);
        if (workspaceMenu.current) workspaceMenu.current.open = false;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [newPage, profilePhotoBusy, shortcuts.model]);
  useEffect(() => {
    if (
      isMobileApp ||
      !ready ||
      loadError ||
      screen !== "conversation" ||
      workspaceGraph ||
      !activeConversation ||
      conversation.id !== activeConversation
    )
      return;

    function handleShortcut(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        document.querySelector("[aria-modal=true]") ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            event.target.closest("input, textarea, select, [role=textbox]")))
      )
        return;
      const shortcut = shortcutFromEvent(event);
      const type =
        shortcut === shortcuts.rename
          ? "rename"
          : shortcut === shortcuts.delete
            ? "delete"
            : undefined;
      if (!type) return;
      event.preventDefault();
      setConversationAction({ id: activeConversation, type });
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    activeConversation,
    conversation.id,
    loadError,
    ready,
    screen,
    shortcuts,
    workspaceGraph,
  ]);
  const nodes: GraphNode[] = graphPages.map((p) => ({
    id: p.id,
    type: "page",
    deletable: false,
    position: { x: p.x, y: p.y },
    data: {
      page: p,
      active: p.id === selected,
      dim: false,
    },
  }));
  const nodeChanges = (changes: NodeChange<GraphNode>[]) => {
    const moved = new Set(
      changes.flatMap((change) =>
        change.type === "position" && change.position ? [change.id] : [],
      ),
    );
    if (!moved.size) return;
    const updated = applyNodeChanges(changes, nodes);
    const positions = Object.fromEntries(
      updated
        .filter((node) => moved.has(node.id))
        .map((node) => [node.id, node.position]),
    );
    setWs((current) => ({
      ...current,
      conversations: current.conversations.map((item) =>
        item.id === conversation.id
          ? { ...item, positions: { ...item.positions, ...positions } }
          : item,
      ),
    }));
  };
  const connect = (c: Connection) => {
    if (c.source === c.target) return;
    setWs((w) => ({
      ...w,
      edges: addEdge({ ...c, id: crypto.randomUUID() }, w.edges).map(
        ({ id, source, target, relationship }) => ({
          id,
          source,
          target,
          relationship,
        }),
      ),
    }));
  };
  const choose = (id: string) => {
    if (id === `spec:${conversation.id}`) {
      setDocumentTarget("spec");
      setPanel("page");
      setTab("read");
      return;
    }
    setDocumentTarget("node");
    setSelected(id);
    setTab("read");
    setPanel("page");
  };
  function submitEntry() {
    const body = draft.trim();
    if (!body) return;
    const title = Array.from(body.split("\n")[0]).slice(0, 60).join("");
    const target = showHome ? newConversation() : conversation;
    if (showHome) {
      updateConversation({ title }, target.id);
      setHomeDraft("");
    } else {
      setDrafts((previous) => ({ ...previous, [target.id]: "" }));
    }
    const id = newPage(
      "note",
      `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
      title,
      "read",
      target.id,
    );
    setRecordMode(false);
    requestAnimationFrame(() =>
      document
        .getElementById(`entry-${id}`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }
  function resourcePage(
    item: Awaited<ReturnType<typeof uploadedFile>>,
    position: number,
  ): Page {
    return {
      id: crypto.randomUUID(),
      kind: "resource",
      title: item.file.name,
      html: "<pre>" + escapeHtml(item.text.slice(0, 6000)) + "</pre>",
      attachment: item.file,
      x: 260 + (position % 4) * 220,
      y: 260 + Math.floor(position / 4) * 175,
      updatedAt: new Date().toISOString(),
    };
  }

  async function attachFiles(files: File[]) {
    if (!files.length || attachingFiles || files.length > 8) {
      if (files.length > 8) setNotice("Attach up to eight files at a time.");
      return;
    }
    setAttachingFiles(true);
    const generation = requestGeneration.current;
    try {
      const incoming = await Promise.all(files.map(uploadedFile));
      if (generation !== requestGeneration.current) return;
      const current = wsRef.current;
      if (
        !showHome &&
        !current.conversations.some((item) => item.id === conversation.id)
      )
        return;
      if (
        current.pages.length + incoming.length > 5000 ||
        current.pages.reduce(
          (size, page) => size + (page.attachment?.data.length ?? 0),
          0,
        ) +
          incoming.reduce((size, item) => size + item.file.data.length, 0) >
          maxWorkspaceFileCharacters
      )
        throw new Error("The workspace file limit has been reached.");
      const target = showHome ? newConversation() : conversation;
      const pages = incoming.map((item, index) =>
        resourcePage(item, current.pages.length + index),
      );
      setWs((workspace) => ({
        ...workspace,
        pages: [...workspace.pages, ...pages],
        conversations: workspace.conversations.map((item) =>
          item.id === target.id
            ? {
                ...item,
                nodeIds: [...item.nodeIds, ...pages.map(({ id }) => id)],
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      }));
      if (showHome && homeQuestion) {
        setQuestions((previous) => ({
          ...previous,
          [target.id]: homeQuestion,
        }));
        setHomeQuestion("");
      }
      setRecordMode(false);
      setPanel("ai");
      setNotice(
        files.length === 1
          ? "File added to this conversation."
          : `${files.length} files added to this conversation.`,
      );
    } catch (error) {
      if (generation === requestGeneration.current)
        setNotice((error as Error).message);
    } finally {
      setAttachingFiles(false);
    }
  }

  async function saveConversationKnowledge() {
    const target = conversation;
    if (
      !target.id ||
      target.endedAt ||
      endingConversation ||
      inFlight.current.has(target.id)
    )
      return;
    if (question.trim() || draft.trim()) {
      setNotice(
        "Send or clear the draft before saving this conversation as knowledge.",
      );
      return;
    }
    const recentTurns = target.aiTurns ?? [];
    const snapshot = wsRef.current;
    const sourcePages = snapshot.pages.filter(
      (page) =>
        target.nodeIds.includes(page.id) && page.id !== target.compactPageId,
    );
    const generation = requestGeneration.current;
    setEndingConversation(target.id);
    try {
      const drafts = recentTurns.flatMap((turn, index) =>
        generatedFiles(turn.answer, index),
      );
      const unique = new Map(
        drafts.map((file) => [file.name + "\0" + file.text, file]),
      );
      const selectedFiles = [...unique.values()].slice(-20);
      const files = await Promise.all(
        selectedFiles.map(async ({ name, text }) => {
          try {
            return await generatedAttachment(name, text);
          } catch (error) {
            if (name.endsWith(".xlsx"))
              return generatedAttachment(name.replace(/\.xlsx$/, ".csv"), text);
            throw error;
          }
        }),
      );
      const material =
        recentTurns.length ||
        sourcePages.length ||
        textOf(target.html).trim() ||
        target.purpose?.statement;
      if (!material) return;
      const response = await bridge.ask({
        workspaceId,
        purpose: "compact",
        question: "Summarize this conversation for the knowledge graph.",
        workspace: {
          version: 1,
          edges: [],
          pages: sourcePages.map(({ attachment, ...page }) => page),
          conversations: [target],
        },
      });
      if (generation !== requestGeneration.current) return;
      const current = wsRef.current;
      const latest = current.conversations.find(
        (item) => item.id === target.id,
      );
      if (!latest || latest.endedAt) return;
      if (latest.updatedAt !== target.updatedAt)
        throw new Error(
          "This conversation changed while it was ending. Try again.",
        );
      const existing = current.pages.find(
        (page) => page.id === latest.compactPageId,
      );
      const artifacts = files
        .filter(
          ({ file, text }) =>
            !sourcePages.some(
              (page) =>
                page.attachment?.name === file.name &&
                page.html ===
                  "<pre>" + escapeHtml(text.slice(0, 6000)) + "</pre>",
            ),
        )
        .map((file, index) => resourcePage(file, current.pages.length + index));
      const titles = [
        ...sourcePages
          .filter((page) => page.attachment)
          .map((page) => page.title),
        ...artifacts.map((page) => page.title),
      ];
      const match = relatedKnowledge(
        current.pages.filter(
          (page) =>
            !page.attachment &&
            !sourcePages.some((source) => source.id === page.id) &&
            page.id !== existing?.id,
        ),
        [
          target.title,
          target.purpose?.statement,
          response.answer,
          ...recentTurns.flatMap((turn) => [
            turn.question,
            turn.answer.slice(0, 1200),
          ]),
        ].join("\n"),
      );
      const links = new Set([
        ...sourcePages.map((page) => page.id),
        ...artifacts.map((page) => page.id),
        ...match,
      ]);
      const now = new Date().toISOString();
      const note: Page = {
        id: existing?.id ?? crypto.randomUUID(),
        kind: "note",
        title: existing?.title || target.title || "Conversation summary",
        x: existing?.x ?? (sourcePages[0]?.x ?? 0) + 280,
        y: existing?.y ?? sourcePages[0]?.y ?? 0,
        updatedAt: now,
        html:
          "<p>" +
          escapeHtml(response.answer).replace(/\n/g, "<br>") +
          "</p>" +
          (titles.length
            ? "<p>Files: " + escapeHtml(titles.join(", ")) + "</p>"
            : ""),
      };
      const edges = [...links]
        .filter(
          (id) =>
            !current.edges.some(
              (edge) =>
                (edge.source === note.id && edge.target === id) ||
                (edge.target === note.id && edge.source === id),
            ),
        )
        .map((id) => ({
          id: crypto.randomUUID(),
          source: note.id,
          target: id,
          relationship: "relates" as const,
        }));
      if (
        current.pages.length + artifacts.length + Number(!existing) > 5000 ||
        current.edges.length + edges.length > 25000 ||
        [...current.pages, ...artifacts].reduce(
          (size, page) => size + (page.attachment?.data.length ?? 0),
          0,
        ) > maxWorkspaceFileCharacters
      )
        throw new Error("The workspace graph or file limit has been reached.");
      setWs((workspace) => ({
        ...workspace,
        pages: [
          ...workspace.pages.filter((page) => page.id !== note.id),
          note,
          ...artifacts,
        ],
        edges: [...workspace.edges, ...edges],
        conversations: workspace.conversations.map((item) =>
          item.id === target.id
            ? {
                ...item,
                compactPageId: note.id,
                endedAt: now,
                archived: true,
                nodeIds: [...new Set([...item.nodeIds, note.id, ...links])],
                updatedAt: now,
              }
            : item,
        ),
      }));
      setNotice(
        unique.size > selectedFiles.length
          ? "Knowledge saved. Conversation archived. The latest 20 generated files were added to the graph."
          : "Knowledge saved. Conversation archived.",
      );
    } catch (error) {
      if (generation === requestGeneration.current)
        setNotice(
          "Could not save as knowledge. " +
            (error as Error).message.replace(
              /^Error invoking remote method '[^']+': (Error: )?/,
              "",
            ),
        );
    } finally {
      setEndingConversation((active) => (active === target.id ? "" : active));
    }
  }
  async function ask(purpose?: "session-note", fromHome?: string) {
    const submitted = (fromHome ?? question).trim();
    const target = fromHome ? newConversation(submitted) : conversation;
    const id = target.id;
    const targetTurns = target.aiTurns ?? [];
    if (
      target.endedAt ||
      endingConversation === id ||
      inFlight.current.has(id) ||
      (purpose ? !targetTurns.length : !submitted)
    )
      return;
    if (!purpose && targetTurns.length >= 100) {
      setNotice(
        "This conversation can hold up to 100 questions. Continue in a new conversation.",
      );
      return;
    }
    const task = {};
    const objective =
      target.purpose ??
      (submitted && !purpose
        ? {
            kind: "question" as const,
            statement: submitted,
          }
        : undefined);
    if (!target.purpose && objective)
      updateConversation({ purpose: objective });
    const generation = requestGeneration.current;
    const started = new Date().toISOString();
    inFlight.current.set(id, task);
    setAiRequests((current) => ({
      ...current,
      [id]: purpose ? {} : { question: submitted },
    }));
    if (!purpose) setQuestions((current) => ({ ...current, [id]: "" }));
    if (fromHome) setHomeQuestion("");

    try {
      const compactIds = new Set(
        ws.conversations.map((c) => c.compactPageId).filter(Boolean),
      );
      const linkedKnowledge = new Set(
        ws.edges.flatMap(({ source, target }) => {
          if (
            graphPagesById.has(source) &&
            compactIds.has(target) &&
            !graphPagesById.has(target)
          )
            return [target];
          if (
            graphPagesById.has(target) &&
            compactIds.has(source) &&
            !graphPagesById.has(source)
          )
            return [source];
          return [];
        }),
      );
      const result = await bridge.ask({
        workspaceId,
        question: purpose ? "Draft session note" : submitted,
        purpose,
        workspace: {
          version: 1,
          conversations: [{ ...target, purpose: objective }],
          pages: fromHome
            ? []
            : [
                ...[
                  ...graphPages,
                  ...ws.pages.filter((page) => linkedKnowledge.has(page.id)),
                ].map(({ attachment, ...page }) => page),
                ...(textOf(conversation.html).trim()
                  ? [
                      {
                        id: `spec:${id}`,
                        title:
                          `Conversation spec · ${conversation.title}`.slice(
                            0,
                            300,
                          ),
                        html: conversation.html,
                        kind: "project" as const,
                        x: 0,
                        y: 0,
                        updatedAt: conversation.updatedAt,
                      },
                    ]
                  : []),
              ],
          edges: fromHome ? [] : graphEdges,
        },
        selectedId: fromHome
          ? undefined
          : documentTarget === "spec"
            ? `spec:${id}`
            : selected,
      });
      if (
        generation !== requestGeneration.current ||
        inFlight.current.get(id) !== task
      )
        return;
      if (result.retrievalNotice) setNotice(result.retrievalNotice);
      setWs((current) => ({
        ...current,
        conversations: current.conversations.map((item) =>
          item.id !== id ||
          (purpose &&
            purposeReference(item.purpose) !== purposeReference(objective))
            ? item
            : {
                ...item,
                updatedAt: new Date().toISOString(),
                ...(purpose
                  ? {
                      sessionDraft: {
                        text: result.answer,
                        turnCount: targetTurns.length,
                      },
                    }
                  : {
                      ...([
                        newConversationTitle,
                        previousNewConversationTitle,
                      ].includes(item.title) &&
                        !item.aiTurns?.length && {
                          title: Array.from(submitted.split("\n")[0])
                            .slice(0, 60)
                            .join(""),
                        }),
                      aiTurns: [
                        ...(item.aiTurns ?? []),
                        { question: submitted, time: started, ...result },
                      ],
                    }),
              },
        ),
      }));
    } catch (error) {
      if (
        generation === requestGeneration.current &&
        inFlight.current.get(id) === task
      ) {
        setNotice((error as Error).message);
        if (!purpose)
          setQuestions((current) => ({
            ...current,
            [id]: current[id] || submitted,
          }));
      }
    } finally {
      if (inFlight.current.get(id) === task) {
        inFlight.current.delete(id);
        setAiRequests((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
    }
  }
  function approveSessionNote() {
    const session = conversation.sessionDraft;
    if (!session?.text.trim() || session.turnCount !== turns.length || request)
      return;
    const html = `<p>${escapeHtml(session.text.trim()).replace(/\n/g, "<br>")}</p><p>Reviewed by user · ${escapeHtml(new Date().toLocaleDateString("en-US"))}</p><p>Source: ${escapeHtml(conversation.title)} AI exchanges 1–${session.turnCount}</p>`;
    newPage(
      "note",
      html,
      `${conversation.title.slice(0, 270)} · Session note`,
      "read",
    );
    updateConversation({
      sessionDraft: undefined,
      summary: {
        text: session.text.trim(),
        turnCount: session.turnCount,
        reviewedAt: new Date().toISOString(),
        purpose: purposeReference(conversation.purpose),
      },
    });
    setPanel("ai");
    thread.current?.scrollTo({ top: 0 });
    setNotice("Reviewed session note saved.");
  }
  function completePurpose() {
    const { purpose, summary, project } = conversation;
    if (
      !purpose ||
      !summary ||
      summary.turnCount !== turns.length ||
      summary.purpose !== purposeReference(purpose) ||
      request
    )
      return;
    const completed = { ...purpose, completedAt: new Date().toISOString() };
    if (project) {
      updateConversation({ purpose: completed });
      return;
    }
    const title = `${conversation.title.slice(0, 285)} · Project`;
    const pageId = newPage(
      "project",
      `<h2>Purpose</h2><p>${escapeHtml(purpose.statement).replace(/\n/g, "<br>")}</p><h2>Reviewed outcome</h2><p>${escapeHtml(summary.text).replace(/\n/g, "<br>")}</p>`,
      title,
      "read",
    );
    updateConversation({ purpose: completed, project: { pageId, steps: [] } });
    setPanel("ai");
  }
  function continueFromRoom(room: SharedRoomState) {
    const id = `shared:${room.id ?? room.title}`;
    const existing = ws.conversations.find((item) => item.id === id);
    const roomTurns = room.turns.flatMap(
      ({ author, question, time, status, answer, runtime }) =>
        status === "done" && answer
          ? [{ author, question, time, answer, runtime }]
          : [],
    );
    const previous = existing?.aiTurns ?? [];
    // Keep the existing order so reviewed exchange references remain stable.
    const turnKey = ({
      author,
      question,
      time,
      answer,
    }: (typeof previous)[number]) =>
      JSON.stringify([author, question, time, answer]);
    const oldTurns = new Set(previous.map(turnKey));
    const aiTurns = [
      ...previous,
      ...roomTurns.filter((turn) => !oldTurns.has(turnKey(turn))),
    ];
    if (aiTurns.length > 300) {
      setNotice(
        "This conversation has reached 300 questions. Continue in a new room.",
      );
      return;
    }
    const statement = room.purpose || roomTurns[0]?.question;
    const next: Conversation = {
      id,
      title: room.title,
      html: "",
      nodeIds: [],
      favorite: false,
      favoriteNodeIds: [],
      involved: true,
      ...existing,
      purpose:
        existing?.purpose ??
        (statement
          ? { statement, kind: room.purposeKind ?? "question" }
          : undefined),
      aiTurns,
      updatedAt: new Date().toISOString(),
    };
    setWs((current) => ({
      ...current,
      conversations: existing
        ? current.conversations.map((item) => (item.id === id ? next : item))
        : [...current.conversations, next],
    }));
    openConversation(next);
  }
  async function exportWorkspace(format: "json" | "presentation") {
    try {
      const presentation =
        format === "presentation"
          ? workspacePresentation(ws, (html) =>
              textOf(
                html.replace(
                  /<br\s*\/?>|<\/(?:p|h[1-6]|li|div|blockquote)>/gi,
                  "$&\n",
                ),
              ).trim(),
            )
          : undefined;
      const saved = await bridge.export(ws, presentation);
      if (saved) setNotice("Workspace file saved.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  function record() {
    const id = conversation.id;
    const generation = requestGeneration.current;
    const target = recordMode ? setDrafts : setQuestions;
    const input = composer.current;
    void dictation.toggle((text) => {
      if (generation !== requestGeneration.current) return;
      if (showHome)
        (recordMode ? setHomeDraft : setHomeQuestion)((current) =>
          appendDictation(current, text, 12000),
        );
      else
        target((current) => ({
          ...current,
          [id]: appendDictation(current[id] ?? "", text, 12000),
        }));
      focusDictationInput(input);
    });
  }
  async function importWorkspace() {
    if (cloud.link?.revision) {
      setNotice(
        "Disconnect from the shared workspace before importing a backup.",
      );
      return;
    }
    try {
      const value = await bridge.import();
      if (value) {
        if (
          !window.confirm(
            "Replace the current workspace with this file? You can export a backup first.",
          )
        )
          return;
        const normalized = withConversations(value);
        requestGeneration.current += 1;
        inFlight.current.clear();
        setAiRequests({});
        setDrafts({});
        setQuestions({});
        setWs(normalized);
        if (normalized.conversations[0])
          openConversation(normalized.conversations[0]);
        else {
          setActiveConversation("");
          setSelected("");
          openHome();
        }
        setTab("read");
      }
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function changeWorkspace(value: string) {
    if (!workspaceAction || workspacePending.current) return;
    setWorkspaceError("");
    workspacePending.current = true;
    setWorkspaceBusy(true);
    try {
      const name = value.trim();
      let next = library;
      if (workspaceAction === "rename") {
        next = {
          ...library,
          items: library.items.map((item) =>
            item.id === workspaceId ? { ...item, name } : item,
          ),
        };
      } else {
        if (inFlight.current.size || dictation.phase !== "idle")
          throw new Error(
            "Wait for the AI reply or voice input to finish before switching workspaces.",
          );
        if (workspaceAction === "create") {
          const id = crypto.randomUUID();
          next = { active: id, items: [...library.items, { id, name }] };
        } else {
          next = { ...library, active: value };
        }
      }
      next = workspaceLibrary(next);
      if (next.active !== workspaceId)
        await bridge.save(wsRef.current, workspaceId);
      await bridge.saveLibrary(next);
      setWorkspaceAction(null);
      onLibrary(next);
    } catch (error) {
      setWorkspaceError((error as Error).message);
    } finally {
      workspacePending.current = false;
      setWorkspaceBusy(false);
    }
  }
  function importMigration(preview: MigrationPreview, selection: string[]) {
    const result = appendMigration(wsRef.current, preview.workspace, selection);
    if (!result.pages && !result.edges)
      throw new Error("The selected items are already imported.");
    if (
      new TextEncoder().encode(
        JSON.stringify({
          baseRevision: Number.MAX_SAFE_INTEGER,
          workspace: result.workspace,
        }),
      ).byteLength > 25_000_000
    )
      throw new Error(
        "The combined workspace exceeds 25 MB. Select fewer items.",
      );
    wsRef.current = result.workspace;
    setWs(result.workspace);
    setMigrationOpen(false);
    const imported = result.workspace.conversations.find((item) =>
      result.conversations.includes(item.id),
    );
    if (imported) {
      openConversation(imported);
      setDocumentTarget("node");
      setPanel("page");
    }
    setNotice(
      `Added ${result.pages} ${result.pages === 1 ? "note" : "notes"} and ${result.edges} ${result.edges === 1 ? "connection" : "connections"}.`,
    );
  }
  if (!ready)
    return (
      <div className="loading">
        <img src={wallaceIcon} width={40} height={40} alt="" />
        <h1>Wallace</h1>
        <p>
          {loadError
            ? "Could not open the workspace. Editing is disabled to protect your data."
            : "Connecting your ideas…"}
        </p>
        {loadError && (
          <>
            {notice && <p>{notice}</p>}
            <button onClick={() => location.reload()}>Try again</button>
          </>
        )}
      </div>
    );
  return (
    <div className={`app-shell${resizingSidebar ? " resizing-sidebar" : ""}`}>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close conversation list"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`sidebar compact-sidebar ${sidebarOpen ? "is-open" : ""}`}
        id="conversation-sidebar"
        style={
          { "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties
        }
        aria-label="Conversation list"
      >
        <div className="window-space" />
        <div className="sidebar-tools">
          <label className="search">
            <Search size={15} />
            <input
              aria-label="Search notes and conversations"
              placeholder="Search workspace"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className="new-thread"
            title="New conversation"
            aria-label="New conversation graph"
            onClick={() => newConversation()}
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="conversation-navigation">
          <button
            className={`conversation-row ${showHome && !workspaceGraph ? "current" : ""}`}
            aria-current={showHome && !workspaceGraph ? "page" : undefined}
            onClick={openHome}
          >
            <House size={15} />
            <span>Home</span>
          </button>
          <button
            className={`conversation-row ${workspaceGraph ? "current" : ""}`}
            aria-current={workspaceGraph ? "page" : undefined}
            onClick={() => {
              setSidebarOpen(false);
              setWorkspaceGraph(true);
            }}
          >
            <Network size={15} />
            <span>Workspace graph</span>
          </button>
          <div className="section-label">
            <span>
              <Star size={12} />
              Favorites
            </span>
          </div>
          <div className="favorite-list">
            {favorites.map((c) => (
              <RenameableSidebarRow
                key={c.id}
                title={c.title || "Untitled conversation"}
                label={`Starred conversation: ${c.title}`}
                renameLabel="Rename favorite"
                selected={
                  !workspaceGraph &&
                  screen === "conversation" &&
                  c.id === conversation.id
                }
                icon={<Star size={14} />}
                onOpen={() => openConversation(c)}
                onRename={(title) => updateConversation({ title }, c.id)}
              />
            ))}
            {favoriteNodes.map(({ conversation: c, page: p }) => (
              <RenameableSidebarRow
                key={`${c.id}:${p.id}`}
                title={p.title || "Untitled page"}
                label={`Starred node: ${p.title}`}
                renameLabel="Rename favorite"
                selected={
                  screen === "conversation" &&
                  c.id === conversation.id &&
                  p.id === selected
                }
                icon={<FileText size={14} />}
                onOpen={() => {
                  openConversation(c);
                  choose(p.id);
                }}
                onRename={(title) => patch(p.id, { title })}
              />
            ))}
            {favorites.length === 0 && favoriteNodes.length === 0 && (
              <p className="empty-small">
                Star a conversation to keep it here.
              </p>
            )}
          </div>
          <div className="section-label conversation-list-label">
            {noteQuery ? "Conversations" : "My conversations"}
          </div>
          <div className="conversation-list">
            {conversationResults.map((c) => (
              <RenameableSidebarRow
                key={c.id}
                title={c.title || "Untitled conversation"}
                label={`Open conversation: ${c.title}`}
                renameLabel="Rename conversation"
                selected={
                  !workspaceGraph &&
                  screen === "conversation" &&
                  c.id === conversation.id
                }
                icon={<MessageSquare size={15} />}
                onOpen={() => openConversation(c)}
                onRename={(title) => updateConversation({ title }, c.id)}
              />
            ))}
            {conversationResults.length === 0 && (
              <p className="empty-small">No conversations to show.</p>
            )}
          </div>
          {noteQuery && (
            <section
              className="sidebar-note-results"
              aria-label="Matching notes"
            >
              <div className="section-label">Notes</div>
              {!matchingNotes.length && (
                <p className="empty-small">No matching notes.</p>
              )}
              {matchingNotes.map(({ page }) => (
                <button
                  className="conversation-row"
                  type="button"
                  key={page.id}
                  onClick={() => openGraphPage(page.id)}
                  title={page.title}
                >
                  <FileText size={15} />{" "}
                  <span>{page.title || "Untitled note"}</span>
                </button>
              ))}
            </section>
          )}
          {ws.conversations.some((c) => c.archived) && (
            <details className="archive-list">
              <summary>Archived conversations</summary>
              {ws.conversations
                .filter(
                  (c) =>
                    c.archived &&
                    c.title.toLowerCase().includes(query.toLowerCase()),
                )
                .map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => openConversation(c)}
                  >
                    <Archive size={14} />
                    {c.title || "Untitled conversation"}
                  </button>
                ))}
            </details>
          )}
        </div>
        <details
          className="workspace-menu"
          ref={workspaceMenu}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              event.currentTarget.open = false;
          }}
        >
          <summary>
            <span className="avatar small">
              <ProfileIcon profile={profile} />
            </span>
            <span className="workspace-current-name" title={workspaceName}>
              {workspaceName}
            </span>
            <ChevronDown size={14} />
          </summary>
          <div className="workspace-menu-items">
            {(
              [
                ["switch", "Switch workspace", FolderOpen],
                ["create", "New workspace", Plus],
                ["rename", "Rename workspace", Pencil],
              ] as const
            ).map(([action, label, Icon]) => (
              <button
                key={action}
                onClick={() => {
                  workspaceMenu.current!.open = false;
                  setWorkspaceError("");
                  setWorkspaceAction(action);
                }}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
            {bridge.cloudFor && (
              <button
                onClick={() => {
                  workspaceMenu.current!.open = false;
                  setCloudOpen(true);
                }}
              >
                <Cloud size={16} /> Shared workspace
              </button>
            )}
            <button
              onClick={() => {
                workspaceMenu.current!.open = false;
                setProfileName(profile.name);
                setProfileIcon(profile.icon);
                setProfilePhoto(profile.photo);
                setProfilePhotoBusy(false);
                setProfileOpen(true);
              }}
            >
              <ProfileIcon profile={profile} /> My profile
            </button>
            <button
              onClick={() => {
                workspaceMenu.current!.open = false;
                setSidebarOpen(false);
                setWorkspaceGraph(false);
                setScreen("room");
              }}
            >
              <Users size={16} />
              Shared AI room
            </button>
            {!isMobileApp && (
              <button
                onClick={() => {
                  workspaceMenu.current!.open = false;
                  void bridge
                    .checkUpdate()
                    .catch((error) => setNotice(error.message));
                }}
              >
                <RefreshCw size={16} />
                Check for updates
              </button>
            )}
            <button
              onClick={() => {
                workspaceMenu.current!.open = false;
                setSettingsOpen("ai");
              }}
            >
              <Settings2 size={16} />
              AI connections
            </button>
            {!isMobileApp && (
              <button
                onClick={() => {
                  workspaceMenu.current!.open = false;
                  workspaceMenu.current?.querySelector("summary")?.focus();
                  setShortcutsOpen(true);
                }}
              >
                <Keyboard size={16} />
                Keyboard shortcuts
              </button>
            )}
            <button
              onClick={() => {
                workspaceMenu.current!.open = false;
                void importWorkspace();
              }}
            >
              <Upload size={16} />
              Import workspace
            </button>
            {bridge.previewMigration && (
              <button
                onClick={() => {
                  workspaceMenu.current!.open = false;
                  setMigrationOpen(true);
                }}
              >
                <Upload size={16} />
                Import from Notion or Slack
              </button>
            )}
            <button
              onClick={() => {
                workspaceMenu.current!.open = false;
                void exportWorkspace("json");
              }}
            >
              <Download size={16} />
              Export workspace
            </button>
            <button
              onClick={() => {
                workspaceMenu.current!.open = false;
                void exportWorkspace("presentation");
              }}
            >
              <Download size={16} /> Download as slides
            </button>
          </div>
        </details>
        <div
          className="sidebar-resize"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-controls="conversation-sidebar"
          aria-valuemin={sidebarMin}
          aria-valuemax={sidebarMax}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            sidebarDrag.current = {
              startX: event.clientX,
              startWidth: sidebarWidth,
              width: sidebarWidth,
            };
            setResizingSidebar(true);
          }}
          onPointerMove={(event) => {
            const drag = sidebarDrag.current;
            if (
              !drag ||
              !event.currentTarget.hasPointerCapture(event.pointerId)
            )
              return;
            drag.width = clampSidebarWidth(
              drag.startWidth + event.clientX - drag.startX,
            );
            setSidebarWidth(drag.width);
          }}
          onLostPointerCapture={finishSidebarResize}
          onDoubleClick={() => saveSidebarWidth(sidebarDefault)}
          onKeyDown={(event) => {
            const widths: Record<string, number> = {
              ArrowLeft: sidebarWidth - 16,
              ArrowRight: sidebarWidth + 16,
              Home: sidebarMin,
              End: sidebarMax,
            };
            if (!Object.hasOwn(widths, event.key)) return;
            event.preventDefault();
            saveSidebarWidth(clampSidebarWidth(widths[event.key]));
          }}
        />
      </aside>
      {workspaceGraph ? (
        <WorkspaceGraph
          workspaceName={workspaceName}
          workspace={ws}
          onBack={() => setWorkspaceGraph(false)}
          onMenu={() => setSidebarOpen(true)}
          onOpen={openGraphPage}
        />
      ) : showSharedRoom ? (
        <SharedRoom
          onBack={openHome}
          onMenu={() => setSidebarOpen(true)}
          menuOpen={sidebarOpen}
          onContinue={continueFromRoom}
          profile={ws.profile}
          settings={settings}
          microphoneId={microphoneId}
          onVoiceSettings={() => setSettingsOpen("voice")}
        />
      ) : (
        <main className={`main chat-main${showHome ? " ai-home" : ""}`}>
          {showHome ? (
            <div className="ai-home-header">
              <button
                className="open-sidebar"
                aria-label="Open conversation list"
                aria-expanded={sidebarOpen}
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeft size={18} />
              </button>
            </div>
          ) : (
            <div
              className={`workspace-body conversation-body${graphVisible ? " with-conversation-graph" : ""}`}
              ref={thread}
            >
              <section
                className="conversation-thread"
                aria-label="Conversation"
              >
                <div className="thread-heading">
                  <button
                    className="open-sidebar"
                    aria-label="Open conversation list"
                    aria-expanded={sidebarOpen}
                    onClick={() => setSidebarOpen(true)}
                  >
                    <PanelLeft size={18} />
                  </button>
                  <h1 title={conversation.title}>
                    {conversation.title || "Untitled conversation"}
                  </h1>
                  <div
                    className="thread-actions"
                    role="group"
                    aria-label="Conversation actions"
                  >
                    {(hasContext || turns.length > 0) && (
                      <button
                        title="Connection graph"
                        aria-label="Connection graph"
                        aria-pressed={graphVisible}
                        onClick={() => setGraphVisible(!graphVisible)}
                      >
                        <Network size={16} /> Graph
                      </button>
                    )}
                    {hasContext && (
                      <button
                        title="Go to conversation spec"
                        aria-label="Go to conversation spec"
                        onClick={() => {
                          choose(`spec:${conversation.id}`);
                          requestAnimationFrame(() =>
                            document
                              .getElementById("thread-detail")
                              ?.scrollIntoView({ block: "start" }),
                          );
                        }}
                      >
                        <AlignLeft size={17} /> Spec
                      </button>
                    )}
                    <button
                      className={conversation.favorite ? "is-favorite" : ""}
                      title={
                        conversation.favorite
                          ? "Remove from Favorites"
                          : "Add to Favorites"
                      }
                      aria-label={
                        conversation.favorite
                          ? "Remove from Favorites"
                          : "Add to Favorites"
                      }
                      aria-pressed={conversation.favorite}
                      onClick={() =>
                        updateConversation({
                          favorite: !conversation.favorite,
                        })
                      }
                    >
                      <Star
                        size={17}
                        fill={conversation.favorite ? "currentColor" : "none"}
                      />{" "}
                      {conversation.favorite ? "Favorited" : "Favorite"}
                    </button>
                    <button
                      type="button"
                      title={
                        isMobileApp
                          ? "Rename conversation"
                          : `Rename conversation (${shortcutText(shortcuts.rename)})`
                      }
                      aria-label="Rename conversation"
                      aria-keyshortcuts={
                        isMobileApp ? undefined : shortcutAria(shortcuts.rename)
                      }
                      onClick={() =>
                        setConversationAction({
                          id: conversation.id,
                          type: "rename",
                        })
                      }
                    >
                      <Pencil size={16} /> Rename
                    </button>
                    <button
                      type="button"
                      title={
                        conversation.archived
                          ? "Restore conversation"
                          : "Archive conversation"
                      }
                      aria-label={
                        conversation.archived
                          ? "Restore conversation"
                          : "Archive conversation"
                      }
                      disabled={!!request}
                      onClick={() =>
                        conversation.archived
                          ? updateConversation({
                              archived: false,
                              endedAt: undefined,
                              involved: true,
                            })
                          : setConversationAction({
                              id: conversation.id,
                              type: "archive",
                            })
                      }
                    >
                      <Archive size={17} />{" "}
                      {conversation.archived ? "Restore" : "Archive"}
                    </button>
                    <button
                      type="button"
                      className="thread-delete"
                      title={
                        isMobileApp
                          ? "Delete conversation"
                          : `Delete conversation (${shortcutText(shortcuts.delete)})`
                      }
                      aria-label="Delete conversation"
                      aria-keyshortcuts={
                        isMobileApp ? undefined : shortcutAria(shortcuts.delete)
                      }
                      onClick={() =>
                        setConversationAction({
                          id: conversation.id,
                          type: "delete",
                        })
                      }
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                    <button
                      title={
                        conversation.involved
                          ? "Remove from my list"
                          : "Add to my list"
                      }
                      aria-label={
                        conversation.involved
                          ? "Remove from my list"
                          : "Add to my list"
                      }
                      aria-pressed={conversation.involved}
                      onClick={() =>
                        updateConversation({
                          involved: !conversation.involved,
                        })
                      }
                    >
                      <Users size={17} />{" "}
                      {conversation.involved ? "In my list" : "Add to my list"}
                    </button>
                  </div>
                </div>
                <ConversationPurpose
                  key={conversation.id}
                  conversation={conversation}
                  onPurpose={(purpose) =>
                    updateConversation({ purpose, sessionDraft: undefined })
                  }
                  onComplete={completePurpose}
                  onSteps={(steps) => {
                    if (conversation.project)
                      updateConversation({
                        project: { ...conversation.project, steps },
                      });
                  }}
                  onOpenProject={choose}
                  busy={!!request}
                />
                <div className="conversation-knowledge">
                  {!conversation.endedAt &&
                    (turns.length > 0 ||
                      graphPages.length > 0 ||
                      savedContext) && (
                      <button
                        type="button"
                        className="knowledge-save save-knowledge-primary"
                        disabled={
                          !!request || !!endingConversation || attachingFiles
                        }
                        onClick={() => void saveConversationKnowledge()}
                      >
                        <Check size={16} />
                        {endingConversation === conversation.id
                          ? "Saving as knowledge…"
                          : "Save as knowledge"}
                      </button>
                    )}
                  {conversation.endedAt && !knowledgeSavedNotice && (
                    <span className="knowledge-saved-status">
                      <Check size={14} /> Conversation archived
                    </span>
                  )}

                  {knowledgeSavedNotice && (
                    <span className="knowledge-saved-status" role="status">
                      <Check size={14} /> {notice}
                    </span>
                  )}

                  {compactNoteId && (
                    <button
                      type="button"
                      className="knowledge-save"
                      disabled={!!request}
                      onClick={() =>
                        setConversationAction({
                          id: conversation.id,
                          type: "knowledge",
                        })
                      }
                    >
                      <BookOpen size={16} /> Manage saved knowledge
                    </button>
                  )}
                  {compactNoteId && (
                    <>
                      <button
                        type="button"
                        className="knowledge-open"
                        onClick={() => openGraphPage(compactNoteId)}
                      >
                        Open saved note
                      </button>
                      {compactLinkedPages.length > 0 && (
                        <details className="knowledge-links">
                          <summary>
                            {compactLinkedPages.length} linked{" "}
                            {compactLinkedPages.length === 1 ? "node" : "nodes"}
                          </summary>
                          <ul>
                            {compactLinkedPages.map((page) => (
                              <li key={page.id}>
                                <button
                                  type="button"
                                  onClick={() => openGraphPage(page.id)}
                                >
                                  {page.title || "Untitled node"}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </div>
                {attachedFiles.length > 0 && (
                  <details className="conversation-file-list">
                    <summary>
                      <Paperclip size={14} /> {attachedFiles.length}{" "}
                      {attachedFiles.length === 1 ? "file" : "files"}
                    </summary>
                    <ul>
                      {attachedFiles.map((page) => (
                        <li key={page.id}>
                          <button type="button" onClick={() => choose(page.id)}>
                            {page.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadAttachment(page.attachment!)}
                            aria-label={`Download ${page.title}`}
                          >
                            Download
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {!conversation.summary && panel === "ai" && savedContext && (
                  <details className="saved-context">
                    <summary>Saved conversation overview</summary>
                    <div
                      className="prose"
                      dangerouslySetInnerHTML={{
                        __html: clean(conversation.html),
                      }}
                    />
                  </details>
                )}
                {hasContext && (
                  <details
                    className="conversation-records"
                    open={panel === "page" || undefined}
                  >
                    <summary>Saved pages ({graphPages.length})</summary>
                    <ol
                      className="thread-entries"
                      aria-label="Conversation history"
                    >
                      {graphPages.map((entry) => {
                        const kind = kinds[entry.kind];
                        const Icon = kind.icon;
                        const replyTo = graphPagesById.get(
                          replies.get(entry.id) ?? "",
                        );
                        const preview = textOf(
                          entry.html.replace(
                            /<br\s*\/?>|<\/(?:p|h[1-6]|li|div|blockquote)>/gi,
                            "$& ",
                          ),
                        ).trim();
                        return (
                          <li
                            key={entry.id}
                            id={`entry-${entry.id}`}
                            className="thread-entry"
                          >
                            <span
                              className="thread-entry-icon"
                              style={{ color: kind.color }}
                            >
                              <Icon size={16} />
                            </span>
                            <button
                              className="thread-entry-content"
                              aria-current={
                                documentTarget === "node" &&
                                selected === entry.id
                                  ? "true"
                                  : undefined
                              }
                              onClick={() => {
                                choose(entry.id);
                                requestAnimationFrame(() =>
                                  document
                                    .getElementById("thread-detail")
                                    ?.scrollIntoView({ block: "start" }),
                                );
                              }}
                            >
                              <span className="thread-entry-title">
                                <strong>
                                  {entry.title || "Untitled page"}
                                </strong>
                                <span>{kind.label}</span>
                              </span>
                              {replyTo && (
                                <span className="thread-entry-link">
                                  <Link2 size={11} />
                                  {replyTo.title}
                                </span>
                              )}
                              {preview && preview !== entry.title && (
                                <span className="thread-entry-preview">
                                  {preview}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                    {!graphPages.length && (
                      <p className="thread-empty">Add your first note below.</p>
                    )}
                  </details>
                )}
              </section>
              <section
                id="thread-detail"
                className="spec-panel"
                aria-label="Conversation history and spec"
              >
                {(hasContext || panel === "page") && (
                  <div className="panel-tabs">
                    <button
                      className={panel === "ai" ? "active" : ""}
                      onClick={() => {
                        setPanel("ai");
                        setRecordMode(false);
                      }}
                    >
                      <Sparkles size={16} />
                      AI assistant
                    </button>
                    <button
                      className={
                        panel === "page" && documentTarget === "spec"
                          ? "active"
                          : ""
                      }
                      onClick={() => {
                        setDocumentTarget("spec");
                        setPanel("page");
                        setTab("read");
                      }}
                    >
                      <AlignLeft size={16} />
                      Conversation spec
                    </button>
                    <button
                      className={
                        panel === "page" && documentTarget === "node"
                          ? "active"
                          : ""
                      }
                      disabled={!nodePage}
                      onClick={() => {
                        setDocumentTarget("node");
                        setPanel("page");
                        setTab("read");
                      }}
                    >
                      <Network size={16} />
                      Selected node
                      {nodePage && (
                        <span className="tab-node-title">{nodePage.title}</span>
                      )}
                    </button>
                  </div>
                )}
                {panel === "page" && page ? (
                  <>
                    <div className="page-toolbar">
                      <span
                        className="type-badge"
                        style={{ color: kinds[page.kind].color }}
                      >
                        {documentTarget === "spec"
                          ? "Notes for this conversation"
                          : kinds[page.kind].label}
                      </span>
                      <div className="view-modes">
                        {documentTarget === "node" && nodePage && (
                          <button
                            aria-label={
                              conversation.favoriteNodeIds.includes(nodePage.id)
                                ? "Unstar node"
                                : "Star node"
                            }
                            aria-pressed={conversation.favoriteNodeIds.includes(
                              nodePage.id,
                            )}
                            className={
                              conversation.favoriteNodeIds.includes(nodePage.id)
                                ? "is-favorite"
                                : ""
                            }
                            onClick={() =>
                              updateConversation({
                                favoriteNodeIds:
                                  conversation.favoriteNodeIds.includes(
                                    nodePage.id,
                                  )
                                    ? conversation.favoriteNodeIds.filter(
                                        (id) => id !== nodePage.id,
                                      )
                                    : [
                                        ...conversation.favoriteNodeIds,
                                        nodePage.id,
                                      ],
                              })
                            }
                          >
                            <Star size={15} />
                          </button>
                        )}
                        <button
                          aria-label="Reading mode"
                          title="Read"
                          className={tab === "read" ? "active" : ""}
                          onClick={() => setTab("read")}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          aria-label="Editing mode"
                          title="Edit"
                          className={tab === "edit" ? "active" : ""}
                          onClick={() => setTab("edit")}
                        >
                          <FileText size={15} />
                        </button>
                        <button
                          aria-label="Edit HTML"
                          title="Edit HTML"
                          className={tab === "html" ? "active" : ""}
                          onClick={() => setTab("html")}
                        >
                          <Code2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="document-scroll">
                      <div className="document-heading">
                        <div
                          className="document-icon"
                          style={{ color: kinds[page.kind].color }}
                        >
                          {(() => {
                            const Icon = kinds[page.kind].icon;
                            return <Icon size={25} />;
                          })()}
                        </div>
                        <input
                          className="title-input"
                          aria-label={
                            documentTarget === "spec"
                              ? "Conversation spec title"
                              : "Page title"
                          }
                          value={page.title}
                          maxLength={300}
                          placeholder="Untitled page"
                          onChange={(e) =>
                            patch(page.id, { title: e.target.value })
                          }
                        />
                        <div className="document-date">
                          Last edited{" "}
                          {new Date(page.updatedAt).toLocaleDateString("en-US")}
                        </div>
                      </div>
                      {tab === "read" ? (
                        <div
                          className="prose"
                          onClick={(e) => {
                            const anchor = (e.target as HTMLElement).closest(
                              "a",
                            );
                            if (!anchor) return;
                            e.preventDefault();
                            const href = anchor.getAttribute("href");
                            if (
                              href?.startsWith("#import:") &&
                              ws.pages.some(({ id }) => href === "#" + id)
                            ) {
                              openGraphPage(href.slice(1));
                            } else if (
                              href &&
                              /^https?:\/\//i.test(href) &&
                              page.id.startsWith("import:") &&
                              bridge.openMigrationLink
                            ) {
                              void bridge
                                .openMigrationLink(href)
                                .catch(() =>
                                  setNotice(
                                    "Could not open the link in your browser.",
                                  ),
                                );
                            }
                          }}
                          dangerouslySetInnerHTML={{ __html: clean(page.html) }}
                        />
                      ) : tab === "html" ? (
                        <div className="html-editor">
                          <label>
                            HTML source{" "}
                            <small>
                              Use headings, lists, tables, and more.
                            </small>
                          </label>
                          <textarea
                            aria-label="HTML source"
                            spellCheck={false}
                            value={page.html}
                            maxLength={1000000}
                            onChange={(e) =>
                              patch(page.id, { html: e.target.value })
                            }
                          />
                          <p>
                            Scripts, styles, and external media are disabled.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="format-bar">
                            {[
                              ["Bold", "bold"],
                              ["Italic", "italic"],
                              ["List", "insertUnorderedList"],
                              ["Title", "formatBlock"],
                            ].map(([label, cmd]) => (
                              <button
                                key={cmd}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  editor.current?.focus();
                                  document.execCommand(
                                    cmd,
                                    false,
                                    cmd === "formatBlock" ? "h2" : undefined,
                                  );
                                  if (editor.current)
                                    patch(page.id, {
                                      html: clean(editor.current.innerHTML),
                                    });
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <div
                            ref={editor}
                            className="prose editable"
                            contentEditable
                            suppressContentEditableWarning
                            role="textbox"
                            aria-label={
                              documentTarget === "spec"
                                ? "Conversation spec content"
                                : "Page content"
                            }
                            aria-multiline
                            onInput={(e) =>
                              patch(page.id, {
                                html: clean(e.currentTarget.innerHTML),
                              })
                            }
                            onPaste={(e) => {
                              e.preventDefault();
                              document.execCommand(
                                "insertText",
                                false,
                                e.clipboardData.getData("text/plain"),
                              );
                            }}
                          />
                        </>
                      )}
                      {documentTarget === "node" && (
                        <>
                          <div className="connections">
                            <div className="section-label">
                              Connected pages<span>{connected.length}</span>
                            </div>
                            {connected.map((e) => {
                              const other = ws.pages.find(
                                (p) =>
                                  p.id ===
                                  (e.source === selected ? e.target : e.source),
                              );
                              if (!other) return null;
                              return (
                                <div className="connection" key={e.id}>
                                  <button
                                    onClick={() =>
                                      graphPagesById.has(other.id)
                                        ? choose(other.id)
                                        : openGraphPage(other.id)
                                    }
                                  >
                                    <Link2 size={15} />
                                    <span>{other.title}</span>
                                    <ArrowUpRight size={14} />
                                  </button>
                                  <select
                                    aria-label={`${other.title} Connection type`}
                                    value={e.relationship ?? "relates"}
                                    onChange={(event) => {
                                      const relationship = event.target
                                        .value as Relationship;
                                      setWs((current) => ({
                                        ...current,
                                        edges: current.edges.map((edge) =>
                                          edge.id === e.id
                                            ? { ...edge, relationship }
                                            : edge,
                                        ),
                                      }));
                                    }}
                                  >
                                    {Object.entries(relationshipLabels).map(
                                      ([value, label]) => (
                                        <option key={value} value={value}>
                                          {label}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                  <button
                                    className="unlink"
                                    aria-label={`${other.title} Disconnect`}
                                    title="Disconnect"
                                    onClick={() =>
                                      setWs((w) => ({
                                        ...w,
                                        edges: w.edges.filter(
                                          (x) => x.id !== e.id,
                                        ),
                                      }))
                                    }
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              );
                            })}
                            {!!linkablePages.length && (
                              <label className="link-existing">
                                Connect existing page
                                <select
                                  aria-label="Connect existing page"
                                  value=""
                                  onChange={(event) => {
                                    const target = event.target.value;
                                    if (!target) return;
                                    const id = crypto.randomUUID();
                                    setWs((current) => ({
                                      ...current,
                                      conversations: current.conversations.map(
                                        (c) =>
                                          c.id === conversation.id
                                            ? {
                                                ...c,
                                                nodeIds: [
                                                  ...new Set([
                                                    ...c.nodeIds,
                                                    target,
                                                  ]),
                                                ],
                                                updatedAt:
                                                  new Date().toISOString(),
                                              }
                                            : c,
                                      ),
                                      edges: current.edges.some(
                                        (edge) =>
                                          (edge.source === selected &&
                                            edge.target === target) ||
                                          (edge.source === target &&
                                            edge.target === selected),
                                      )
                                        ? current.edges
                                        : [
                                            ...current.edges,
                                            {
                                              id,
                                              source: selected,
                                              target,
                                              relationship: "relates",
                                            },
                                          ],
                                    }));
                                  }}
                                >
                                  <option value="">Choose a page</option>
                                  {linkablePages.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.title || "Untitled page"}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            <button
                              className="add-connected"
                              onClick={() => newPage()}
                            >
                              <Plus size={15} />
                              Create linked page
                            </button>
                          </div>
                          <div className="page-properties">
                            <label>
                              Page type
                              <select
                                aria-label="Page type"
                                value={page.kind}
                                onChange={(e) =>
                                  patch(page.id, {
                                    kind: e.target.value as Kind,
                                  })
                                }
                              >
                                {Object.entries(kinds).map(([id, k]) => (
                                  <option key={id} value={id}>
                                    {k.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              className="delete-page"
                              onClick={() => setDeleteOpen(true)}
                            >
                              <Trash2 size={14} />
                              Delete page
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      className="ask-page"
                      onClick={() => {
                        setPanel("ai");
                        setRecordMode(false);
                        setQuestions((current) => ({
                          ...current,
                          [conversation.id]:
                            current[conversation.id] ||
                            "Summarize this page and the information connected to it.",
                        }));
                      }}
                    >
                      <Sparkles size={16} />
                      <span>Ask AI about this page</span>
                      <ArrowUpRight size={15} />
                    </button>
                  </>
                ) : panel === "page" ? (
                  <div className="empty-panel">
                    <FileText size={28} />
                    <p>Select a page in the graph.</p>
                  </div>
                ) : (
                  <AiConversation
                    key={conversation.id}
                    turns={turns}
                    pending={request?.question}
                    drafting={!!request && !request.question}
                    draft={conversation.sessionDraft}
                    purpose={conversation.purpose}
                    onIntent={(index, intent) => {
                      const id = conversation.id;
                      setWs((current) => ({
                        ...current,
                        conversations: current.conversations.map((item) =>
                          item.id === id && item.aiTurns?.[index]
                            ? {
                                ...item,
                                updatedAt: new Date().toISOString(),
                                aiTurns: item.aiTurns.map((turn, position) =>
                                  position === index
                                    ? { ...turn, intent }
                                    : turn,
                                ),
                              }
                            : item,
                        ),
                      }));
                    }}
                    onDraft={() => void ask("session-note")}
                    onEdit={(text) => {
                      if (conversation.sessionDraft)
                        updateConversation({
                          sessionDraft: { ...conversation.sessionDraft, text },
                        });
                    }}
                    onApprove={approveSessionNote}
                    onSource={(id) => {
                      if (
                        id === `spec:${conversation.id}` ||
                        graphPagesById.has(id)
                      )
                        choose(id);
                      else
                        setNotice(
                          "This source is unavailable in the current conversation.",
                        );
                    }}
                  />
                )}
                <div id="ai-conversation-end" />
              </section>
              {graphVisible && (
                <aside
                  className="thread-graph conversation-graph-panel"
                  aria-label="Connection graph"
                >
                  <header>
                    <strong>Conversation graph</strong>
                    <button
                      type="button"
                      aria-label="Close conversation graph"
                      onClick={() => setGraphVisible(false)}
                    >
                      <X size={16} />
                    </button>
                  </header>
                  <ConversationGraphOutline
                    pages={graphPages}
                    edges={graphEdges}
                    root={compactNoteId}
                    onOpen={choose}
                  />
                  <details className="conversation-canvas">
                    <summary>Canvas view</summary>
                    {ws.pages.some(
                      (p) => !conversation.nodeIds.includes(p.id),
                    ) && (
                      <label className="graph-attach">
                        Add existing node
                        <select
                          aria-label="Add existing node"
                          value=""
                          onChange={(event) => {
                            const id = event.target.value;
                            if (!id) return;
                            updateConversation({
                              nodeIds: [
                                ...new Set([...conversation.nodeIds, id]),
                              ],
                            });
                            choose(id);
                          }}
                        >
                          <option value="">Choose workspace node</option>
                          {ws.pages
                            .filter((p) => !conversation.nodeIds.includes(p.id))
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.title || "Untitled note"}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <div className="flow-wrap">
                      <ReactFlow
                        onInit={(instance) => {
                          flow.current = instance;
                        }}
                        connectionMode={ConnectionMode.Loose}
                        nodes={nodes}
                        edges={graphEdges.map((e) => ({
                          ...e,
                          sourceHandle:
                            (graphPagesById.get(e.source)?.x || 0) >
                            (graphPagesById.get(e.target)?.x || 0)
                              ? "left"
                              : "right",
                          targetHandle:
                            (graphPagesById.get(e.source)?.x || 0) >
                            (graphPagesById.get(e.target)?.x || 0)
                              ? "right"
                              : "left",
                          type: "smoothstep",
                          label: e.relationship
                            ? relationshipLabels[e.relationship]
                            : undefined,
                          style: {
                            stroke:
                              e.source === selected || e.target === selected
                                ? "#7c75bd"
                                : "#cdd2dc",
                            strokeWidth: 1.4,
                          },
                        }))}
                        nodeTypes={nodeTypes}
                        onNodesChange={nodeChanges}
                        onConnect={connect}
                        onNodeClick={(_, n) => choose(n.id)}
                        onEdgesDelete={(edges) =>
                          setWs((w) => ({
                            ...w,
                            edges: w.edges.filter(
                              (e) => !edges.some((d) => d.id === e.id),
                            ),
                          }))
                        }
                        fitView
                        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
                        minZoom={0.25}
                        maxZoom={1.6}
                        deleteKeyCode={["Backspace", "Delete"]}
                        proOptions={{ hideAttribution: true }}
                      >
                        <Background gap={22} size={1} color="#dce0e7" />
                        <Controls
                          showInteractive={false}
                          position="bottom-center"
                          orientation="horizontal"
                        />
                      </ReactFlow>
                      {graphPages.length === 0 && (
                        <div className="graph-empty">
                          <Network size={34} />
                          <h2>Capture your first thought</h2>
                          <button className="primary" onClick={() => newPage()}>
                            Create first page
                          </button>
                        </div>
                      )}
                    </div>
                  </details>
                </aside>
              )}
            </div>
          )}
          {!showHome && conversation.endedAt ? (
            <div className="ended-composer">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  updateConversation({
                    archived: false,
                    endedAt: undefined,
                    involved: true,
                  })
                }
              >
                Reopen conversation
              </button>
            </div>
          ) : (
            <div className="thread-input">
              {showHome && <h1>What would you like to think through?</h1>}
              <form
                className="thread-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!canSubmit) return;
                  if (recordMode) {
                    submitEntry();
                  } else if (showHome) {
                    void ask(undefined, homeQuestion);
                  } else {
                    setPanel("ai");
                    void ask();
                  }
                }}
              >
                <textarea
                  key={showHome ? "home" : conversation.id}
                  ref={composer}
                  aria-label={recordMode ? "Write a note" : "Ask AI"}
                  placeholder={
                    recordMode ? "Write a note…" : "Ask AI a question…"
                  }
                  value={inputText}
                  maxLength={12000}
                  disabled={endingConversation === conversation.id}
                  rows={2}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (showHome) {
                      (recordMode ? setHomeDraft : setHomeQuestion)(value);
                      return;
                    }
                    const target = recordMode ? setDrafts : setQuestions;
                    target((previous) => ({
                      ...previous,
                      [conversation.id]: value,
                    }));
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <div className="composer-actions">
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    multiple
                    accept={acceptedFiles}
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = "";
                      void attachFiles(files);
                    }}
                  />
                  <button
                    type="button"
                    title="Attach a file"
                    aria-label="Attach a file"
                    disabled={attachingFiles || !!endingConversation}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Paperclip size={17} />
                  </button>
                  <button
                    type="button"
                    ref={newPageButton}
                    title="Create a blank page"
                    aria-label="New page"
                    onClick={() => {
                      const target = showHome
                        ? newConversation()
                        : conversation;
                      newPage(
                        undefined,
                        undefined,
                        undefined,
                        "edit",
                        target.id,
                      );
                      requestAnimationFrame(() =>
                        document
                          .getElementById("thread-detail")
                          ?.scrollIntoView({ block: "start" }),
                      );
                    }}
                  >
                    <Plus size={17} />
                  </button>
                  <button
                    type="button"
                    title={isRecording ? "Finish recording" : "Voice input"}
                    aria-label={
                      isRecording ? "Finish recording" : "Voice input"
                    }
                    className={isRecording ? "recording-action" : ""}
                    disabled={dictation.phase !== "idle" && !isRecording}
                    onClick={record}
                  >
                    {isRecording ? <Square size={15} /> : <Mic size={17} />}
                  </button>
                  <button
                    type="button"
                    className="composer-record"
                    aria-pressed={recordMode}
                    disabled={dictation.phase !== "idle"}
                    onClick={() => {
                      setRecordMode(!recordMode);
                      composer.current?.focus();
                    }}
                  >
                    <FileText size={15} />
                    Write a note
                  </button>
                  <span
                    className="composer-status"
                    data-ai-pending={pendingAnswer}
                    role="status"
                  >
                    {isRecording
                      ? `Recording · ${dictation.seconds}s`
                      : dictation.phase === "opening"
                        ? "Connecting to microphone…"
                        : dictation.phase === "transcribing"
                          ? "Transcribing…"
                          : pendingAnswer
                            ? "Generating reply"
                            : saved}
                  </span>
                  <button
                    className="composer-send"
                    type="submit"
                    aria-label={recordMode ? "Add note" : "Send question"}
                    title={recordMode ? "Add note" : "Send question"}
                    disabled={!canSubmit}
                  >
                    {recordMode ? <Plus size={17} /> : <ArrowUp size={17} />}
                  </button>
                </div>
              </form>
              <p className="composer-disclosure">
                {recordMode
                  ? "Your text will be saved as a note."
                  : "Your question, purpose, and sources are sent to the configured AI server."}
              </p>
            </div>
          )}
        </main>
      )}
      {notice && !knowledgeSavedNotice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {cloudOpen && (
        <CloudSettings
          workspaceName={workspaceName}
          cloud={cloud}
          onClose={() => setCloudOpen(false)}
          onBackup={() => void exportWorkspace("json")}
        />
      )}
      {migrationOpen && bridge.previewMigration && (
        <WorkspaceMigration
          workspaceName={workspaceName}
          previewFile={bridge.previewMigration}
          previewNotionLink={bridge.previewNotionLink}
          notionConnected={bridge.notionConnected}
          disconnectNotion={bridge.disconnectNotion}
          shared={!!cloud.link?.revision}
          onClose={() => setMigrationOpen(false)}
          onImport={importMigration}
        />
      )}
      {shortcutsOpen && (
        <ShortcutSettings
          shortcuts={shortcuts}
          onClose={() => setShortcutsOpen(false)}
          onSave={(value) => {
            localStorage.setItem(shortcutStorageKey, JSON.stringify(value));
            setShortcuts(value);
            setShortcutsOpen(false);
          }}
        />
      )}
      {conversationAction && actionConversation && (
        <div className="modal-backdrop">
          <section
            className="modal compact conversation-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversation-action-title"
          >
            <h2 id="conversation-action-title">
              {conversationAction.type === "rename"
                ? "Rename conversation"
                : conversationAction.type === "archive"
                  ? "Archive to knowledge base"
                  : conversationAction.type === "knowledge"
                    ? "Manage saved knowledge"
                    : "Delete this conversation?"}
            </h2>
            {conversationAction.type === "rename" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const input = event.currentTarget.elements.namedItem(
                    "title",
                  ) as HTMLInputElement;
                  const title = input.value.trim();
                  if (!title) {
                    input.setCustomValidity("Enter a title.");
                    input.reportValidity();
                    return;
                  }
                  if (title !== actionConversation.title)
                    updateConversation({ title }, actionConversation.id);
                  setConversationAction(null);
                }}
              >
                <label>
                  Conversation title
                  <input
                    name="title"
                    defaultValue={actionConversation.title}
                    required
                    maxLength={300}
                    onFocus={(event) => event.currentTarget.select()}
                    onInput={(event) =>
                      event.currentTarget.setCustomValidity("")
                    }
                  />
                </label>
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setConversationAction(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary">
                    Save title
                  </button>
                </div>
              </form>
            ) : conversationAction.type === "archive" ||
              conversationAction.type === "knowledge" ? (
              <CompactArchive
                key={actionConversation.id}
                conversation={actionConversation}
                archive={conversationAction.type === "archive"}
                pages={ws.pages}
                initial={
                  textOf(
                    (
                      ws.pages.find(
                        (p) => p.id === actionConversation.compactPageId,
                      )?.html ?? ""
                    ).replace(/<br\s*\/?>/gi, "\n"),
                  ).trim() ||
                  actionConversation.summary?.text ||
                  actionConversation.sessionDraft?.text ||
                  actionConversation.purpose?.statement ||
                  textOf(actionConversation.html) ||
                  actionConversation.title
                }
                selected={
                  actionConversation.nodeIds.includes(selected)
                    ? selected
                    : (actionConversation.nodeIds[0] ?? "")
                }
                onClose={() => setConversationAction(null)}
                onSave={(body, targets) => {
                  const existing = ws.pages.find(
                    (p) => p.id === actionConversation.compactPageId,
                  );
                  const id = existing?.id ?? crypto.randomUUID();
                  const now = new Date().toISOString();
                  const newEdges = targets
                    .filter(
                      (target) =>
                        !ws.edges.some(
                          (e) =>
                            (e.source === target && e.target === id) ||
                            (e.source === id && e.target === target),
                        ),
                    )
                    .map((target) => ({
                      id: crypto.randomUUID(),
                      source: target,
                      target: id,
                      relationship: "relates" as const,
                    }));
                  if (
                    (!existing && ws.pages.length >= 5000) ||
                    ws.edges.length + newEdges.length > 25000
                  ) {
                    setNotice("Workspace graph limit reached.");
                    return;
                  }
                  const parent = ws.pages.find((p) => p.id === targets[0]);
                  const note: Page = {
                    id,
                    title:
                      existing?.title ||
                      actionConversation.title ||
                      "Compact knowledge",
                    kind: "note",
                    x: existing?.x ?? (parent?.x ?? 0) + 280,
                    y: existing?.y ?? parent?.y ?? 0,
                    updatedAt: now,
                    html:
                      "<p>" + escapeHtml(body).replace(/\n/g, "<br>") + "</p>",
                  };
                  setWs((w) => ({
                    ...w,
                    pages: existing
                      ? w.pages.map((p) => (p.id === id ? note : p))
                      : [...w.pages, note],
                    edges: [...w.edges, ...newEdges],
                    conversations: w.conversations.map((c) => {
                      const source = c.id === actionConversation.id;
                      if (
                        !source &&
                        !targets.some((t) => c.nodeIds.includes(t))
                      )
                        return c;
                      return {
                        ...c,
                        ...(source && {
                          compactPageId: id,
                          archived:
                            c.archived || conversationAction.type === "archive",
                        }),
                        nodeIds: [
                          ...new Set([
                            ...c.nodeIds,
                            ...(source ? targets : []),
                            id,
                          ]),
                        ],
                        updatedAt: now,
                      };
                    }),
                  }));
                  setConversationAction(null);
                  if (conversationAction.type === "archive") openHome();
                  setNotice("Knowledge note saved.");
                }}
              />
            ) : (
              <>
                <p>
                  “{actionConversation.title || "Untitled conversation"}” and
                  its AI exchanges will be deleted, along with its{" "}
                  {exclusiveConversationPages(ws, actionConversation.id).size}{" "}
                  exclusive notes and their links. Notes used in other
                  conversations will be kept.
                </p>
                <div className="confirm-actions">
                  <button
                    className="secondary"
                    onClick={() => setConversationAction(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="danger"
                    onClick={() => deleteConversation(actionConversation.id)}
                  >
                    Delete conversation
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {workspaceAction && (
        <div className="modal-backdrop">
          <section
            className="modal compact profile-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-action-title"
          >
            <h2 id="workspace-action-title">
              {
                {
                  create: "New workspace",
                  rename: "Rename workspace",
                  switch: "Switch workspace",
                }[workspaceAction]
              }
            </h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void changeWorkspace(
                  String(
                    new FormData(event.currentTarget).get("workspace") ?? "",
                  ),
                );
              }}
            >
              {workspaceAction === "switch" ? (
                <label>
                  Workspace
                  <select
                    name="workspace"
                    defaultValue={workspaceId}
                    disabled={workspaceBusy}
                  >
                    {library.items.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Workspace name
                  <input
                    name="workspace"
                    required
                    maxLength={60}
                    defaultValue={
                      workspaceAction === "rename" ? workspaceName : ""
                    }
                    disabled={workspaceBusy}
                  />
                </label>
              )}
              {workspaceError && <p role="alert">{workspaceError}</p>}
              <div className="confirm-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={workspaceBusy}
                  onClick={() => setWorkspaceAction(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={workspaceBusy}
                >
                  {
                    { create: "Create", rename: "Save", switch: "Open" }[
                      workspaceAction
                    ]
                  }
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {profileOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !profilePhotoBusy)
              setProfileOpen(false);
          }}
        >
          <section
            className="modal profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
          >
            <h2 id="profile-title">My profile</h2>
            <form
              className="profile-form"
              onSubmit={(event) => {
                event.preventDefault();
                const name = profileName.trim();
                if (!name || profilePhotoBusy) return;
                setWs((current) => ({
                  ...current,
                  profile: {
                    name,
                    icon: profileIcon,
                    ...(profilePhoto && { photo: profilePhoto }),
                  },
                }));
                setProfileOpen(false);
              }}
            >
              <label className="profile-name">
                Display name
                <input
                  name="name"
                  maxLength={40}
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  required
                />
              </label>
              <ProfilePhoto
                photo={profilePhoto}
                busy={profilePhotoBusy}
                fallback={
                  <ProfileIcon
                    profile={{
                      name: profileName.trim() || profile.name,
                      icon: profileIcon,
                    }}
                  />
                }
                onChange={setProfilePhoto}
                onLoading={setProfilePhotoBusy}
              />
              <fieldset className="profile-icon-field">
                <legend>Default icon</legend>
                {profilePhoto && <p>Shown when you have no profile photo.</p>}
                <div className="profile-icon-options">
                  {(
                    Object.keys(profileIconLabels) as WorkspaceProfile["icon"][]
                  ).map((icon) => (
                    <label key={icon}>
                      <input
                        type="radio"
                        name="icon"
                        value={icon}
                        checked={icon === profileIcon}
                        onChange={() => setProfileIcon(icon)}
                      />
                      <span className="profile-icon-choice">
                        <span className="profile-icon-glyph" aria-hidden="true">
                          <ProfileIcon
                            profile={{
                              name: profileName.trim() || profile.name,
                              icon,
                            }}
                          />
                        </span>
                        {profileIconLabels[icon]}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="confirm-actions profile-footer">
                <button
                  type="button"
                  className="secondary"
                  disabled={profilePhotoBusy}
                  onClick={() => setProfileOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={!profileName.trim() || profilePhotoBusy}
                >
                  Save
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {settingsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <section
            className="modal provider-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="modal-header">
              <span className="brand-mark">
                <Settings2 size={23} />
              </span>
              <button
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <h2 id="settings-title">
              {settingsOpen === "voice"
                ? "Speech-to-text and microphone"
                : "AI connection"}
            </h2>
            {settingsOpen === "ai" && (
              <div
                className="connection-tabs"
                role="group"
                aria-label="Connection settings"
              >
                <button
                  type="button"
                  aria-pressed={connectionTab === "model"}
                  onClick={() => setConnectionTab("model")}
                >
                  AI model
                </button>
                <button
                  type="button"
                  aria-pressed={connectionTab === "speech"}
                  onClick={() => setConnectionTab("speech")}
                >
                  Speech (STT)
                </button>
                <button
                  type="button"
                  aria-pressed={connectionTab === "compact"}
                  onClick={() => setConnectionTab("compact")}
                >
                  Compaction
                </button>
                <button
                  type="button"
                  aria-pressed={connectionTab === "mcp"}
                  onClick={() => setConnectionTab("mcp")}
                >
                  Tools & MCP
                </button>
                <button
                  type="button"
                  aria-pressed={connectionTab === "search"}
                  onClick={() => setConnectionTab("search")}
                >
                  Embeddings & index
                </button>
              </div>
            )}
            {settingsOpen === "ai" &&
            connectionTab === "compact" &&
            settings ? (
              <CompactModelSettings
                settings={settings}
                onSave={(value) => {
                  setSettings(value);
                  setSettingsOpen(false);
                  setNotice("Compaction model saved.");
                }}
              />
            ) : settingsOpen === "ai" && connectionTab === "search" ? (
              <SearchSettings
                workspace={ws}
                workspaceId={workspaceId}
                onOpen={(id) => {
                  setSettingsOpen(false);
                  choose(id);
                }}
              />
            ) : settingsOpen === "ai" && connectionTab === "mcp" ? (
              <McpSettings
                onUse={(text) => {
                  setRecordMode(false);
                  if (showHome)
                    setHomeQuestion((previous) =>
                      (previous + "\n\n" + text).trim().slice(0, 12000),
                    );
                  else
                    setQuestions((previous) => ({
                      ...previous,
                      [conversation.id]: (
                        (previous[conversation.id] ?? "") +
                        "\n\n" +
                        text
                      )
                        .trim()
                        .slice(0, 12000),
                    }));
                  setSettingsOpen(false);
                  setNotice("Tool result added to your draft.");
                  requestAnimationFrame(() => composer.current?.focus());
                }}
              />
            ) : (
              settings && (
                <AiSettings
                  key={settingsOpen + "-" + connectionTab}
                  onCredentialsChanged={setSettings}
                  settings={settings}
                  openVoice={
                    settingsOpen === "voice" || connectionTab === "speech"
                  }
                  microphoneId={microphoneId}
                  onMicrophoneChange={(id) => {
                    setMicrophoneId(id);
                    localStorage.setItem("wallace.microphone", id);
                  }}
                  onSave={(value) => {
                    setSettings(value);
                    setSettingsOpen(false);
                    setNotice("AI connection settings saved.");
                  }}
                />
              )
            )}
          </section>
        </div>
      )}
      {deleteOpen && page && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">Delete this page?</h2>
            <p>
              “{page.title}” and its connections will be deleted. This cannot be
              undone.
            </p>
            <div className="confirm-actions">
              <button
                className="secondary"
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                className="danger"
                onClick={() => {
                  setWs((w) => ({
                    ...w,
                    conversations: w.conversations.map((c) => ({
                      ...c,
                      nodeIds: c.nodeIds.filter((id) => id !== selected),
                      favoriteNodeIds: c.favoriteNodeIds.filter(
                        (id) => id !== selected,
                      ),
                      positions:
                        c.positions &&
                        Object.fromEntries(
                          Object.entries(c.positions).filter(
                            ([id]) => id !== selected,
                          ),
                        ),
                      project:
                        c.project?.pageId === selected ? undefined : c.project,
                    })),
                    pages: w.pages.filter((p) => p.id !== selected),
                    edges: w.edges.filter(
                      (e) => e.source !== selected && e.target !== selected,
                    ),
                  }));
                  setSelected(
                    graphPages.find((p) => p.id !== selected)?.id || "",
                  );
                  setDeleteOpen(false);
                }}
              >
                Delete page
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
