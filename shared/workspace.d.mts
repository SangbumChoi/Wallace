import type { AiRuntime, Workspace } from "../src/types";
export function aiRuntime(
  model: unknown,
  version: unknown,
): AiRuntime | undefined;
export function validateWorkspace(value: unknown): Workspace;
export function exclusiveConversationPages(
  workspace: Workspace,
  conversationId: string,
): Set<string>;
export function removeConversation(
  workspace: Workspace,
  conversationId: string,
): Workspace;
export function endpoint(base: string): string;
export function contextFor(
  workspace: Workspace,
  selectedId: string | undefined,
  query: string,
): { id: string; title: string; text: string }[];
