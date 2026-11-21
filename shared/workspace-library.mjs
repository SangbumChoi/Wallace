export const defaultWorkspaceId = "default";
export const defaultLibrary = {
  active: defaultWorkspaceId,
  items: [{ id: defaultWorkspaceId, name: "Personal Workspace" }],
};

export function workspaceId(value = defaultWorkspaceId) {
  if (
    value === defaultWorkspaceId ||
    (typeof value === "string" &&
      /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value))
  )
    return value;
  throw new Error("Check the workspace ID.");
}

export function workspaceLibrary(value) {
  if (!Array.isArray(value?.items) || value.items.length > 100)
    throw new Error("Could not read the workspace list.");
  const items = value.items.map(({ id, name }) => {
    if (typeof name !== "string" || !name.trim() || name.length > 60)
      throw new Error("Enter a workspace name of 1–60 characters.");
    const trimmedName = name.trim();
    const oldDefault = "\uac1c\uc778 \uc6cc\ud06c\uc2a4\ud398\uc774\uc2a4";
    return {
      id: workspaceId(id),
      name:
        id === defaultWorkspaceId && trimmedName === oldDefault
          ? defaultLibrary.items[0].name
          : trimmedName,
    };
  });
  const ids = new Set(items.map(({ id }) => id));
  if (
    ids.size !== items.length ||
    !ids.has(value.active) ||
    !ids.has(defaultWorkspaceId)
  )
    throw new Error("Could not read the workspace list.");
  return { active: value.active, items };
}
