export function aiRuntime(model, harnessVersion) {
  if (
    typeof model !== "string" ||
    !model.trim() ||
    model.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(model) ||
    typeof harnessVersion !== "string" ||
    !/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(harnessVersion) ||
    harnessVersion.length > 50
  )
    return undefined;
  return { model: model.trim(), harnessVersion };
}

function validateWorkspace(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.pages) ||
    !Array.isArray(value.edges) ||
    value.pages.length > 5000 ||
    value.edges.length > 25000
  )
    throw new Error("This workspace file is not supported.");
  const ids = new Set();
  let attachmentCharacters = 0;
  for (const p of value.pages) {
    if (
      !p ||
      typeof p.id !== "string" ||
      ids.has(p.id) ||
      typeof p.title !== "string" ||
      p.title.length > 300 ||
      typeof p.html !== "string" ||
      p.html.length > 1000000 ||
      !["note", "project", "meeting", "resource"].includes(p.kind) ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      typeof p.updatedAt !== "string"
    )
      throw new Error("Invalid page data.");
    if (p.attachment !== undefined) {
      const { name, data } = p.attachment ?? {};
      if (
        typeof name !== "string" ||
        !name ||
        name.length > 180 ||
        typeof data !== "string" ||
        data.length > 699052 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(data) ||
        data.length % 4 !== 0
      )
        throw new Error("Invalid conversation file.");
      attachmentCharacters += data.length;
      if (attachmentCharacters > 4_000_000)
        throw new Error("Workspace files exceed the storage limit.");
    }
    ids.add(p.id);
  }
  const edgeIds = new Set();
  for (const e of value.edges) {
    if (
      !e ||
      typeof e.id !== "string" ||
      edgeIds.has(e.id) ||
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      e.source === e.target ||
      (e.relationship !== undefined &&
        !["relates", "addresses", "supports"].includes(e.relationship))
    )
      throw new Error("Invalid connection data.");
    edgeIds.add(e.id);
  }
  const conversations =
    value.conversations === undefined
      ? [
          {
            id: "conversation-imported",
            title: "Previous Workspace",
            html: "<h2>Conversation spec</h2><p>Capture the context, decisions, and open questions here.</p>",
            nodeIds: [...ids],
            favorite: true,
            involved: true,
            updatedAt: new Date().toISOString(),
          },
        ]
      : value.conversations;
  if (!Array.isArray(conversations) || conversations.length > 1000)
    throw new Error("Invalid conversation graph data.");
  const conversationIds = new Set();
  for (const c of conversations) {
    if (
      !c ||
      typeof c.id !== "string" ||
      conversationIds.has(c.id) ||
      typeof c.title !== "string" ||
      c.title.length > 300 ||
      typeof c.html !== "string" ||
      c.html.length > 1000000 ||
      typeof c.favorite !== "boolean" ||
      typeof c.involved !== "boolean" ||
      typeof c.updatedAt !== "string" ||
      !Array.isArray(c.nodeIds) ||
      c.nodeIds.length > 5000 ||
      new Set(c.nodeIds).size !== c.nodeIds.length ||
      c.nodeIds.some((id) => !ids.has(id))
    )
      throw new Error("Invalid conversation graph data.");
    if (
      c.favoriteNodeIds !== undefined &&
      (!Array.isArray(c.favoriteNodeIds) ||
        new Set(c.favoriteNodeIds).size !== c.favoriteNodeIds.length ||
        c.favoriteNodeIds.some((id) => !c.nodeIds.includes(id)))
    )
      throw new Error("Invalid starred node data.");
    if (
      c.aiTurns !== undefined &&
      (!Array.isArray(c.aiTurns) ||
        c.aiTurns.length > 300 ||
        c.aiTurns.some(
          (turn, index) =>
            !turn ||
            (turn.author !== undefined &&
              (typeof turn.author !== "string" || turn.author.length > 40)) ||
            typeof turn.question !== "string" ||
            turn.question.length > 12000 ||
            typeof turn.answer !== "string" ||
            turn.answer.length > 16000 ||
            typeof turn.time !== "string" ||
            !Number.isFinite(Date.parse(turn.time)) ||
            (turn.intent !== undefined &&
              (!turn.intent ||
                ![
                  "clarify",
                  "constraint",
                  "direction",
                  "evidence",
                  "decision",
                ].includes(turn.intent.kind) ||
                (turn.intent.previous !== undefined &&
                  (!Number.isInteger(turn.intent.previous) ||
                    turn.intent.previous < 0 ||
                    turn.intent.previous >= index)))) ||
            (turn.sources !== undefined &&
              (!Array.isArray(turn.sources) ||
                turn.sources.length > 8 ||
                turn.sources.some(
                  (source) =>
                    !source ||
                    typeof source.id !== "string" ||
                    typeof source.title !== "string" ||
                    source.title.length > 300,
                ))),
        ))
    )
      throw new Error("Invalid AI conversation history.");
    const draft = c.sessionDraft;
    if (
      draft !== undefined &&
      (!draft ||
        typeof draft.text !== "string" ||
        draft.text.length > 16000 ||
        !Number.isInteger(draft.turnCount) ||
        draft.turnCount < 1 ||
        draft.turnCount > (c.aiTurns?.length ?? 0))
    )
      throw new Error("Invalid session note draft.");
    const { purpose, summary, project, positions } = c;
    if (
      purpose !== undefined &&
      (!purpose ||
        !["question", "decision", "problem"].includes(purpose.kind) ||
        typeof purpose.statement !== "string" ||
        !purpose.statement.trim() ||
        purpose.statement.length > 12000 ||
        (purpose.completedAt !== undefined && !validDate(purpose.completedAt)))
    )
      throw new Error("Invalid conversation purpose.");
    if (
      summary !== undefined &&
      (!summary ||
        typeof summary.text !== "string" ||
        !summary.text.trim() ||
        summary.text.length > 16000 ||
        !Number.isInteger(summary.turnCount) ||
        summary.turnCount < 1 ||
        summary.turnCount > (c.aiTurns?.length ?? 0) ||
        (summary.purpose !== undefined &&
          (typeof summary.purpose !== "string" ||
            summary.purpose.length > 12020)) ||
        !validDate(summary.reviewedAt))
    )
      throw new Error("Invalid conversation summary.");
    if (
      project !== undefined &&
      (!project ||
        !c.nodeIds.includes(project.pageId) ||
        !Array.isArray(project.steps) ||
        project.steps.length > 200 ||
        project.steps.some(
          (step) =>
            !step ||
            typeof step.id !== "string" ||
            typeof step.title !== "string" ||
            step.title.length > 300 ||
            typeof step.done !== "boolean",
        ) ||
        new Set(project.steps.map((step) => step.id)).size !==
          project.steps.length)
    )
      throw new Error("Invalid project steps.");
    if (
      positions !== undefined &&
      (!positions ||
        typeof positions !== "object" ||
        Array.isArray(positions) ||
        Object.entries(positions).some(
          ([id, position]) =>
            !c.nodeIds.includes(id) ||
            !position ||
            !Number.isFinite(position.x) ||
            !Number.isFinite(position.y),
        ))
    )
      throw new Error("Invalid graph positions.");
    conversationIds.add(c.id);
  }
  const profile = value.profile;
  if (
    profile !== undefined &&
    (!profile ||
      typeof profile.name !== "string" ||
      !profile.name.trim() ||
      profile.name.length > 40 ||
      !["initial", "star", "sparkles", "book"].includes(profile.icon) ||
      (profile.photo !== undefined &&
        (typeof profile.photo !== "string" ||
          profile.photo.length > 150_000 ||
          !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(
            profile.photo,
          ))))
  )
    throw new Error("Invalid profile information.");
  return {
    version: 1,
    ...(profile && {
      profile: {
        name: profile.name,
        icon: profile.icon,
        ...(profile.photo && { photo: profile.photo }),
      },
    }),
    conversations: conversations.map(
      ({
        id,
        title,
        html,
        nodeIds,
        favorite,
        favoriteNodeIds,
        archived,
        endedAt,
        compactPageId,
        aiTurns,
        sessionDraft,
        purpose,
        summary,
        project,
        positions,
        involved,
        updatedAt,
      }) => ({
        id,
        title,
        html,
        nodeIds,
        favorite,
        favoriteNodeIds: favoriteNodeIds || [],
        ...(nodeIds.includes(compactPageId) && { compactPageId }),
        ...(archived === true && { archived: true }),
        ...(validDate(endedAt) && { endedAt }),
        ...(aiTurns && {
          aiTurns: aiTurns.map(
            ({ author, question, answer, time, sources, intent, runtime }) => {
              const info = aiRuntime(runtime?.model, runtime?.harnessVersion);
              return {
                ...(author && { author }),
                question,
                answer,
                time,
                ...(intent && {
                  intent: {
                    kind: intent.kind,
                    ...(intent.previous !== undefined && {
                      previous: intent.previous,
                    }),
                  },
                }),
                ...(sources && {
                  sources: sources.map(({ id, title }) => ({ id, title })),
                }),
                ...(info && { runtime: info }),
              };
            },
          ),
        }),
        ...(sessionDraft && {
          sessionDraft: {
            text: sessionDraft.text,
            turnCount: sessionDraft.turnCount,
          },
        }),
        ...(purpose && {
          purpose: {
            kind: purpose.kind,
            statement: purpose.statement,
            ...(purpose.completedAt && { completedAt: purpose.completedAt }),
          },
        }),
        ...(summary && {
          summary: {
            text: summary.text,
            turnCount: summary.turnCount,
            reviewedAt: summary.reviewedAt,
            ...(summary.purpose && { purpose: summary.purpose }),
          },
        }),
        ...(project && {
          project: {
            pageId: project.pageId,
            steps: project.steps.map(({ id, title, done }) => ({
              id,
              title,
              done,
            })),
          },
        }),
        ...(positions && {
          positions: Object.fromEntries(
            Object.entries(positions).map(([id, { x, y }]) => [id, { x, y }]),
          ),
        }),
        involved,
        updatedAt,
      }),
    ),
    pages: value.pages.map(
      ({ id, title, html, kind, x, y, updatedAt, attachment }) => ({
        ...(attachment && {
          attachment: { name: attachment.name, data: attachment.data },
        }),
        id,
        title,
        html,
        kind,
        x,
        y,
        updatedAt,
      }),
    ),
    edges: value.edges.map(({ id, source, target, relationship }) => ({
      id,
      source,
      target,
      ...(relationship && { relationship }),
    })),
  };
}
function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function exclusiveConversationPages(workspace, conversationId) {
  const conversation = workspace.conversations.find(
    ({ id }) => id === conversationId,
  );
  const retained = new Set(
    workspace.conversations
      .filter(({ id }) => id !== conversationId)
      .flatMap(({ nodeIds }) => nodeIds),
  );
  if (conversation?.endedAt && conversation.compactPageId) {
    const compact = conversation.compactPageId;
    retained.add(compact);
    const attached = new Set(
      workspace.pages.filter((page) => page.attachment).map((page) => page.id),
    );
    for (const { source, target } of workspace.edges) {
      if (source === compact && attached.has(target)) retained.add(target);
      if (target === compact && attached.has(source)) retained.add(source);
    }
  }
  return new Set(conversation?.nodeIds.filter((id) => !retained.has(id)));
}
function removeConversation(workspace, conversationId) {
  const removed = exclusiveConversationPages(workspace, conversationId);
  return {
    ...workspace,
    conversations: workspace.conversations.filter(
      ({ id }) => id !== conversationId,
    ),
    pages: workspace.pages.filter(({ id }) => !removed.has(id)),
    edges: workspace.edges.filter(
      ({ source, target }) => !removed.has(source) && !removed.has(target),
    ),
  };
}
function endpoint(base) {
  const u = new URL(base);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !(
      u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
    )
  )
    throw new Error("Enter an HTTPS URL or a local server address.");
  return u.href.replace(/\/$/, "");
}
function contextFor(workspace, selectedId, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const related = new Set(
    workspace.edges
      .filter((e) => e.source === selectedId || e.target === selectedId)
      .flatMap((e) => [e.source, e.target]),
  );
  return workspace.pages
    .map((p) => ({
      ...p,
      text: p.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "),
    }))
    .map((p) => ({
      ...p,
      score:
        (p.id === selectedId ? 100 : 0) +
        (related.has(p.id) ? 10 : 0) +
        words.reduce(
          (n, w) =>
            n + (p.title + " " + p.text).toLowerCase().split(w).length - 1,
          0,
        ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((p) => ({ id: p.id, title: p.title, text: p.text.slice(0, 6000) }));
}
export {
  validateWorkspace,
  endpoint,
  contextFor,
  exclusiveConversationPages,
  removeConversation,
};
