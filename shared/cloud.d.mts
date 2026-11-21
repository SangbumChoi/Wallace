import type { Workspace } from "../src/types";
export function cloudEndpoint(input: string): string;
export function sharedWorkspace(workspace: Workspace): Workspace;
export function mergeWorkspaces(
  base: Workspace,
  local: Workspace,
  remote: Workspace,
): { workspace?: Workspace; conflicts: string[] };
