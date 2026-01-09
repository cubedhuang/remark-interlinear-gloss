import type { List, ListItem, Paragraph, PhrasingContent, Root } from "mdast";
import type {
  ContainerDirective,
  LeafDirective,
  TextDirective,
} from "mdast-util-directive";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";

// Mirror mdast-util-to-hast types for remark-rehype
declare module "mdast" {
  interface ParagraphData {
    hName?: string;
    hProperties?: Record<string, unknown>;
  }
}

type RowType = "text" | "transliteration" | "gloss";

interface GlossRow {
  type: RowType;
  words: PhrasingContent[][];
}

interface Gloss {
  headers: PhrasingContent[][];
  rows: GlossRow[];
  footers: PhrasingContent[][];
}

export default function remarkInterlinearGloss() {
  return (tree: Root, file: VFile) => {
    visit(tree, (node) => {
      const directive = node as
        | ContainerDirective
        | LeafDirective
        | TextDirective;
      if (directive.name !== "gloss") return;

      if (
        directive.type === "leafDirective" ||
        directive.type === "textDirective"
      ) {
        file.fail(
          "Interlinear glossing is only compatible with container directives (:::gloss)",
          directive
        );
      }

      let parseResult: Gloss;
      try {
        parseResult = parseGlossNode(directive);
      } catch (error) {
        file.fail((error as Error).message, directive);
      }
      const { headers, rows, footers } = parseResult;
      const columns = buildColumns(rows);

      directive.data = { hName: "figure", hProperties: { class: "gloss" } };
      directive.children = [];
      if (headers.length > 0) {
        directive.children.push(createHeader(headers));
      }
      if (columns.length > 0) {
        directive.children.push(createWordGrid(columns));
      }
      if (footers.length > 0) {
        directive.children.push(createFooter(footers));
      }
    });
  };
}

function parseGlossNode(node: ContainerDirective): Gloss {
  type Line =
    | { type: "meta"; content: PhrasingContent[] }
    | { type: "row"; row: GlossRow };

  const lines: Line[] = [];

  for (const child of node.children) {
    if (child.type === "paragraph") {
      const extractedLines = extractLines(child);
      for (const line of extractedLines) {
        const parsed = parseLinePrefix(line);
        if (parsed.type === "meta") {
          lines.push({ type: "meta", content: parsed.content });
        } else {
          lines.push({
            type: "row",
            row: { type: parsed.type, words: parsed.words },
          });
        }
      }
    }
  }

  const headers: PhrasingContent[][] = [];
  const footers: PhrasingContent[][] = [];
  const rows: GlossRow[] = [];

  let firstRowIndex = lines.findIndex((line) => line.type === "row");
  if (firstRowIndex === -1) firstRowIndex = lines.length;
  let lastRowIndex = lines.findLastIndex((line) => line.type === "row");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.type === "meta") {
      if (i < firstRowIndex) {
        headers.push(line.content);
      } else if (i > lastRowIndex) {
        footers.push(line.content);
      } else {
        throw new Error(
          "Header and footer lines denoted by '|' may only appear at the beginning or end of a gloss block"
        );
      }
    } else {
      rows.push(line.row);
    }
  }

  return { headers, rows, footers };
}

type ParsedLine =
  | { type: "meta"; content: PhrasingContent[] }
  | { type: RowType; words: PhrasingContent[][] };

