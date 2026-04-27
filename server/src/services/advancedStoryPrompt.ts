export type StoryMode = "auto" | "standard" | "advanced";

export interface AdvancedStoryPageSpec {
  pageNumber: number;
  text: string;
  illustrationNotes: string;
}

export interface AdvancedStorySpec {
  title: string;
  rawPrompt: string;
  declaredFormat?: string;
  declaredPageCount?: number;
  audience?: string;
  rhymeMode?: string;
  coreRefrain?: string;
  typesettingNotes?: string;
  illustrationStyleGuide?: string;
  pages: AdvancedStoryPageSpec[];
}

export const MAX_ADVANCED_PAGES = 64;
export const MAX_ADVANCED_PROMPT_LENGTH = 50_000;
export const MAX_STANDARD_PROMPT_LENGTH = 2_000;

export class AdvancedStoryPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvancedStoryPromptError";
  }
}

interface Heading {
  lineIndex: number;
  pageNumber: number;
}

interface TopMatter {
  title: string;
  declaredFormat?: string;
  declaredPageCount?: number;
  audience?: string;
  rhymeMode?: string;
  coreRefrain?: string;
}

const PAGE_HEADING_RE = /^Page\s+(\d+)\s*$/i;
const TEXT_HEADING_RE = /^Text\s*$/i;
const ILLUSTRATION_NOTES_HEADING_RE = /^Illustration notes\s*$/i;
const TYPESETTING_NOTES_HEADING_RE = /^Typesetting notes\s*$/i;
const ILLUSTRATION_STYLE_GUIDE_HEADING_RE = /^Illustration style guide\s*$/i;

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trimBlock(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end).join("\n").trim();
}

function isPageHeading(line: string): boolean {
  return PAGE_HEADING_RE.test(line.trim());
}

function isGlobalHeading(line: string): boolean {
  const trimmed = line.trim();
  return (
    TYPESETTING_NOTES_HEADING_RE.test(trimmed) ||
    ILLUSTRATION_STYLE_GUIDE_HEADING_RE.test(trimmed)
  );
}

function parsePageHeadings(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  lines.forEach((line, lineIndex) => {
    const match = line.trim().match(PAGE_HEADING_RE);
    if (!match) return;
    headings.push({ lineIndex, pageNumber: Number.parseInt(match[1], 10) });
  });
  return headings;
}

function parseDeclaredPageCount(format: string | undefined): number | undefined {
  if (!format) return undefined;
  const match = format.match(/\b(\d+)\s*[- ]?\s*page\b/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function parseTopMatter(lines: string[]): TopMatter {
  let title = "";
  let declaredFormat: string | undefined;
  let audience: string | undefined;
  let rhymeMode: string | undefined;
  let coreRefrain: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const metadata = line.match(/^([^:]{1,80}):\s*(.*)$/);
    if (!metadata) {
      if (!title) title = line;
      continue;
    }

    const key = metadata[1].trim().toLowerCase();
    const value = metadata[2].trim();
    if (!value) continue;

    if (key === "title") title = value;
    else if (key === "format") declaredFormat = value;
    else if (key === "audience") audience = value;
    else if (key === "rhyme mode") rhymeMode = value;
    else if (key === "core refrain") coreRefrain = value;
    else if (!title) title = line;
  }

  return {
    title: title || "Untitled Advanced Story",
    declaredFormat,
    declaredPageCount: parseDeclaredPageCount(declaredFormat),
    audience,
    rhymeMode,
    coreRefrain,
  };
}

function findFirstLineAfter(
  lines: string[],
  startIndex: number,
  predicate: (line: string) => boolean,
  fallback: number
): number {
  for (let i = startIndex + 1; i < fallback; i += 1) {
    if (predicate(lines[i])) return i;
  }
  return fallback;
}

function findSectionHeading(lines: string[], re: RegExp, startIndex = 0): number {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (re.test(lines[i].trim())) return i;
  }
  return -1;
}

function parsePageBlock(pageNumber: number, blockLines: string[]): AdvancedStoryPageSpec {
  const textStart = findSectionHeading(blockLines, TEXT_HEADING_RE);
  if (textStart < 0) {
    throw new AdvancedStoryPromptError(`Page ${pageNumber} is missing a Text section.`);
  }

  const notesStart = findSectionHeading(
    blockLines,
    ILLUSTRATION_NOTES_HEADING_RE,
    textStart + 1
  );
  const textEnd = notesStart >= 0 ? notesStart : blockLines.length;
  const text = trimBlock(blockLines.slice(textStart + 1, textEnd));
  const illustrationNotes =
    notesStart >= 0 ? trimBlock(blockLines.slice(notesStart + 1)) : "";

  if (!text) {
    throw new AdvancedStoryPromptError(`Page ${pageNumber} has an empty Text section.`);
  }

  return {
    pageNumber,
    text,
    illustrationNotes,
  };
}

