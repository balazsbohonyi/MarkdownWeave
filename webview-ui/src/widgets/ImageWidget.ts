import { EditorView, WidgetType } from '@codemirror/view';
import { resolveImageUri } from '../bridge';

export type ImageWidgetOptions = {
  alt: string;
  src: string;
  raw: string;
  from: number;
  to: number;
  width?: number;
  height?: number;
};

const remoteUriPattern = /^(?:https?:|data:|vscode-resource:|vscode-webview-resource:)/i;

export class ImageWidget extends WidgetType {
  public constructor(private readonly options: ImageWidgetOptions) {
    super();
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'mw-image-widget';
    wrapper.contentEditable = 'false';

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
    placeholder.textContent = this.options.alt || this.options.src;

    image.addEventListener('error', () => {
      image.replaceWith(placeholder);
    });

    const setImageSrc = (uri: string | undefined): void => {
      if (!uri) {
        image.replaceWith(placeholder);
        return;
      }

      image.src = uri;
    };

    if (remoteUriPattern.test(this.options.src)) {
      setImageSrc(this.options.src);
    } else {
      resolveImageUri(this.options.src, setImageSrc);
    }

    const handle = document.createElement('span');
    handle.className = 'mw-image-resize-handle';
    handle.setAttribute('aria-hidden', 'true');

    handle.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();

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

        const nextWidth = Math.max(24, image.width);
        const nextHeight = Math.max(24, image.height);

        view.dispatch({
          changes: {
            from: this.options.from,
            to: this.options.to,
            insert: `![${this.options.alt}](${this.options.src} =${nextWidth}x${nextHeight})`
          },
          selection: { anchor: this.options.from }
        });
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    wrapper.append(image, handle);
    return wrapper;
  }

  public ignoreEvent(): boolean {
    return false;
  }
}
