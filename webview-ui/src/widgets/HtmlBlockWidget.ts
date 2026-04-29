import { EditorView, WidgetType } from '@codemirror/view';
import DOMPurify from 'dompurify';
import { resolveImageUri } from '../bridge';
import { hideImageResizeHandlesUntilPointerLeaves } from './imageResizeHandle';

const allowedTags = [
  'mark',
  'sup',
  'sub',
  'kbd',
  'abbr',
  'details',
  'summary',
  'div',
  'span',
  'table',
  'tr',
  'td',
  'th',
  'thead',
  'tbody',
  'br',
  'hr',
  'img'
];

export class HtmlBlockWidget extends WidgetType {
  public constructor(
    private readonly html: string,
    private readonly from: number
  ) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return widget instanceof HtmlBlockWidget && widget.html === this.html && widget.from === this.from;
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'mw-html-block';
    wrapper.contentEditable = 'false';
    wrapper.innerHTML = sanitizeHtml(this.html);

    if (wrapper.childNodes.length === 0 || (wrapper.textContent?.trim() === '' && !wrapper.querySelector('img'))) {
      wrapper.classList.add('mw-html-block-empty');
      wrapper.textContent = 'HTML removed by sanitizer.';
    } else {
      resolveLocalImages(wrapper, view);
    }
    requestAnimationFrame(() => view.requestMeasure());

    wrapper.addEventListener('mousedown', (event) => {
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0) {
        return;
      }

      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      view.focus();
      view.dispatch({ selection: { anchor: this.from } });
    });

    return wrapper;
  }

  public ignoreEvent(): boolean {
    return true;
  }
}

export class HtmlInlineWidget extends WidgetType {
  public constructor(
    private readonly html: string,
    private readonly from: number
  ) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return widget instanceof HtmlInlineWidget && widget.html === this.html && widget.from === this.from;
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'mw-html-inline-widget';
    wrapper.contentEditable = 'false';
    wrapper.innerHTML = sanitizeHtml(this.html);
    resolveLocalImages(wrapper, view);

    wrapper.addEventListener('mousedown', (event) => {
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0) {
        return;
      }

      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      view.focus();
      view.dispatch({ selection: { anchor: this.from } });
    });

    return wrapper;
  }

  public ignoreEvent(): boolean {
    return true;
  }
}

export class HtmlImageWidget extends WidgetType {
  public constructor(
    private readonly html: string,
    private readonly from: number,
    private readonly to: number,
    private readonly block = false
  ) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return (
      widget instanceof HtmlImageWidget &&
      widget.html === this.html &&
      widget.from === this.from &&
      widget.to === this.to &&
      widget.block === this.block
    );
  }

  public toDOM(view: EditorView): HTMLElement {
    const parsed = parseHtmlImage(this.html);
    const wrapper = document.createElement(this.block ? 'div' : 'span');
    wrapper.className = this.block ? 'mw-image-widget mw-image-widget-block' : 'mw-image-widget';
    wrapper.contentEditable = 'false';

    const image = document.createElement('img');
    image.className = 'mw-image-preview';
    image.alt = parsed.alt;
    image.draggable = false;

    if (parsed.width) {
      image.width = parsed.width;
    }

    if (parsed.height) {
      image.height = parsed.height;
    }

    const placeholder = document.createElement('span');
    placeholder.className = 'mw-image-placeholder';
    placeholder.textContent = `"${getImageName(parsed.src)}" could not be found.`;

    const handle = document.createElement('span');
    handle.className = 'mw-image-resize-handle';
    handle.setAttribute('aria-hidden', 'true');

    const showPlaceholder = (): void => {
      wrapper.classList.add('mw-image-widget-missing');
      image.replaceWith(placeholder);
      handle.remove();
      view.requestMeasure();
    };

    image.addEventListener('error', showPlaceholder);

    if (/^(?:https?:|data:)/i.test(parsed.src)) {
      image.src = parsed.src;
    } else {
      resolveImageUri(parsed.src, (uri) => {
        if (!uri) {
          showPlaceholder();
          return;
        }

        image.src = uri;
        view.requestMeasure();
      });
    }

    handle.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      wrapper.classList.add('mw-image-widget-resizing');

      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = image.naturalWidth > 0 ? image.clientWidth : parsed.width ?? 240;
      const startHeight = image.naturalHeight > 0 ? image.clientHeight : parsed.height ?? 160;

      const onMove = (moveEvent: MouseEvent): void => {
        image.width = Math.max(24, Math.round(startWidth + moveEvent.clientX - startX));
        image.height = Math.max(24, Math.round(startHeight + moveEvent.clientY - startY));
      };

      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        wrapper.classList.remove('mw-image-widget-resizing');
        hideImageResizeHandlesUntilPointerLeaves();

        const nextMarkup = updateImageDimensions(this.html, Math.max(24, image.width), Math.max(24, image.height));
        view.dispatch({
          changes: {
            from: this.from,
            to: this.to,
            insert: nextMarkup
          },
          selection: { anchor: this.from }
        });
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    wrapper.addEventListener('mousedown', (event) => {
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0 || mouseEvent.target === handle) {
        return;
      }

      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      view.focus();
      view.dispatch({ selection: { anchor: this.from } });
    });

    wrapper.append(image, handle);
    requestAnimationFrame(() => view.requestMeasure());
    return wrapper;
  }

  public ignoreEvent(): boolean {
    return true;
  }
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: ['src', 'alt', 'width', 'height', 'title', 'open'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'button', 'link', 'style'],
    FORBID_ATTR: ['style'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
  });
}

export function isHtmlImageMarkup(html: string): boolean {
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(html);
  const elements = Array.from(template.content.children);
  return elements.length === 1 && elements[0].tagName.toLowerCase() === 'img';
}

function resolveLocalImages(container: HTMLElement, view: EditorView): void {
  container.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
    const src = image.getAttribute('src') ?? '';
    if (/^(?:https?:|data:)/i.test(src)) {
      return;
    }

    resolveImageUri(src, (uri) => {
      if (uri) {
        image.src = uri;
        view.requestMeasure();
        return;
      }

      const placeholder = document.createElement('span');
      placeholder.className = 'mw-image-placeholder';
      placeholder.textContent = `"${getImageName(src)}" could not be found.`;
      image.replaceWith(placeholder);
      view.requestMeasure();
    });
  });
}

function getImageName(src: string): string {
  const withoutFragment = src.split('#', 1)[0];
  const withoutQuery = withoutFragment.split('?', 1)[0];
  const normalized = withoutQuery.replace(/\\/g, '/');
  const name = normalized.split('/').filter(Boolean).pop() ?? src;

  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function parseHtmlImage(html: string): { src: string; alt: string; width?: number; height?: number } {
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(html);
  const image = template.content.querySelector('img');
  const width = parseDimension(image?.getAttribute('width'));
  const height = parseDimension(image?.getAttribute('height'));

  return {
    src: image?.getAttribute('src') ?? '',
    alt: image?.getAttribute('alt') ?? '',
    width,
    height
  };
}

function updateImageDimensions(html: string, width: number, height: number): string {
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(html);
  const image = template.content.querySelector('img');
  if (!image) {
    return html;
  }

  image.setAttribute('width', String(width));
  image.setAttribute('height', String(height));
  const updated = image.outerHTML;
  return /<\/img\s*>/i.test(html) ? `${updated}</img>` : updated;
}

function parseDimension(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
