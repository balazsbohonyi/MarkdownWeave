import { EditorView, WidgetType } from '@codemirror/view';

export class CheckboxWidget extends WidgetType {
  public constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly to: number
  ) {
    super();
  }

  public toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'mw-checkbox';
    input.checked = this.checked;
    input.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Mark task complete');

    input.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    input.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? '[ ]' : '[x]'
        },
        selection: { anchor: this.to }
      });
    });

    return input;
  }

  public ignoreEvent(): boolean {
    return false;
  }
}
