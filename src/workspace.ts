import type {
  ConversationPurpose,
  PurposeKind,
  Relationship,
  Workspace,
  WorkspaceProfile,
} from "./types";

export const purposeLabels: Record<PurposeKind, string> = {
  question: "Question",
  decision: "Decision",
  problem: "Problem solving",
};

export const relationshipLabels: Record<Relationship, string> = {
  relates: "Related to",
  addresses: "Solves",
  supports: "Supports",
};

export const defaultProfile: WorkspaceProfile = {
  name: "You",
  icon: "initial",
};

export function purposeReference(purpose?: ConversationPurpose) {
  return purpose && `${purpose.kind}:${purpose.statement}`;
}
// Desktop validation migrates legacy files too; this covers browser previews.
export function withConversations(value: Workspace): Workspace {
  if (value.conversations)
    return {
      ...value,
      conversations: value.conversations.map((c) => ({
        ...c,
        favoriteNodeIds: c.favoriteNodeIds || [],
      })),
    };
  return {
    ...value,
    conversations: [
      {
        id: "conversation-imported",
        title: "Previous Workspace",
        html: "<h2>Conversation spec</h2><p>Capture the context, decisions, and open questions here.</p>",
        nodeIds: value.pages.map((p) => p.id),
        favorite: true,
        favoriteNodeIds: [],
        involved: true,
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}