function parseLinePrefix(words: PhrasingContent[][]): ParsedLine {
  if (words.length === 0) {
    return { type: "text", words: [] };
  }

  const firstWord = words[0]!;
  if (firstWord.length === 0) {
    return { type: "text", words };
  }

  const firstNode = firstWord[0]!;
  if (firstNode.type !== "text") {
    return { type: "text", words };
  }

  const text = firstNode.value;

  const prefixMatch = text.match(/^([|/=])\s*/);
  if (!prefixMatch) {
    return { type: "text", words };
  }

  const prefix = prefixMatch[1];
  const remainder = text.slice(prefixMatch[0].length);

  const newFirstWord =
    remainder.length > 0
      ? [{ type: "text" as const, value: remainder }, ...firstWord.slice(1)]
      : firstWord.slice(1);

  const newWords =
    newFirstWord.length > 0
      ? [newFirstWord, ...words.slice(1)]
      : words.slice(1);

  if (prefix === "|") {
    const content: PhrasingContent[] = [];
    for (let i = 0; i < newWords.length; i++) {
      if (i > 0) {
        content.push({ type: "text", value: " " });
      }
      content.push(...newWords[i]!);
    }
    return { type: "meta", content };
  } else if (prefix === "/") {
    return { type: "transliteration", words: newWords };
  } else if (prefix === "=") {
    return { type: "gloss", words: newWords };
  }

  return { type: "text", words };
}

function buildColumns(rows: GlossRow[]): ListItem[] {
  const numColumns = Math.max(0, ...rows.map((row) => row.words.length));

  return Array.from({ length: numColumns }, (_, col) =>
    createColumn(
      rows.map((row) => ({
        type: row.type,
        word: row.words[col],
      }))
    )
  );
}

interface ColumnWord {
  type: RowType;
  word: PhrasingContent[] | undefined;
}

function createColumn(words: ColumnWord[]): ListItem {
  return {
    type: "listItem",
    children: [
      {
        type: "list",
        ordered: true,
        spread: false,
        data: { hName: "ol", hProperties: { class: "gloss-column" } },
        children: words.map(
          ({ type, word }): ListItem => ({
            type: "listItem",
            spread: false,
            data: {
              hProperties: {
                class: `gloss-word gloss-word-${type}`,
              },
            },
            children:
              word && word.length > 0
                ? [{ type: "paragraph", children: word }]
                : [],
          })
        ),
      },
    ],
  };
}

function createHeader(lines: PhrasingContent[][]): Paragraph {
  const children: PhrasingContent[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      children.push({ type: "break" });
    }
    children.push(...lines[i]!);
  }
  return {
    type: "paragraph",
    data: { hName: "figcaption", hProperties: { class: "gloss-header" } },
    children,
  };
}

function createWordGrid(columns: ListItem[]): List {
  return {
    type: "list",
    ordered: true,
    spread: false,
    data: { hName: "ol", hProperties: { class: "gloss-body" } },
    children: columns,
  };
}

function createFooter(lines: PhrasingContent[][]): Paragraph {
  const children: PhrasingContent[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      children.push({ type: "break" });
    }
    children.push(...lines[i]!);
  }
  return {
    type: "paragraph",
    data: { hName: "p", hProperties: { class: "gloss-footer" } },
    children,
  };
}

function extractLines(paragraph: Paragraph): PhrasingContent[][][] {
  const lines: PhrasingContent[][][] = [[[]]];

  for (const child of paragraph.children) {
    if (child.type === "break") {
      lines.push([[]]);
    } else if (child.type === "text") {
      processTextNode(child.value, lines);
    } else {
      lines.at(-1)!.at(-1)!.push(child);
    }
  }

  return lines
    .map((line) => line.filter((word) => word.length > 0))
    .filter((line) => line.length > 0);
}

function processTextNode(text: string, lines: PhrasingContent[][][]): void {
  const textLines = text.split("\n");

  for (let i = 0; i < textLines.length; i++) {
    if (i > 0) lines.push([[]]);
    processTextLine(textLines[i]!, lines);
  }
}

function processTextLine(text: string, lines: PhrasingContent[][][]): void {
  const tokens = text.split(/(\s+)/);

  for (const token of tokens) {
    if (!token) continue;

    if (/^\s+$/.test(token)) {
      lines.at(-1)!.push([]);
    } else {
      lines.at(-1)!.at(-1)!.push({ type: "text", value: token });
    }
  }
}
