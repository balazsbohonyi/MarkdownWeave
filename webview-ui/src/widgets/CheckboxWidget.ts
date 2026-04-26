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
      event.stopPropagation();
    });

    input.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextSelection = Math.min(view.state.doc.length, this.to + 1);

      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? '[ ]' : '[x]'
        },
        selection: { anchor: nextSelection }
      });
    });

    return input;
  }

  public ignoreEvent(): boolean {
    return true;
  }
}
