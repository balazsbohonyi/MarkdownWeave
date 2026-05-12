import { EditorView, WidgetType } from '@codemirror/view';
import DOMPurify from 'dompurify';
import { hideMermaidResizeHandlesUntilPointerLeaves } from './imageResizeHandle';

type MermaidModule = typeof import('mermaid');
type MermaidApi = MermaidModule['default'];

export type MermaidWidgetOptions = {
  id: string;
  code: string;
  from: number;
  to: number;
  selected: boolean;
};

let mermaidPromise: Promise<MermaidApi> | undefined;
const mountedRenderers = new Set<() => void>();
const resizedMermaidWidths = new Map<string, number>();
const renderedMermaidCache = new Map<string, string>();
let mermaidStyleIndex = 0;
let themeObserver: MutationObserver | undefined;
let markdownThemeObserver: MutationObserver | undefined;
let observedThemeIsDark = isDarkTheme();
const MIN_MERMAID_WIDTH = 280;
const MAX_MERMAID_WIDTH = 1000;

export class MermaidWidget extends WidgetType {
  private renderCallback: (() => void) | undefined;

  public constructor(private readonly options: MermaidWidgetOptions) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return (
      widget instanceof MermaidWidget &&
      widget.options.id === this.options.id &&
      widget.options.from === this.options.from &&
      widget.options.to === this.options.to &&
      widget.options.selected === this.options.selected
    );
  }

  public updateDOM(dom: HTMLElement, _view: EditorView, previous: MermaidWidget): boolean {
    if (
      previous.options.code !== this.options.code ||
      getMermaidRenderId(previous.options) !== getMermaidRenderId(this.options)
    ) {
      return false;
    }

    dom.dataset.mermaidId = this.options.id;
    setMermaidPositionData(dom, this.options.from, this.options.to);
    dom.classList.toggle('mw-mermaid-selected', this.options.selected);
    return true;
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'mw-mermaid';
    wrapper.classList.toggle('mw-mermaid-selected', this.options.selected);
    wrapper.contentEditable = 'false';
    wrapper.dataset.mermaidId = this.options.id;
    setMermaidPositionData(wrapper, this.options.from, this.options.to);
    applyStoredMermaidWidth(wrapper, this.options.id);

    const output = document.createElement('div');
    output.className = 'mw-mermaid-output';

    const handle = document.createElement('span');
    handle.className = 'mw-mermaid-resize-handle';
    handle.setAttribute('aria-hidden', 'true');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mw-table-toggle mw-mermaid-toggle';
    toggle.textContent = '<>';
    toggle.title = 'Show Mermaid source';
    toggle.setAttribute('aria-label', 'Show Mermaid source');

    wrapper.append(output, toggle, handle);
    const renderId = getMermaidRenderId(this.options);
    const cachedSvg = renderedMermaidCache.get(getMermaidCacheKey(renderId));
    if (cachedSvg) {
      output.innerHTML = cachedSvg;
      applyMermaidDefaultWidth(wrapper, this.options.id);
      requestAnimationFrame(() => view.requestMeasure());
    } else {
      wrapper.classList.add('mw-mermaid-loading');
    }

    let renderTimer: number | undefined;
    const render = (): void => {
      if (renderTimer) {
        clearTimeout(renderTimer);
      }

      renderTimer = window.setTimeout(() => {
        renderTimer = undefined;
        void renderMermaid(wrapper, output, view, this.options.id, renderId, this.options.code);
      }, 0);
    };

    this.renderCallback = render;
    mountedRenderers.add(render);
    ensureThemeObserver();
    requestAnimationFrame(render);

    handle.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      wrapper.classList.add('mw-mermaid-resizing');

      const startX = event.clientX;
      const storedWidth = resizedMermaidWidths.get(this.options.id);
      const visibleWidth = wrapper.getBoundingClientRect().width;
      const startWidth = storedWidth ?? (visibleWidth || getMermaidDefaultWidth(wrapper));
      let measureFrame: number | undefined;

      const requestMeasuredResize = (): void => {
        if (measureFrame !== undefined) {
          return;
        }

        measureFrame = requestAnimationFrame(() => {
          measureFrame = undefined;
          view.requestMeasure();
        });
      };

      const applyResizeWidth = (clientX: number): void => {
        const nextWidth = normalizeMermaidWidth(Math.round(startWidth + clientX - startX), getMermaidAvailableWidth(wrapper));
        resizedMermaidWidths.set(this.options.id, nextWidth);
        wrapper.style.width = `${nextWidth}px`;
        requestMeasuredResize();
      };

      const onMove = (moveEvent: MouseEvent): void => {
        applyResizeWidth(moveEvent.clientX);
      };

      const onUp = (upEvent: MouseEvent): void => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        applyResizeWidth(upEvent.clientX);
        wrapper.classList.remove('mw-mermaid-resizing');
        hideMermaidResizeHandlesUntilPointerLeaves();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    toggle.addEventListener('mousedown', stopMouseEvent);
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({ selection: { anchor: getMermaidFrom(wrapper, this.options.from) } });
    });

    wrapper.addEventListener('mousedown', (event) => {
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0 || mouseEvent.target === handle || mouseEvent.target === toggle) {
        return;
      }

      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      view.focus();
      view.dispatch({
        selection: { anchor: getMermaidFrom(wrapper, this.options.from), head: getMermaidTo(wrapper, this.options.to) },
        scrollIntoView: true
      });
    });

    return wrapper;
  }

  public destroy(): void {
    if (this.renderCallback) {
      mountedRenderers.delete(this.renderCallback);
      this.renderCallback = undefined;
    }
  }

  public ignoreEvent(): boolean {
    return true;
  }
}

