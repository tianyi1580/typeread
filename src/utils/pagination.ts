import { clamp } from "../lib/utils";

export function paginateText(text: string, charsPerPage: number) {
  const safeCharsPerPage = clamp(charsPerPage, 900, 2600);
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const pages: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > safeCharsPerPage && current) {
      pages.push(current);
      current = paragraph;
      continue;
    }
    current = candidate;
  }

  if (current) {
    pages.push(current);
  }

  return pages.length > 0 ? pages : [text];
}
