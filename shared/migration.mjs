import { validateWorkspace } from "./workspace.mjs";

export function appendMigration(workspace, imported, conversationIds) {
  const chosen = new Set(conversationIds);
  const conversations = imported.conversations.filter(({ id }) =>
    chosen.has(id),
  );
  const wanted = new Set(conversations.flatMap(({ nodeIds }) => nodeIds));
  const pageIds = new Set(workspace.pages.map(({ id }) => id));
  const pages = imported.pages.filter(
    ({ id }) => wanted.has(id) && !pageIds.has(id),
  );
  const newPageIds = new Set(pages.map(({ id }) => id));
  const edgeIds = new Set(workspace.edges.map(({ id }) => id));
  const edges = imported.edges.filter(
    ({ id, source, target }) =>
      !edgeIds.has(id) &&
      (wanted.has(source) || wanted.has(target)) &&
      (pageIds.has(source) || newPageIds.has(source)) &&
      (pageIds.has(target) || newPageIds.has(target)),
  );
  const byConversation = new Map(
    workspace.conversations.map((item) => [item.id, item]),
  );
  const added = [];
  for (const incoming of conversations) {
    const existing = byConversation.get(incoming.id);
    if (!existing) {
      const items = incoming.nodeIds.filter((id) => newPageIds.has(id));
      if (!items.length) continue;
      byConversation.set(incoming.id, { ...incoming, nodeIds: items });
      added.push(incoming.id);
      continue;
    }
    const existingIds = new Set(existing.nodeIds);
    const extra = incoming.nodeIds.filter(
      (id) => !existingIds.has(id) && newPageIds.has(id),
    );
    if (!extra.length) continue;
    byConversation.set(incoming.id, {
      ...existing,
      nodeIds: [...existing.nodeIds, ...extra],
      updatedAt: new Date().toISOString(),
    });
    added.push(incoming.id);
  }
  if (pages.length === 0 && edges.length === 0)
    return { workspace, pages: 0, edges: 0, conversations: [] };
  return {
    workspace: validateWorkspace({
      ...workspace,
      pages: [...workspace.pages, ...pages],
      edges: [...workspace.edges, ...edges],
      conversations: [...byConversation.values()],
    }),
    pages: pages.length,
    edges: edges.length,
    conversations: added,
  };
}
