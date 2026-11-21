import { validateWorkspace } from "./workspace.mjs";

export function cloudEndpoint(input) {
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Check the shared server URL.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(url.protocol === "https:" || (loopback && url.protocol === "http:"))
  )
    throw new Error("Enter the shared server’s HTTPS URL.");
  return url.href.replace(/\/$/, "");
}

export function sharedWorkspace(workspace) {
  const { profile, ...shared } = validateWorkspace(workspace);
  return shared;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function mergeWorkspaces(base, local, remote) {
  const conflicts = [];
  function mergeValue(previous, ours, theirs, label) {
    if (same(ours, theirs) || same(theirs, previous)) return ours;
    if (same(ours, previous)) return theirs;
    conflicts.push(label);
    return ours;
  }
  function mergeCollection(name, label) {
    const originals = new Map(base[name].map((item) => [item.id, item]));
    const ours = new Map(local[name].map((item) => [item.id, item]));
    const theirs = new Map(remote[name].map((item) => [item.id, item]));
    const ids = new Set([...theirs.keys(), ...ours.keys()]);
    return [...ids].flatMap((id) => {
      const original = originals.get(id);
      const left = ours.get(id);
      const right = theirs.get(id);
      const title = (
        left?.title ||
        right?.title ||
        original?.title ||
        id
      ).slice(0, 150);
      const conflict = label + " · " + title;
      if (!original || !left || !right) {
        const item = mergeValue(original, left, right, conflict);
        return item ? [item] : [];
      }
      const keys = new Set([
        ...Object.keys(original),
        ...Object.keys(left),
        ...Object.keys(right),
      ]);
      return [
        Object.fromEntries(
          [...keys].map((key) => {
            if (key === "updatedAt")
              return [key, [left[key], right[key]].sort().at(-1)];
            return [
              key,
              mergeValue(original[key], left[key], right[key], conflict),
            ];
          }),
        ),
      ];
    });
  }
  const candidate = {
    version: 1,
    pages: mergeCollection("pages", "Note"),
    edges: mergeCollection("edges", "Connection"),
    conversations: mergeCollection("conversations", "Conversation"),
  };
  if (conflicts.length) return { conflicts: [...new Set(conflicts)] };
  try {
    return { workspace: sharedWorkspace(candidate), conflicts: [] };
  } catch {
    return {
      conflicts: ["Review notes and connections edited at the same time."],
    };
  }
}
