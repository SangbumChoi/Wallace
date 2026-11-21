export type ConversationAction = "rename" | "delete" | "model";
export type Shortcuts = Record<ConversationAction, string>;

export const defaultShortcuts: Shortcuts = {
  rename: "R",
  delete: "D",
  model: "Shift+M",
};
export const shortcutLabels: Record<ConversationAction, string> = {
  model: "Change AI model",
  rename: "Rename conversation",
  delete: "Delete conversation",
};
export const shortcutStorageKey = "wallace.shortcuts";
const mac = /^Mac/.test(navigator.platform);
const reserved = new Set([
  "A",
  "C",
  "F",
  "H",
  "M",
  "N",
  "P",
  "Q",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "Shift+H",
  "Shift+N",
  "Shift+Q",
  "Shift+V",
  "Shift+W",
  "Shift+Z",
]);

function allowed(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:Shift\+)?[A-Z]$/.test(value) &&
    !reserved.has(value)
  );
}

export function readShortcuts(): Shortcuts {
  try {
    const saved = JSON.parse(localStorage.getItem(shortcutStorageKey) || "{}");
    if (
      allowed(saved?.rename) &&
      allowed(saved?.delete) &&
      saved.rename !== saved.delete
    )
      return {
        rename: saved.rename,
        delete: saved.delete,
        model:
          allowed(saved.model) &&
          ![saved.rename, saved.delete].includes(saved.model)
            ? saved.model
            : ["Shift+M", "Shift+K", "Shift+J"].find(
                (key) => ![saved.rename, saved.delete].includes(key),
              )!,
      };
  } catch {}
  return defaultShortcuts;
}

export function shortcutFromEvent(event: KeyboardEvent) {
  if (
    event.isComposing ||
    event.repeat ||
    event.altKey ||
    (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey)
  )
    return;
  const letter = /^[a-z]$/i.test(event.key)
    ? event.key.toUpperCase()
    : /^Key[A-Z]$/.test(event.code)
      ? event.code.slice(3)
      : undefined;
  return letter && (event.shiftKey ? "Shift+" + letter : letter);
}

export function shortcutText(value: string) {
  if (!mac) return "Ctrl+" + value;
  return value.startsWith("Shift+") ? "⇧⌘" + value.slice(6) : "⌘" + value;
}

export function shortcutAria(value: string) {
  return (mac ? "Meta+" : "Control+") + value;
}

export const primaryKeyLabel = mac ? "⌘" : "Ctrl";

export function shortcutIssue(
  value: string,
  shortcuts: Shortcuts,
  action: ConversationAction,
) {
  if (!allowed(value))
    return "This shortcut is reserved for editing or app controls.";
  const other = (Object.keys(shortcuts) as ConversationAction[]).find(
    (key) => key !== action && shortcuts[key] === value,
  );
  if (other) return `${shortcutLabels[other]} already uses this shortcut.`;
}
