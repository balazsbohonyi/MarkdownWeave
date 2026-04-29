import { EditorView, WidgetType } from '@codemirror/view';
import { toggleFrontmatterExpanded } from '../decorations/blockWidgets';

export class FrontmatterPillWidget extends WidgetType {
  public constructor(
    private readonly from: number,
    private readonly to: number
  ) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return widget instanceof FrontmatterPillWidget && widget.from === this.from && widget.to === this.to;
  }

  public toDOM(view: EditorView): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mw-frontmatter-pill';
    button.textContent = 'Frontmatter';
    button.contentEditable = 'false';
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({
        effects: toggleFrontmatterExpanded.of(true),
        selection: { anchor: this.from }
      });
    });
    return button;
  }

  public ignoreEvent(): boolean {
    return true;
  }
}
