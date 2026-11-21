import type { Page } from "./types";

const stopWords = new Set(
  "about above after again also another are because been before being between both can could current does first from have here into just like many more most much need next only other our over same should some such than that their them then there these they this those through under until use using very want was were what when where which while will with would your create create about note notes conversation project".split(
    " ",
  ),
);
const tokens = (text: string) =>
  new Set(
    (
      text
        .normalize("NFKC")
        .toLowerCase()
        .match(/[\p{L}\p{N}][\p{L}\p{N}-]+/gu) ?? []
    ).filter(
      (word) =>
        word.length >= (/^[a-z0-9-]+$/.test(word) ? 3 : 2) &&
        !stopWords.has(word),
    ),
  );

export function relatedKnowledge(pages: Page[], evidence: string) {
  const terms = tokens(evidence);
  const plainEvidence = evidence.normalize("NFKC").toLowerCase();
  return pages
    .flatMap((page) => {
      const title = page.title.normalize("NFKC").toLowerCase().trim();
      const titleHits = [...tokens(title)].filter((term) =>
        terms.has(term),
      ).length;
      const bodyHits = [
        ...tokens(page.html.slice(0, 10000).replace(/<[^>]*>/g, " ")),
      ].filter((term) => terms.has(term)).length;
      const cited =
        title.length >= 4 && plainEvidence.includes("[" + title + "]");
      const titlePhrase = title.length >= 8 && plainEvidence.includes(title);
      return cited ||
        titlePhrase ||
        (titleHits > 0 && titleHits + bodyHits >= 3)
        ? [
            {
              id: page.id,
              score:
                Number(cited) * 100 +
                Number(titlePhrase) * 30 +
                titleHits * 5 +
                Math.min(bodyHits, 6),
            },
          ]
        : [];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ id }) => id);
}