function extractGlobalSection(lines: string[], re: RegExp): string | undefined {
  const start = findSectionHeading(lines, re);
  if (start < 0) return undefined;

  const end = findFirstLineAfter(
    lines,
    start,
    (line) => isGlobalHeading(line) || isPageHeading(line),
    lines.length
  );
  const value = trimBlock(lines.slice(start + 1, end));
  return value || undefined;
}

function validatePageSequence(pages: AdvancedStoryPageSpec[]): void {
  const seen = new Set<number>();
  for (const page of pages) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
      throw new AdvancedStoryPromptError("Page numbers must be positive integers.");
    }
    if (seen.has(page.pageNumber)) {
      throw new AdvancedStoryPromptError(`Page ${page.pageNumber} appears more than once.`);
    }
    seen.add(page.pageNumber);
  }

  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  for (let i = 0; i < ordered.length; i += 1) {
    const expected = i + 1;
    if (ordered[i].pageNumber !== expected) {
      throw new AdvancedStoryPromptError(
        `Page numbers must start at 1 and be contiguous. Expected Page ${expected}.`
      );
    }
  }
}

export function normalizeStoryMode(value: unknown): StoryMode {
  if (value == null || value === "") return "auto";
  if (value === "auto" || value === "standard" || value === "advanced") {
    return value;
  }
  throw new AdvancedStoryPromptError("storyMode must be auto, standard, or advanced.");
}

export function detectAdvancedStoryPrompt(prompt: string): boolean {
  const normalized = normalizeNewlines(prompt);
  const headings = parsePageHeadings(normalized.split("\n"));
  const hasTextHeading = normalized
    .split("\n")
    .some((line) => TEXT_HEADING_RE.test(line.trim()));
  const hasIllustrationNotesHeading = normalized
    .split("\n")
    .some((line) => ILLUSTRATION_NOTES_HEADING_RE.test(line.trim()));
  return (
    headings.length >= 2 &&
    hasTextHeading &&
    hasIllustrationNotesHeading
  );
}

export function parseAdvancedStoryPrompt(rawPrompt: string): AdvancedStorySpec {
  const normalized = normalizeNewlines(rawPrompt).trim();
  if (!normalized) {
    throw new AdvancedStoryPromptError("Advanced story prompt is empty.");
  }
  if (normalized.length > MAX_ADVANCED_PROMPT_LENGTH) {
    throw new AdvancedStoryPromptError(
      `Advanced story prompt must be ${MAX_ADVANCED_PROMPT_LENGTH} characters or fewer.`
    );
  }

  const lines = normalized.split("\n");
  const pageHeadings = parsePageHeadings(lines);
  if (pageHeadings.length === 0) {
    throw new AdvancedStoryPromptError("Advanced story prompt must include Page 1, Page 2, etc.");
  }
  if (pageHeadings.length > MAX_ADVANCED_PAGES) {
    throw new AdvancedStoryPromptError(
      `Advanced stories can have at most ${MAX_ADVANCED_PAGES} pages.`
    );
  }

  const topMatter = parseTopMatter(lines.slice(0, pageHeadings[0].lineIndex));
  const pages = pageHeadings.map((heading, index) => {
    const nextPageIndex = pageHeadings[index + 1]?.lineIndex ?? lines.length;
    const blockEnd = findFirstLineAfter(lines, heading.lineIndex, isGlobalHeading, nextPageIndex);
    return parsePageBlock(
      heading.pageNumber,
      lines.slice(heading.lineIndex + 1, blockEnd)
    );
  });

  validatePageSequence(pages);

  if (
    topMatter.declaredPageCount != null &&
    topMatter.declaredPageCount !== pages.length
  ) {
    throw new AdvancedStoryPromptError(
      `Format declares ${topMatter.declaredPageCount} pages, but ${pages.length} Page sections were found.`
    );
  }

  return {
    title: topMatter.title,
    rawPrompt: normalized,
    declaredFormat: topMatter.declaredFormat,
    declaredPageCount: topMatter.declaredPageCount,
    audience: topMatter.audience,
    rhymeMode: topMatter.rhymeMode,
    coreRefrain: topMatter.coreRefrain,
    typesettingNotes: extractGlobalSection(lines, TYPESETTING_NOTES_HEADING_RE),
    illustrationStyleGuide: extractGlobalSection(lines, ILLUSTRATION_STYLE_GUIDE_HEADING_RE),
    pages,
  };
}
