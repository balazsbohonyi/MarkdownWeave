import { EditorView, WidgetType } from '@codemirror/view';
import { resolveImageUri } from '../bridge';
import { hideImageResizeHandlesUntilPointerLeaves } from './imageResizeHandle';

export type ImageWidgetOptions = {
  alt: string;
  src: string;
  raw: string;
  from: number;
  to: number;
  block?: boolean;
  width?: number;
  height?: number;
};

const remoteUriPattern = /^(?:https?:|data:|vscode-resource:|vscode-webview-resource:)/i;

export class ImageWidget extends WidgetType {
  public constructor(private readonly options: ImageWidgetOptions) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return (
      widget instanceof ImageWidget &&
      widget.options.alt === this.options.alt &&
      widget.options.src === this.options.src &&
      widget.options.raw === this.options.raw &&
      widget.options.from === this.options.from &&
      widget.options.to === this.options.to &&
      widget.options.block === this.options.block &&
      widget.options.width === this.options.width &&
      widget.options.height === this.options.height
    );
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement(this.options.block ? 'div' : 'span');
    wrapper.className = this.options.block ? 'mw-image-widget mw-image-widget-block' : 'mw-image-widget';
    wrapper.contentEditable = 'false';
    wrapper.dataset.imageFrom = String(this.options.from);
    wrapper.dataset.imageTo = String(this.options.to);

    const image = document.createElement('img');
    image.className = 'mw-image-preview';
    image.alt = this.options.alt;
    image.draggable = false;

    if (this.options.width) {
      image.width = this.options.width;
    }

    if (this.options.height) {
      image.height = this.options.height;
    }

    const placeholder = document.createElement('span');
    placeholder.className = 'mw-image-placeholder';
    placeholder.textContent = `"${getImageName(this.options.src)}" could not be found.`;
    let handle: HTMLSpanElement | undefined;

    const showPlaceholder = (): void => {
      wrapper.classList.add('mw-image-widget-missing');
      image.replaceWith(placeholder);
      handle?.remove();
    };

    image.addEventListener('error', showPlaceholder);

    const setImageSrc = (uri: string | undefined): void => {
      if (!uri) {
        showPlaceholder();
        return;
      }

      image.src = uri;
    };

    if (remoteUriPattern.test(this.options.src)) {
      setImageSrc(this.options.src);
    } else {
      resolveImageUri(this.options.src, setImageSrc);
    }

    handle = document.createElement('span');
    handle.className = 'mw-image-resize-handle';
    handle.setAttribute('aria-hidden', 'true');

    handle.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      wrapper.classList.add('mw-image-widget-resizing');

      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = image.naturalWidth > 0 ? image.clientWidth : this.options.width ?? 240;
      const startHeight = image.naturalHeight > 0 ? image.clientHeight : this.options.height ?? 160;

      const onMove = (moveEvent: MouseEvent): void => {
        const nextWidth = Math.max(24, Math.round(startWidth + moveEvent.clientX - startX));
        const nextHeight = Math.max(24, Math.round(startHeight + moveEvent.clientY - startY));
        image.width = nextWidth;
        image.height = nextHeight;
      };

      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        wrapper.classList.remove('mw-image-widget-resizing');
        hideImageResizeHandlesUntilPointerLeaves();

        const nextWidth = Math.max(24, image.width);
        const nextHeight = Math.max(24, image.height);

        view.dispatch({
          changes: {
            from: this.options.from,
            to: this.options.to,
            insert: toSizedImageHtml(this.options, nextWidth, nextHeight)
          },
          selection: { anchor: this.options.from }
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
      view.dispatch({
        selection: { anchor: this.options.from }
      });
    });

    wrapper.append(image, handle);
    return wrapper;
  }

  public ignoreEvent(): boolean {
    return true;
  }
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

function toSizedImageHtml(options: ImageWidgetOptions, width: number, height: number): string {
  return `<img src="${escapeHtmlAttribute(options.src)}" alt="${escapeHtmlAttribute(options.alt)}" width="${width}" height="${height}">`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
