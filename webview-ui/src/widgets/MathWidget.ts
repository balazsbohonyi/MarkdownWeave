import { WidgetType } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';

type KatexModule = typeof import('katex');

let katexPromise: Promise<KatexModule> | undefined;

export class InlineMathWidget extends WidgetType {
  public constructor(
    private readonly tex: string,
    private readonly raw: string,
    private readonly from: number
  ) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return widget instanceof InlineMathWidget && widget.tex === this.tex && widget.raw === this.raw;
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'mw-math mw-inline-math';
    renderMath(wrapper, view, this.tex, this.raw, false);
    wrapper.addEventListener('mousedown', (event) => {
      revealRawMath(event, view, this.from);
    });
    return wrapper;
  }
}

export class DisplayMathWidget extends WidgetType {
  public constructor(
    private readonly tex: string,
    private readonly raw: string,
    private readonly from: number
  ) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return widget instanceof DisplayMathWidget && widget.tex === this.tex && widget.raw === this.raw;
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'mw-math mw-display-math';
    renderMath(wrapper, view, this.tex, this.raw, true);
    wrapper.addEventListener('mousedown', (event) => {
      revealRawMath(event, view, this.from);
    });
    return wrapper;
  }
}

function renderMath(container: HTMLElement, view: EditorView, tex: string, raw: string, displayMode: boolean): void {
  container.textContent = raw;

  void loadKaTeX()
    .then((katex) => {
      container.innerHTML = katex.renderToString(tex, {
        displayMode,
        output: 'mathml',
        throwOnError: false
      });
      view.requestMeasure();
    })
    .catch(() => {
      container.classList.add('mw-math-error');
      container.textContent = raw;
      view.requestMeasure();
    });
}

function loadKaTeX(): Promise<KatexModule> {
  katexPromise ??= importKaTeX();
  return katexPromise;
}

async function importKaTeX(): Promise<KatexModule> {
  ensureKaTeXStyle();
  return import(window.markdownWeaveAssets.katexModule) as Promise<KatexModule>;
}

function ensureKaTeXStyle(): void {
  if (document.getElementById('mw-katex-css')) {
    return;
  }

  const link = document.createElement('link');
  link.id = 'mw-katex-css';
  link.rel = 'stylesheet';
  link.href = window.markdownWeaveAssets.katexCss;
  document.head.appendChild(link);
}

function revealRawMath(event: Event, view: EditorView, from: number): void {
  const mouseEvent = event as MouseEvent;
  if (mouseEvent.button !== 0) {
    return;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();
  view.focus();
  view.dispatch({ selection: { anchor: from } });
}