async function renderMermaid(
  wrapper: HTMLElement,
  container: HTMLElement,
  view: EditorView,
  id: string,
  renderId: string,
  code: string
): Promise<void> {
  try {
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDarkTheme() ? 'dark' : 'default',
      htmlLabels: false,
      flowchart: {
        htmlLabels: false,
        useMaxWidth: false
      }
    });

    const result = await mermaid.render(renderId, code);
    const svg = extractMermaidStyles(result.svg);
    const sanitizedSvg = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_ATTR: ['style']
    });
    renderedMermaidCache.set(getMermaidCacheKey(renderId), sanitizedSvg);
    container.innerHTML = sanitizedSvg;
    wrapper.classList.remove('mw-mermaid-loading');
    applyMermaidDefaultWidth(wrapper, id);
    view.requestMeasure();
  } catch (error) {
    container.replaceChildren(renderMermaidError(code, error));
    wrapper.classList.remove('mw-mermaid-loading');
    applyMermaidDefaultWidth(wrapper, id);
    view.requestMeasure();
  }
}

function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import(window.markdownWeaveAssets.mermaidModule).then(
    (module: MermaidModule) => module.default
  );
  return mermaidPromise;
}

function extractMermaidStyles(svg: string): string {
  return svg.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, css: string) => {
    appendMermaidStyle(css);
    return '';
  });
}

function appendMermaidStyle(css: string): void {
  if (css.trim().length === 0) {
    return;
  }

  const style = document.createElement('style');
  style.id = `mw-mermaid-style-${mermaidStyleIndex++}`;
  const nonce = document.querySelector<HTMLMetaElement>('meta[name="markdownweave-style-nonce"]')?.content;
  if (nonce) {
    style.setAttribute('nonce', nonce);
  }
  style.textContent = css;
  document.head.appendChild(style);
}

function renderMermaidError(code: string, error: unknown): HTMLElement {
  const wrapper = document.createElement('pre');
  wrapper.className = 'mw-mermaid-error';
  const message = error instanceof Error ? error.message : 'Mermaid diagram could not be rendered.';
  wrapper.textContent = `${message}\n\n${code}`;
  return wrapper;
}

function ensureThemeObserver(): void {
  if (themeObserver && markdownThemeObserver) {
    return;
  }

  themeObserver = new MutationObserver(rerenderIfThemeChanged);
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  markdownThemeObserver = new MutationObserver(rerenderIfThemeChanged);
  markdownThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mw-theme'] });
}

