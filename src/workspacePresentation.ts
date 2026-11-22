import type { Workspace } from "./types";
import { defaultProfile, purposeLabels, relationshipLabels } from "./workspace";

const iconSymbols = { star: "★", sparkles: "✦", book: "▤" };
const kindLabels = {
  project: "Project",
  note: "Note",
  meeting: "Meeting notes",
  resource: "Resource",
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

export function workspacePresentation(
  workspace: Workspace,
  plainText: (html: string) => string,
) {
  const { profile = defaultProfile, conversations, pages, edges } = workspace;
  const profileIcon =
    profile.icon === "initial"
      ? Array.from(profile.name)[0]
      : iconSymbols[profile.icon];
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const pageLinks = new Map(pages.map((page, index) => [page.id, index + 1]));
  const sections: string[] = [];
  const paragraph = (text: string) => `<p>${escapeHtml(text)}</p>`;
  const heading = (text: string) => `<h2>${escapeHtml(text)}</h2>`;
  const slide = (title: string, content: string, anchor?: string) =>
    sections.push(
      `<section class="slide"${anchor ? ` id="${anchor}"` : ""}>${heading(title)}${content}</section>`,
    );
  const pageLink = (id: string) =>
    `<a href="#page-${pageLinks.get(id)}">${escapeHtml(pagesById.get(id)?.title || "Untitled page")}</a>`;
  const list = (items: string[]) =>
    items.length
      ? `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`
      : "";

  sections.push(`<section class="slide cover"><div class="avatar" aria-hidden="true">${profile.photo ? `<img alt="" src="${escapeHtml(profile.photo)}">` : escapeHtml(profileIcon)}</div>
    <h1>${escapeHtml(profile.name)}’s workspace</h1>
    ${list(
      conversations.map(
        (conversation, index) =>
          `<a href="#conversation-${index + 1}">${escapeHtml(conversation.title || "Untitled conversation")}</a>`,
      ),
    )}</section>`);
  conversations.forEach((conversation, index) => {
    const { purpose, summary, project } = conversation;
    const title = conversation.title || "Untitled conversation";
    const nodeIds = new Set(conversation.nodeIds);
    const spec = plainText(conversation.html);
    slide(
      title,
      [
        purpose
          ? `<h3>${purposeLabels[purpose.kind]}${purpose.completedAt ? " · Complete" : ""}</h3>${paragraph(purpose.statement)}`
          : "",
        summary
          ? `<h3>Reviewed summary · Exchanges 1–${summary.turnCount}</h3>${paragraph(summary.text)}`
          : "",
        spec ? `<h3>Conversation spec</h3>${paragraph(spec)}` : "",
        list(
          conversation.nodeIds.filter((id) => pagesById.has(id)).map(pageLink),
        ),
        list(
          edges
            .filter(
              ({ source, target }) =>
                nodeIds.has(source) && nodeIds.has(target),
            )
            .map(
              ({ source, target, relationship }) =>
                `${pageLink(source)} → ${pageLink(target)} · ${relationshipLabels[relationship ?? "relates"]}`,
            ),
        ),
      ].join(""),
      `conversation-${index + 1}`,
    );
    if (project) {
      slide(
        `${title} · Project steps`,
        `<p>${pageLink(project.pageId)}</p>${list(
          project.steps.map(
            (step) =>
              `${step.done ? "Done" : "Not started"} · ${escapeHtml(step.title)}`,
          ),
        )}`,
      );
    }
    conversation.aiTurns?.forEach((turn, turnIndex) => {
      slide(
        `${title} · Conversation ${turnIndex + 1}`,
        `<h3>${escapeHtml(turn.author || profile.name)}</h3>${paragraph(turn.question)}<h3>Wallace AI</h3>${paragraph(turn.answer)}`,
      );
    });
  });
  pages.forEach((page, index) => {
    slide(
      page.title || "Untitled page",
      `<h3>${kindLabels[page.kind]}</h3>${paragraph(plainText(page.html))}`,
      `page-${index + 1}`,
    );
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Wallace workspace</title><style>
*{box-sizing:border-box} body{margin:0;background:#f4f4f7;color:#292c37;font:16px/1.6 system-ui,sans-serif}
main{max-width:1056px;margin:auto;padding:24px} .slide{min-height:clamp(280px,51vw,540px);margin:0 0 24px;padding:clamp(20px,5vw,56px);background:white;border:1px solid #e5e1eb;border-radius:12px;overflow-wrap:anywhere}
.avatar img{width:100%;height:100%;object-fit:cover;border-radius:inherit}.cover{background:#eee8f6} .avatar{display:grid;place-items:center;width:52px;height:52px;background:white;color:#625184;border-radius:10px;font-weight:bold;font-size:22px}
h1,h2,h3{line-height:1.3} h2{margin-top:0} h3{margin-bottom:4px;font-size:1rem;color:#625184} p{white-space:pre-wrap;margin-top:0} a{color:#625184} li{margin-block:4px}
@page{size:A4 landscape;margin:12mm} @media print{body{background:white} main{max-width:none;padding:0} .slide{min-height:auto;margin:0;padding:12mm;border:0;border-radius:0;break-after:page} .slide:last-child{break-after:auto} h2,h3{break-after:avoid}}
</style></head><body><main>${sections.join("\n")}</main></body></html>`;
}
