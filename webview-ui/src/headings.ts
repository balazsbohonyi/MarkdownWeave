import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { findFrontmatterRange } from './decorations/ranges';

const HEADING_PARSE_TIMEOUT_MS = 50;

export interface HeadingItem {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  line: number;   // 1-based line number
  from: number;   // char offset in document
}

export function extractHeadings(state: EditorState): HeadingItem[] {
  const frontmatter = findFrontmatterRange(state);
  const headings: HeadingItem[] = [];

  const tree = ensureSyntaxTree(state, state.doc.length, HEADING_PARSE_TIMEOUT_MS) ?? syntaxTree(state);

  tree.iterate({
    enter(node) {
      const m = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
      if (!m) {
        return;
      }

      if (frontmatter && node.from >= frontmatter.from && node.to <= frontmatter.to) {
        return false; // skip headings parsed from inside frontmatter
      }

      const level = parseInt(m[1], 10) as 1 | 2 | 3 | 4 | 5 | 6;
      const from = node.from;
      const line = state.doc.lineAt(from).number;
      const rawText = state.sliceDoc(from, node.to);
      const text = parseHeadingText(rawText, node.name);
      headings.push({ level, text, line, from });

      return false; // don't recurse into heading children
    }
  });

  return headings;
}

function parseHeadingText(raw: string, nodeName: string): string {
  if (nodeName.startsWith('ATX')) {
    // Strip leading #s and optional trailing #s, trim whitespace
    return raw
      .replace(/^#{1,6}\s*/, '')
      .replace(/\s+#+\s*$/, '')
      .trim();
  } else {
    // SetextHeading: "Heading text\n============" — take first line only
    const firstLine = raw.split('\n')[0];
    return (firstLine ?? raw).trim();
  }
}
