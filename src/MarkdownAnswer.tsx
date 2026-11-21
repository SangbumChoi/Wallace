import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Marked } from "marked";
import { bridge } from "./bridge";
import { escapeHtml } from "./workspacePresentation";

const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ text }) => escapeHtml(text),
  },
});

export default function MarkdownAnswer({ text }: { text: string }) {
  const [linkError, setLinkError] = useState("");
  const html = useMemo(() => {
    const rendered = markdown.parse(text, { async: false });
    return DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS: [
        "a",
        "blockquote",
        "br",
        "code",
        "del",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "input",
        "li",
        "ol",
        "p",
        "pre",
        "strong",
        "table",
        "tbody",
        "td",
        "th",
        "thead",
        "tr",
        "ul",
      ],
      ALLOWED_ATTR: [
        "align",
        "checked",
        "disabled",
        "href",
        "start",
        "title",
        "type",
      ],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^https?:\/\//i,
    });
  }, [text]);

  return (
    <>
      <div
        className="answer-markdown"
        onClick={(event) => {
          if (!(event.target instanceof Element)) return;
          const link = event.target.closest<HTMLAnchorElement>("a[href]");
          if (!link) return;
          event.preventDefault();
          setLinkError("");
          if (bridge.openMigrationLink) {
            void bridge.openMigrationLink(link.href).catch(() => {
              setLinkError("Could not open this link.");
            });
          } else {
            window.open(link.href, "_blank", "noopener,noreferrer");
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {linkError && <p role="status">{linkError}</p>}
    </>
  );
}
