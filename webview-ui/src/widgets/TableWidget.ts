import { EditorView, WidgetType } from '@codemirror/view';
import { toggleTableRaw } from '../decorations/blockWidgets';
import {
  checkWikiLinks,
  postOpenLink,
  postOpenWikiLink,
  requestWikiLinkStatus,
  resolveImageUri,
  type WikiLinkStatus
} from '../bridge';
import { getMarkdownWeaveSettings } from '../settings';
import { renderInlineMathElement } from './MathWidget';

export type TableAlignment = 'left' | 'center' | 'right' | undefined;

export type ParsedTable = {
  headers: string[];
  rows: string[][];
  alignments: TableAlignment[];
};

export class TableWidget extends WidgetType {
  private resizeObservers: ResizeObserver[] = [];

  public constructor(
    private readonly table: ParsedTable,
    private readonly from: number,
    private readonly to: number,
    private readonly selected: boolean
  ) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return (
      widget instanceof TableWidget &&
      widget.from === this.from &&
      widget.to === this.to &&
      widget.selected === this.selected &&
      JSON.stringify(widget.table) === JSON.stringify(this.table)
    );
  }

  public toDOM(view: EditorView): HTMLElement {
    this.resizeObservers = [];
    const wrapper = document.createElement('div');
    wrapper.className = this.selected ? 'mw-table-widget mw-table-widget-selected' : 'mw-table-widget';
    wrapper.contentEditable = 'false';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mw-table-toggle';
    toggle.textContent = '<>';
    toggle.title = 'Show table source';
    toggle.setAttribute('aria-label', 'Show table source');
    toggle.addEventListener('mousedown', stopMouseEvent);
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({ effects: toggleTableRaw.of({ from: this.from, to: this.to }) });
    });

    const table = document.createElement('table');
    table.className = 'mw-table';
    table.append(this.renderHead(view), this.renderBody(view));

    wrapper.append(toggle, table);
    requestAnimationFrame(() => view.requestMeasure());
    wrapper.addEventListener('mousedown', (event) => {
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0 || mouseEvent.target === toggle || isInteractiveTarget(mouseEvent.target)) {
        return;
      }

      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      view.focus();
      view.dispatch({ selection: { anchor: this.from, head: this.to }, scrollIntoView: true });
    });

    return wrapper;
  }

  public ignoreEvent(): boolean {
    return true;
  }

  public destroy(): void {
    this.resizeObservers.forEach((observer) => observer.disconnect());
    this.resizeObservers = [];
  }

  private renderHead(view: EditorView): HTMLTableSectionElement {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    this.table.headers.forEach((header, index) => {
      const th = document.createElement('th');
      th.appendChild(renderInlineMarkdown(header, view, this.resizeObservers));
      applyAlignment(th, this.table.alignments[index]);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    return thead;
  }

  private renderBody(view: EditorView): HTMLTableSectionElement {
    const tbody = document.createElement('tbody');
    this.table.rows.forEach((row) => {
      const tr = document.createElement('tr');
      this.table.headers.forEach((_header, index) => {
        const td = document.createElement('td');
        td.appendChild(renderInlineMarkdown(row[index] ?? '', view, this.resizeObservers));
        applyAlignment(td, this.table.alignments[index]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    return tbody;
  }
}

export class TableRawToggleWidget extends WidgetType {
  public constructor(
    private readonly from: number,
    private readonly to: number
  ) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return widget instanceof TableRawToggleWidget && widget.from === this.from && widget.to === this.to;
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'mw-table-toggle-raw-slot';
    wrapper.contentEditable = 'false';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mw-table-toggle mw-table-toggle-raw';
    button.textContent = '<>';
    button.title = 'Render table';
    button.setAttribute('aria-label', 'Render table');
    button.contentEditable = 'false';
    button.addEventListener('mousedown', stopMouseEvent);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({ effects: toggleTableRaw.of({ from: this.from, to: this.to }) });
    });
    wrapper.appendChild(button);
    return wrapper;
  }

  public ignoreEvent(): boolean {
    return true;
  }
}

function renderInlineMarkdown(text: string, view: EditorView, resizeObservers: ResizeObserver[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let index = 0;

  while (index < text.length) {
    const token = findNextInlineToken(text, index);
    if (!token) {
      fragment.appendChild(document.createTextNode(text.slice(index)));
      break;
    }

    if (token.from > index) {
      fragment.appendChild(document.createTextNode(text.slice(index, token.from)));
    }

    fragment.appendChild(token.elementFactory(view, resizeObservers));
    index = token.to;
  }

  return fragment;
}

type InlineToken = {
  from: number;
  to: number;
  elementFactory: (view: EditorView, resizeObservers: ResizeObserver[]) => Node;
};

function findNextInlineToken(text: string, from: number): InlineToken | undefined {
  const finders = [
    findInlineCode,
    findMarkdownImage,
    findMarkdownLink,
    findWikiLink,
    findStrong,
    findEmphasis,
    findStrike,
    findInlineMath
  ];
  const tokens = finders
    .map((finder) => finder(text, from))
    .filter((token): token is InlineToken => Boolean(token));

  return tokens.sort((left, right) => left.from - right.from || right.to - left.to)[0];
}

function findInlineCode(text: string, from: number): InlineToken | undefined {
  const start = findUnescaped(text, '`', from);
  if (start < 0) {
    return undefined;
  }
  const end = findUnescaped(text, '`', start + 1);
  if (end < 0) {
    return undefined;
  }

  return {
    from: start,
    to: end + 1,
    elementFactory: () => {
      const code = document.createElement('code');
      code.className = 'mw-inline-code';
      code.textContent = text.slice(start + 1, end);
      return code;
    }
  };
}

function findMarkdownImage(text: string, from: number): InlineToken | undefined {
  const match = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;
  match.lastIndex = from;
  const result = match.exec(text);
  if (!result) {
    return undefined;
  }

  const raw = result[0];
  const alt = result[1];
  const src = result[2].trim();
  return {
    from: result.index,
    to: result.index + raw.length,
    elementFactory: (view) => renderTableImage(src, alt, view)
  };
}

function findMarkdownLink(text: string, from: number): InlineToken | undefined {
  const match = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  match.lastIndex = from;
  const result = match.exec(text);
  if (!result) {
    return undefined;
  }

  const label = result[1];
  const url = result[2].trim();
  return {
    from: result.index,
    to: result.index + result[0].length,
    elementFactory: (view, resizeObservers) => {
      const anchor = document.createElement('a');
      anchor.className = 'mw-link';
      anchor.href = '#';
      anchor.appendChild(renderInlineMarkdown(label, view, resizeObservers));
      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }
        postOpenLink(url);
      });
      return anchor;
    }
  };
}

function findWikiLink(text: string, from: number): InlineToken | undefined {
  if (!getMarkdownWeaveSettings().enableWikiLinks) {
    return undefined;
  }

  const match = /\[\[([^\]\n]+)\]\]/g;
  match.lastIndex = from;
  const result = match.exec(text);
  if (!result) {
    return undefined;
  }

  const parsed = parseWikiLink(result[1]);
  return {
    from: result.index,
    to: result.index + result[0].length,
    elementFactory: () => renderTableWikiLink(parsed)
  };
}

