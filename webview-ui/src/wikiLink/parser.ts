import { tags } from '@lezer/highlight';
import type { InlineContext, MarkdownExtension } from '@lezer/markdown';

export const wikiLinkExtension: MarkdownExtension = {
  defineNodes: [
    { name: 'WikiLink', style: tags.link },
    { name: 'WikiLinkMark', style: tags.punctuation },
    { name: 'WikiLinkTarget' },
    { name: 'WikiLinkAlias' },
    { name: 'WikiLinkHeading' },
  ],
  parseInline: [
    {
      name: 'WikiLink',
      before: 'Link',
      parse(cx: InlineContext, next: number, pos: number): number {
        // next === 91 = '['; require two consecutive '['
        if (next !== 91 || cx.char(pos + 1) !== 91) {
          return -1;
        }

        let i = pos + 2;
        let pipePos = -1;
        let hashPos = -1;

        while (i < cx.end) {
          const ch = cx.char(i);

          if (ch === 10) {
            // newline — wiki links must be single-line
            return -1;
          }

          if (ch === 93 && cx.char(i + 1) === 93) {
            // found closing ]]
            break;
          }

          if (ch === 124 && pipePos < 0) {
            // first '|' — alias separator
            pipePos = i;
          }

          if (ch === 35 && hashPos < 0 && pipePos < 0) {
            // first '#' before any '|' — heading separator
            hashPos = i;
          }

          i++;
        }

        if (i >= cx.end) {
          // no closing ]] found
          return -1;
        }

        const contentStart = pos + 2;
        const contentEnd = i; // position of first ']' of ']]\''
        const end = i + 2;   // position after ']]'

        // Target spans from contentStart to the first separator (or contentEnd)
        const targetEnd = hashPos > 0 ? hashPos : (pipePos > 0 ? pipePos : contentEnd);

        // Require a non-empty target
        if (targetEnd <= contentStart) {
          return -1;
        }

        const children = [
          cx.elt('WikiLinkMark', pos, pos + 2),
          cx.elt('WikiLinkTarget', contentStart, targetEnd),
        ];

        if (hashPos > 0) {
          const headingEnd = pipePos > 0 ? pipePos : contentEnd;
          if (headingEnd > hashPos + 1) {
            // non-empty heading
            children.push(cx.elt('WikiLinkHeading', hashPos + 1, headingEnd));
          }
        }

        if (pipePos > 0 && contentEnd > pipePos + 1) {
          // non-empty alias
          children.push(cx.elt('WikiLinkAlias', pipePos + 1, contentEnd));
        }

        children.push(cx.elt('WikiLinkMark', contentEnd, end));

        cx.addElement(cx.elt('WikiLink', pos, end, children));
        return end;
      }
    }
  ]
};
