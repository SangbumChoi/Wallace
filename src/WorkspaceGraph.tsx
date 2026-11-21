import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Position,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  ArrowLeft,
  FileText,
  Link2,
  Network,
  PanelLeft,
  Search,
} from "lucide-react";
import { relationshipLabels } from "./workspace";
import type { Kind, Workspace } from "./types";

const kindNames: Record<Kind, string> = {
  note: "Note",
  project: "Project",
  meeting: "Meeting notes",
  resource: "Resource",
};
const kindColors: Record<Kind, string> = {
  note: "#398e7e",
  project: "#7565b2",
  meeting: "#a66c37",
  resource: "#5082b6",
};

export default function WorkspaceGraph({
  workspaceName,
  workspace,
  onBack,
  onMenu,
  onOpen,
}: {
  workspaceName: string;
  workspace: Workspace;
  onBack: () => void;
  onMenu: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [selected, setSelected] = useState("");
  const [neighborsOnly, setNeighborsOnly] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance<Node, Edge> | null>(null);
  const [compact, setCompact] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const { pages, edges } = workspace;
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setCompact(entry.contentRect.width < 560);
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  const byId = useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  );
  const links = useMemo(
    () =>
      edges.filter(
        (edge) => edge.source === selected || edge.target === selected,
      ),
    [edges, selected],
  );
  const neighbors = useMemo(
    () =>
      new Set(
        links.map((edge) =>
          edge.source === selected ? edge.target : edge.source,
        ),
      ),
    [links, selected],
  );
  const page = byId.get(selected);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return pages.filter((item) => {
      if (
        neighborsOnly &&
        selected &&
        item.id !== selected &&
        !neighbors.has(item.id)
      )
        return false;
      return (
        (kind === "all" || kind === item.kind) &&
        (!term ||
          (item.title + " " + item.html.replace(/<[^>]*>/g, " "))
            .toLowerCase()
            .includes(term))
      );
    });
  }, [pages, query, kind, selected, neighbors, neighborsOnly]);

  const topology = useMemo(() => {
    const ids = new Set(visible.map((item) => item.id));
    const connected = edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    );
    const adjacency = new Map(
      visible.map((item) => [item.id, new Set<string>()]),
    );
    for (const edge of connected) {
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
    }
    const remaining = new Set(visible.map((item) => item.id));
    const grouped: string[][] = [];
    for (const item of visible) {
      if (!remaining.delete(item.id)) continue;
      const group = [item.id];
      for (const id of group)
        for (const linked of adjacency.get(id) ?? []) {
          if (remaining.delete(linked)) group.push(linked);
        }
      grouped.push(group);
    }
    const isolated = grouped.filter((group) => group.length === 1).flat();
    const components = grouped.filter((group) => group.length > 1);
    if (isolated.length) components.push(isolated);
    let offset = 0;
    const positions = new Map<string, { x: number; y: number }>();
    // Breadth-first layers keep cycles finite and disconnected groups separate.
    for (const group of components) {
      const members = new Set(group);
      const incoming = new Set(connected.filter(edge => members.has(edge.target)).map(edge => edge.target));
      const root = group.find(id => !incoming.has(id)) ?? group[0];
      const depths = new Map<string, number>([[root, 0]]);
      const queue = [root];
      for (const id of queue) {
        for (const linked of adjacency.get(id) ?? []) {
          if (!depths.has(linked)) {
            depths.set(linked, (depths.get(id) ?? 0) + 1);
            queue.push(linked);
          }
        }
      }
      const rows = new Map<number, string[]>();
      for (const id of group) {
        const depth = depths.get(id) ?? 0;
        rows.set(depth, [...(rows.get(depth) ?? []), id]);
      }
      let rowY = offset;
      for (const [, row] of [...rows].sort(([a], [b]) => a - b)) {
        const columns = compact ? 1 : Math.min(5, row.length);
        row.forEach((id, index) => positions.set(id, {
          x: ((index % columns) - (columns - 1) / 2) * 308,
          y: rowY + Math.floor(index / columns) * 210,
        }));
        rowY += Math.ceil(row.length / columns) * 210;
      }
      offset = rowY + 70;
    }
    return { positions, connected };
  }, [visible, edges, compact]);

  const nodes: Node[] = visible.map((item) => ({
    id: item.id,
    position: topology.positions.get(item.id)!,
    data: {
      label: (
        <div className="knowledge-card">
          <div className="knowledge-card-type"><FileText size={14} />{kindNames[item.kind]}</div>
          <strong title={item.title}>{item.title || "Untitled note"}</strong>
          <p>{new DOMParser().parseFromString(item.html, "text/html").body.textContent?.replace(/\s+/g, " ").trim().slice(0, 160) || "No content yet"}</p>
          <footer><Link2 size={12} />{edges.filter(edge => edge.source === item.id || edge.target === item.id).length} connections</footer>
        </div>
      ),
    },
    className: "knowledge-node",
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    style: {
      "--note-color": kindColors[item.kind],
      opacity:
        selected &&
        byId.has(selected) &&
        selected !== item.id &&
        !neighbors.has(item.id)
          ? 0.42
          : 1,
    } as React.CSSProperties,
    selected: item.id === selected,
    ariaLabel: item.title || "Untitled note",
    draggable: false,
  }));
  const graphEdges: Edge[] = topology.connected.map((edge) => ({
    ...edge,
    type: "smoothstep",
    style: {
      stroke:
        selected && (edge.source === selected || edge.target === selected)
          ? "#78a9d9"
          : "#d5dae0",
      strokeWidth: 1.7,
    },
    label:
      selected &&
      (edge.source === selected || edge.target === selected) &&
      edge.relationship
        ? relationshipLabels[edge.relationship]
        : undefined,
  }));
  useEffect(() => {
    if (!flow || !visible.length) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.22, maxZoom: 1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [flow, visible.length, query, kind, neighborsOnly, compact]);

  return (
    <main className="main knowledge-graph">
      <header className="knowledge-heading">
        <button
          className="open-sidebar"
          aria-label="Open conversation list"
          onClick={onMenu}
        >
          <PanelLeft size={18} />
        </button>
        <button aria-label="Close graph" onClick={onBack}>
          <ArrowLeft size={17} />
        </button>
        <h1>Workspace graph</h1>
        <p className="workspace-surface-name">{workspaceName}</p>
        <span>
          {pages.length} {pages.length === 1 ? "note" : "notes"} ·{" "}
          {edges.length} {edges.length === 1 ? "connection" : "connections"}
        </span>
      </header>
      <div className="knowledge-tools">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search graph notes"
            placeholder="Search note titles or contents"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Graph note type"
          value={kind}
          onChange={(event) => setKind(event.target.value as Kind | "all")}
        >
          <option value="all">All types</option>
          {Object.entries(kindNames).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
        {page && (
          <button
            className="secondary"
            aria-pressed={neighborsOnly}
            onClick={() => {
              setNeighborsOnly(!neighborsOnly);
              setKind("all");
              setQuery("");
            }}
          >
            Connected notes only
          </button>
        )}
      </div>
      <div className="knowledge-canvas" ref={canvas}>
        {nodes.length ? (
          <ReactFlow
            nodes={nodes}
            edges={graphEdges}
            onInit={setFlow}
            nodesConnectable={false}
            nodesDraggable={false}
            deleteKeyCode={null}
            onPaneClick={() => { setSelected(""); setNeighborsOnly(false); }}
            onNodeClick={(_, node) => setSelected(node.id)}
            onNodeDoubleClick={(_, node) => onOpen(node.id)}
            minZoom={0.04}
            maxZoom={1.8}
            fitView
            fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
            onlyRenderVisibleElements={pages.length > 150}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} size={1} color="#d8dce1" />
            <Controls showInteractive={false} position="bottom-center" orientation="horizontal" />
          </ReactFlow>
        ) : (
          <div className="knowledge-empty">
            <Network size={26} />
            <p>
              {pages.length
                ? "No matching notes."
                : "Add a note to see it in the graph."}
            </p>
          </div>
        )}
      </div>
      {page && (
        <section
          className="knowledge-selection"
          aria-label="Connections to the selected note"
        >
          <div>
            <FileText size={17} />
            <strong>{page.title || "Untitled note"}</strong>
            <button className="primary" onClick={() => onOpen(page.id)}>
              Open note
            </button>
          </div>
          {links.length > 0 && (
            <ul>
              {links.map((edge) => {
                const other = byId.get(
                  edge.source === selected ? edge.target : edge.source,
                );
                if (!other) return null;
                return (
                  <li key={edge.id}>
                    <button
                      onClick={() => {
                        setSelected(other.id);
                        setQuery("");
                        setKind("all");
                      }}
                    >
                      <Link2 size={13} />
                      {other.title || "Untitled note"}
                      <small>
                        {edge.relationship
                          ? relationshipLabels[edge.relationship]
                          : edge.target === selected
                            ? "References this note"
                            : "Connected notes"}
                      </small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