function findStrong(text: string, from: number): InlineToken | undefined {
  return findDelimited(text, from, '**', 'strong', 'mw-strong');
}

function findEmphasis(text: string, from: number): InlineToken | undefined {
  return findDelimited(text, from, '*', 'em', 'mw-emphasis', (value, index) => value[index + 1] !== '*');
}

function findStrike(text: string, from: number): InlineToken | undefined {
  return findDelimited(text, from, '~~', 's', 'mw-strike');
}

function findDelimited(
  text: string,
  from: number,
  delimiter: string,
  tag: 'strong' | 'em' | 's',
  className: string,
  validStart: (value: string, index: number) => boolean = () => true
): InlineToken | undefined {
  let start = findUnescaped(text, delimiter, from);
  while (start >= 0 && !validStart(text, start)) {
    start = findUnescaped(text, delimiter, start + delimiter.length);
  }
  if (start < 0) {
    return undefined;
  }
  const end = findUnescaped(text, delimiter, start + delimiter.length);
  if (end < 0 || end === start + delimiter.length) {
    return undefined;
  }

  return {
    from: start,
    to: end + delimiter.length,
    elementFactory: (view, resizeObservers) => {
      const element = document.createElement(tag);
      element.className = className;
      element.appendChild(renderInlineMarkdown(text.slice(start + delimiter.length, end), view, resizeObservers));
      return element;
    }
  };
}

