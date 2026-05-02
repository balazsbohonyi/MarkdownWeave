import { EditorView, WidgetType } from '@codemirror/view';
import { toggleTableRaw } from '../decorations/blockWidgets';

export type TableAlignment = 'left' | 'center' | 'right' | undefined;

export type ParsedTable = {
  headers: string[];
  rows: string[][];
  alignments: TableAlignment[];
};

export class TableWidget extends WidgetType {
  public constructor(
    private readonly table: ParsedTable,
    private readonly from: number,
    private readonly to: number,
    private readonly selected: boolean
  ) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return (
      widget instanceof TableWidget &&
      widget.from === this.from &&
      widget.to === this.to &&
      widget.selected === this.selected &&
      JSON.stringify(widget.table) === JSON.stringify(this.table)
    );
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = this.selected ? 'mw-table-widget mw-table-widget-selected' : 'mw-table-widget';
    wrapper.contentEditable = 'false';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mw-table-toggle';
    toggle.textContent = '<>';
    toggle.title = 'Show table source';
    toggle.setAttribute('aria-label', 'Show table source');
    toggle.addEventListener('mousedown', stopMouseEvent);
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({ effects: toggleTableRaw.of({ from: this.from, to: this.to }) });
    });

    const table = document.createElement('table');
    table.className = 'mw-table';
    table.append(this.renderHead(), this.renderBody());

    wrapper.append(toggle, table);
    requestAnimationFrame(() => view.requestMeasure());
    wrapper.addEventListener('mousedown', (event) => {
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0 || mouseEvent.target === toggle) {
        return;
      }

      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      view.focus();
      view.dispatch({ selection: { anchor: this.from, head: this.to }, scrollIntoView: true });
    });

    return wrapper;
  }

  public ignoreEvent(): boolean {
    return true;
  }

  private renderHead(): HTMLTableSectionElement {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    this.table.headers.forEach((header, index) => {
      const th = document.createElement('th');
      th.textContent = header;
      applyAlignment(th, this.table.alignments[index]);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    return thead;
  }

  private renderBody(): HTMLTableSectionElement {
    const tbody = document.createElement('tbody');
    this.table.rows.forEach((row) => {
      const tr = document.createElement('tr');
      this.table.headers.forEach((_header, index) => {
        const td = document.createElement('td');
        td.textContent = row[index] ?? '';
        applyAlignment(td, this.table.alignments[index]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    return tbody;
  }
}

export class TableRawToggleWidget extends WidgetType {
  public constructor(
    private readonly from: number,
    private readonly to: number
  ) {
    super();
  }

  public eq(widget: WidgetType): boolean {
    return widget instanceof TableRawToggleWidget && widget.from === this.from && widget.to === this.to;
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'mw-table-toggle-raw-slot';
    wrapper.contentEditable = 'false';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mw-table-toggle mw-table-toggle-raw';
    button.textContent = '<>';
    button.title = 'Render table';
    button.setAttribute('aria-label', 'Render table');
    button.contentEditable = 'false';
    button.addEventListener('mousedown', stopMouseEvent);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      view.dispatch({ effects: toggleTableRaw.of({ from: this.from, to: this.to }) });
    });
    wrapper.appendChild(button);
    return wrapper;
  }

  public ignoreEvent(): boolean {
    return true;
  }
}

function applyAlignment(cell: HTMLTableCellElement, alignment: TableAlignment): void {
  if (alignment) {
    cell.classList.add(`mw-table-align-${alignment}`);
  }
}

function stopMouseEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}
