import type { Workspace } from "../src/types";
export function appendMigration(
  workspace: Workspace,
  imported: Workspace,
  conversationIds: string[],
): {
  workspace: Workspace;
  pages: number;
  edges: number;
  conversations: string[];
};
