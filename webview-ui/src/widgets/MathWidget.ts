import { WidgetType } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';

type KatexModule = typeof import('katex');

let katexPromise: Promise<KatexModule> | undefined;
const MIN_MATH_SCALE = 0.35;

export class InlineMathWidget extends WidgetType {
  private resizeObserver: ResizeObserver | undefined;

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
    this.resizeObserver = renderMath(wrapper, view, this.tex, this.raw, false);
    wrapper.addEventListener('mousedown', (event) => {
      revealRawMath(event, view, this.from);
    });
    return wrapper;
  }

  public destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }
}

export class DisplayMathWidget extends WidgetType {
  private resizeObserver: ResizeObserver | undefined;

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
    this.resizeObserver = renderMath(wrapper, view, this.tex, this.raw, true);
    wrapper.addEventListener('mousedown', (event) => {
      revealRawMath(event, view, this.from);
    });
    return wrapper;
  }

  public destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }
}

function renderMath(
  container: HTMLElement,
  view: EditorView,
  tex: string,
  raw: string,
  displayMode: boolean
): ResizeObserver | undefined {
  container.textContent = raw;
  let resizeObserver: ResizeObserver | undefined;

  void loadKaTeX()
    .then((katex) => {
      container.innerHTML = katex.renderToString(tex, {
        displayMode,
        output: 'mathml',
        throwOnError: false
      });
      fitMathToContainer(container, view, displayMode);
    })
    .catch(() => {
      container.classList.add('mw-math-error');
      container.textContent = raw;
      view.requestMeasure();
    });

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => fitRenderedMath(container, view, displayMode));
    observer.observe(container);
    requestAnimationFrame(() => observeMathResizeTargets(container, observer));
    resizeObserver = observer;
  }

  return resizeObserver;
}

function observeMathResizeTargets(container: HTMLElement, resizeObserver: ResizeObserver): void {
  const content = container.closest<HTMLElement>('.cm-content');
  if (content) {
    resizeObserver.observe(content);
  }

  const editor = container.closest<HTMLElement>('.cm-editor');
  if (editor) {
    resizeObserver.observe(editor);
  }
}

function fitMathToContainer(container: HTMLElement, view: EditorView, displayMode: boolean): void {
  requestAnimationFrame(() => fitRenderedMath(container, view, displayMode));
}

function fitRenderedMath(container: HTMLElement, view: EditorView, displayMode: boolean): void {
  const math = container.firstElementChild as HTMLElement | null;
  if (!math) {
    view.requestMeasure();
    return;
  }

  math.style.fontSize = '';

  const availableWidth = getAvailableMathWidth(container, displayMode);
  const naturalWidth = getNaturalMathWidth(container);
  if (availableWidth > 0 && naturalWidth > availableWidth) {
    const scale = Math.max(MIN_MATH_SCALE, availableWidth / naturalWidth);
    math.style.fontSize = `${scale}em`;
  }

  view.requestMeasure();
}

function getAvailableMathWidth(container: HTMLElement, displayMode: boolean): number {
  if (displayMode && container.clientWidth > 0) {
    return container.clientWidth;
  }

  const content = container.closest<HTMLElement>('.cm-content');
  return content?.clientWidth ?? container.parentElement?.clientWidth ?? container.clientWidth;
}

function getNaturalMathWidth(container: HTMLElement): number {
  const candidates = [
    container.firstElementChild,
    container.querySelector('.katex'),
    container.querySelector('math'),
    ...Array.from(container.querySelectorAll('.katex *'))
  ].filter((element): element is Element => Boolean(element));

  return candidates.reduce((width, element) => {
    const htmlElement = element as HTMLElement;
    const rectWidth = element.getBoundingClientRect().width;
    const scrollWidth = htmlElement.scrollWidth ?? 0;
    return Math.max(width, rectWidth, scrollWidth);
  }, 0);
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