function findInlineMath(text: string, from: number): InlineToken | undefined {
  if (!getMarkdownWeaveSettings().enableMath) {
    return undefined;
  }

  let start = findUnescaped(text, '$', from);
  while (start >= 0 && !isInlineMathOpening(text, start)) {
    start = findUnescaped(text, '$', start + 1);
  }
  if (start < 0) {
    return undefined;
  }

  let end = findUnescaped(text, '$', start + 1);
  while (end >= 0 && (end === start + 1 || /\s/.test(text[end - 1] ?? ''))) {
    end = findUnescaped(text, '$', end + 1);
  }
  if (end < 0) {
    return undefined;
  }

  const raw = text.slice(start, end + 1);
  const tex = text.slice(start + 1, end);
  return {
    from: start,
    to: end + 1,
    elementFactory: (view, resizeObservers) => {
      const span = document.createElement('span');
      span.className = 'mw-math mw-inline-math';
      const observer = renderInlineMathElement(span, view, tex, raw);
      if (observer) {
        resizeObservers.push(observer);
      }
      return span;
    }
  };
}

function renderTableImage(src: string, alt: string, view: EditorView): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'mw-table-image';
  wrapper.textContent = alt || src;
  resolveImageUri(src, (uri) => {
    if (!uri) {
      return;
    }
    const image = document.createElement('img');
    image.src = uri;
    image.alt = alt;
    image.addEventListener('load', () => view.requestMeasure(), { once: true });
    wrapper.replaceChildren(image);
  });
  return wrapper;
}

type ParsedWikiLink = {
  target: string;
  heading: string | undefined;
  displayText: string;
};

function parseWikiLink(raw: string): ParsedWikiLink {
  const [targetPart, alias] = raw.split('|', 2);
  const [target, heading] = targetPart.split('#', 2);
  return {
    target,
    heading,
    displayText: alias || (heading ? `${target} > ${heading}` : target)
  };
}

function renderTableWikiLink(link: ParsedWikiLink): HTMLElement {
  const span = document.createElement('span');
  span.className = 'mw-wikilink';
  span.textContent = link.displayText;
  let status: WikiLinkStatus | undefined = requestWikiLinkStatus(link.target);
  span.classList.toggle('mw-wikilink-broken', status?.exists === false);

  if (!status) {
    checkWikiLinks([link.target], (results) => {
      status = results.find((result) => result.target === link.target);
      span.classList.toggle('mw-wikilink-broken', status?.exists === false);
    });
  }

  span.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    if (status?.exists && status.uri) {
      postOpenWikiLink(status.uri, link.heading);
    }
  });

  return span;
}

function findUnescaped(text: string, needle: string, from: number): number {
  let index = text.indexOf(needle, from);
  while (index >= 0 && isEscaped(text, index)) {
    index = text.indexOf(needle, index + needle.length);
  }
  return index;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function isInlineMathOpening(text: string, index: number): boolean {
  const next = text[index + 1];
  const previous = text[index - 1];
  return next !== '$' && next !== undefined && !/\s|\d/.test(next) && previous !== '$' && !isEscaped(text, index);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('a, button, .mw-wikilink, .mw-table-image'));
}

function applyAlignment(cell: HTMLTableCellElement, alignment: TableAlignment): void {
  if (alignment) {
    cell.classList.add(`mw-table-align-${alignment}`);
  }
}

function stopMouseEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}