function rerenderIfThemeChanged(): void {
  const nextThemeIsDark = isDarkTheme();
  if (nextThemeIsDark === observedThemeIsDark) {
    return;
  }

  observedThemeIsDark = nextThemeIsDark;
  mountedRenderers.forEach((render) => render());
}

function isDarkTheme(): boolean {
  const markdownTheme = document.documentElement.getAttribute('data-mw-theme');
  if (markdownTheme === 'dark') {
    return true;
  }
  if (markdownTheme === 'light' || markdownTheme === 'sepia') {
    return false;
  }

  return !document.body.classList.contains('vscode-light');
}

function getMermaidCacheKey(id: string): string {
  return `${isDarkTheme() ? 'dark' : 'light'}:${id}`;
}

function getMermaidRenderId(options: MermaidWidgetOptions): string {
  return `mw-mermaid-${options.id}-${options.from}-${options.to}`;
}

function applyStoredMermaidWidth(wrapper: HTMLElement, id: string): void {
  const width = resizedMermaidWidths.get(id);
  if (width) {
    wrapper.style.width = `${normalizeMermaidWidth(width, getMermaidAvailableWidth(wrapper))}px`;
  }
}

function setMermaidPositionData(wrapper: HTMLElement, from: number, to: number): void {
  wrapper.dataset.mermaidFrom = String(from);
  wrapper.dataset.mermaidTo = String(to);
}

function getMermaidFrom(wrapper: HTMLElement, fallback: number): number {
  const parsed = Number(wrapper.dataset.mermaidFrom);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getMermaidTo(wrapper: HTMLElement, fallback: number): number {
  const parsed = Number(wrapper.dataset.mermaidTo);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function applyMermaidDefaultWidth(wrapper: HTMLElement, id: string): void {
  const resizedWidth = resizedMermaidWidths.get(id);
  if (resizedWidth) {
    wrapper.style.width = `${normalizeMermaidWidth(resizedWidth, getMermaidAvailableWidth(wrapper))}px`;
    return;
  }

  wrapper.style.width = `${getMermaidDefaultWidth(wrapper)}px`;
}

function getMermaidDefaultWidth(wrapper: HTMLElement): number {
  const svg = wrapper.querySelector<SVGSVGElement>('svg');
  const viewBox = svg?.getAttribute('viewBox')?.split(/\s+/).map(Number);
  const viewBoxWidth = viewBox && viewBox.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : undefined;
  const viewBoxHeight = viewBox && viewBox.length === 4 && Number.isFinite(viewBox[3]) ? viewBox[3] : undefined;

  if (!viewBoxWidth || !viewBoxHeight) {
    return 560;
  }

  const aspectRatio = viewBoxWidth / viewBoxHeight;
  if (aspectRatio < 1) {
    return normalizeMermaidWidth(Math.min(520, Math.max(360, viewBoxWidth)), getMermaidAvailableWidth(wrapper));
  }

  if (aspectRatio > 1.45) {
    return normalizeMermaidWidth(Math.min(760, Math.max(520, viewBoxWidth)), getMermaidAvailableWidth(wrapper));
  }

  return normalizeMermaidWidth(Math.min(640, Math.max(440, viewBoxWidth)), getMermaidAvailableWidth(wrapper));
}

function getMermaidAvailableWidth(wrapper: HTMLElement): number {
  const candidates = [
    wrapper.parentElement?.clientWidth,
    wrapper.parentElement?.getBoundingClientRect().width,
    wrapper.closest<HTMLElement>('.cm-content')?.clientWidth,
    wrapper.closest<HTMLElement>('.cm-content')?.getBoundingClientRect().width
  ].filter((width): width is number => typeof width === 'number' && Number.isFinite(width) && width >= MIN_MERMAID_WIDTH);

  return candidates.length > 0 ? Math.min(...candidates) : MAX_MERMAID_WIDTH;
}

function normalizeMermaidWidth(width: number, availableWidth = MAX_MERMAID_WIDTH): number {
  const upperBound = Math.max(MIN_MERMAID_WIDTH, Math.min(MAX_MERMAID_WIDTH, availableWidth));
  return Math.max(MIN_MERMAID_WIDTH, Math.min(upperBound, width));
}

function stopMouseEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}
