import { FileText } from "lucide-react";
import { useState } from "react";
import type { Edge, Page } from "./types";

export default function ConversationGraphOutline({
  pages,
  edges,
  root,
  onOpen,
}: {
  pages: Page[];
  edges: Edge[];
  root?: string;
  onOpen: (id: string) => void;
}) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const neighbors = new Map<string, string[]>();
  for (const { source, target } of edges) {
    if (!byId.has(source) || !byId.has(target)) continue;
    neighbors.set(source, [...(neighbors.get(source) ?? []), target]);
    neighbors.set(target, [...(neighbors.get(target) ?? []), source]);
  }
  const visited = new Set<string>();
  const forest: Branch[] = [];
  for (const id of [...(root ? [root] : []), ...byId.keys()]) {
    const stack = [{ id, siblings: forest }];
    while (stack.length) {
      const entry = stack.pop()!;
      const page = byId.get(entry.id);
      if (!page || visited.has(entry.id)) continue;
      visited.add(entry.id);
      const node: Branch = { page, children: [] };
      entry.siblings.push(node);
      for (const child of [...(neighbors.get(entry.id) ?? [])].reverse())
        stack.push({ id: child, siblings: node.children });
    }
  }
  return (
    <div className="conversation-graph-outline">
      {forest.length ? (
        <OutlineList branches={forest} depth={0} root={root} onOpen={onOpen} />
      ) : (
        <p>Nodes appear here when you end a conversation.</p>
      )}
    </div>
  );
}

type Branch = { page: Page; children: Branch[] };
type OutlineProps = {
  depth: number;
  root?: string;
  onOpen: (id: string) => void;
};

function OutlineList({
  branches,
  ...props
}: OutlineProps & { branches: Branch[] }) {
  return (
    <ul className={props.depth > 6 ? "outline-deep" : undefined}>
      {branches.map((branch) => (
        <OutlineItem key={branch.page.id} branch={branch} {...props} />
      ))}
    </ul>
  );
}

function OutlineItem({
  branch: { page, children },
  depth,
  root,
  onOpen,
}: OutlineProps & { branch: Branch }) {
  const [expanded, setExpanded] = useState(page.id === root);
  return (
    <li>
      {children.length > 0 ? (
        <details
          open={expanded}
          onToggle={(event) => setExpanded(event.currentTarget.open)}
        >
          <summary>
            {page.title || "Untitled node"} <small>{children.length}</small>
          </summary>
          <button type="button" onClick={() => onOpen(page.id)}>
            Open note
          </button>
          {expanded && (
            <OutlineList
              branches={children}
              depth={depth + 1}
              root={root}
              onOpen={onOpen}
            />
          )}
        </details>
      ) : (
        <button type="button" onClick={() => onOpen(page.id)}>
          <FileText size={14} />
          {page.title || "Untitled node"}
        </button>
      )}
    </li>
  );
}
