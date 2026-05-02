import { EditorView, WidgetType } from '@codemirror/view';
import type { HighlightedCodeBlock } from '../bridge';
import { applyShikiCss } from './shikiCss';

export class CodeBlockHeaderWidget extends WidgetType {
  public constructor(private readonly lang: string) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return widget instanceof CodeBlockHeaderWidget && widget.lang === this.lang;
  }

  public toDOM(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'mw-codeblock-header';
    header.contentEditable = 'false';

    const language = document.createElement('span');
    language.className = 'mw-codeblock-language';
    language.textContent = this.lang || 'text';
    header.appendChild(language);

    return header;
  }

  public ignoreEvent(): boolean {
    return true;
  }
}

export type CodeBlockPreviewWidgetOptions = {
  code: string;
  lang: string;
  from: number;
  highlight?: HighlightedCodeBlock;
};

export class CodeBlockPreviewWidget extends WidgetType {
  public constructor(private readonly options: CodeBlockPreviewWidgetOptions) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return (
      widget instanceof CodeBlockPreviewWidget &&
      widget.options.code === this.options.code &&
      widget.options.lang === this.options.lang &&
      widget.options.from === this.options.from &&
      widget.options.highlight?.html === this.options.highlight?.html
    );
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'mw-codeblock';
    wrapper.contentEditable = 'false';

    const header = document.createElement('div');
    header.className = 'mw-codeblock-header';

    const language = document.createElement('span');
    language.className = 'mw-codeblock-language';
    language.textContent = this.options.lang || 'text';
    header.appendChild(language);

    const content = document.createElement('div');
    content.className = 'mw-codeblock-content';

    if (this.options.highlight) {
      applyShikiCss(this.options.highlight.css);
      content.innerHTML = this.options.highlight.html;
    } else {
      renderPlainCode(content, this.options.code);
    }

    wrapper.append(header, content);
    requestAnimationFrame(() => view.requestMeasure());

    wrapper.addEventListener('mousedown', (event) => {
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0) {
        return;
      }

      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      view.focus();
      view.dispatch({ selection: { anchor: this.options.from }, scrollIntoView: true });
    });

    return wrapper;
  }

  public ignoreEvent(): boolean {
    return true;
  }
}

function renderPlainCode(container: HTMLElement, code: string): void {
  const pre = document.createElement('pre');
  const codeElement = document.createElement('code');
  codeElement.textContent = code;
  pre.appendChild(codeElement);
  container.replaceChildren(pre);
}
