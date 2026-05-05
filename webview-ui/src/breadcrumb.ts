import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { HeadingItem } from './headings';

const HOVER_DELAY_MS = 1000;
const VIEWPORT_GAP = 4;

export class Breadcrumb {
  private headings: HeadingItem[] = [];
  private cursorLine = 1;
  private activeDropdown: HTMLElement | null = null;
  private hoverTimers = new Set<number>();

  constructor(
    private readonly container: HTMLElement,
    private readonly view: EditorView
  ) {
    // Dismiss any open dropdown on click outside
    document.addEventListener('click', this.onDocumentClick, true);

    // Map vertical wheel to horizontal scroll
    container.addEventListener('wheel', (e) => {
      if (e.deltaX !== 0) {
        return; // already horizontal, let it pass through
      }
      if (e.deltaY !== 0) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  update(headings: HeadingItem[], cursorLine: number): void {
    this.headings = headings;
    this.cursorLine = cursorLine;
    this.render();
  }

  destroy(): void {
    document.removeEventListener('click', this.onDocumentClick, true);
    document.body.classList.remove('mw-breadcrumb-hidden');
    this.container.hidden = false;
    this.clearHoverTimers();
    this.closeDropdown();
  }

  private render(): void {
    this.clearHoverTimers();
    this.closeDropdown();
    this.container.textContent = '';
    this.setVisible(this.headings.length > 0);
    if (this.headings.length === 0) {
      return;
    }

    const ancestors = this.computeAncestors();
    if (ancestors.length === 0) {
      return;
    }

    ancestors.forEach((heading, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'bc-sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '/';
        this.container.appendChild(sep);
      }

      const segment = this.createSegment(heading, i, ancestors);
      this.container.appendChild(segment);
    });
  }

  private createSegment(heading: HeadingItem, index: number, ancestors: HeadingItem[]): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'bc-segment';

    const label = document.createElement('button');
    label.className = 'bc-label';
    label.textContent = heading.text;
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearHoverTimers();
      this.closeDropdown();
      this.scrollToHeading(heading);
    });

    wrap.appendChild(label);

    // Hover-after-1s opens dropdown
    const siblings = this.computeSiblings(heading, index, ancestors);
    if (siblings.length > 0) {
      let hoverTimer: number | undefined;

      wrap.addEventListener('mouseenter', () => {
        hoverTimer = window.setTimeout(() => {
          this.hoverTimers.delete(hoverTimer as number);
          hoverTimer = undefined;
          if (!this.activeDropdown && wrap.isConnected) {
            this.openDropdown(wrap, siblings);
          }
        }, HOVER_DELAY_MS);
        this.hoverTimers.add(hoverTimer);
      });

      wrap.addEventListener('mouseleave', () => {
        if (hoverTimer !== undefined) {
          window.clearTimeout(hoverTimer);
          this.hoverTimers.delete(hoverTimer);
          hoverTimer = undefined;
        }
      });
    }

    return wrap;
  }

  private setVisible(visible: boolean): void {
    this.container.hidden = !visible;
    document.body.classList.toggle('mw-breadcrumb-hidden', !visible);
  }

  private openDropdown(anchor: HTMLElement, siblings: HeadingItem[]): void {
    if (!anchor.isConnected) {
      return;
    }

    const dropdown = document.createElement('ul');
    dropdown.className = 'bc-dropdown';

    siblings.forEach((sibling) => {
      const item = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'bc-dropdown-item';
      btn.textContent = sibling.text;
      if (sibling.line === this.activeAncestor()?.line) {
        btn.classList.add('bc-dropdown-item-active');
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeDropdown();
        this.scrollToHeading(sibling);
      });
      item.appendChild(btn);
      dropdown.appendChild(item);
    });

    const rect = anchor.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const top = Math.max(containerRect.bottom, rect.bottom, 0) + 2;
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${Math.max(VIEWPORT_GAP, rect.left)}px`;

    document.body.appendChild(dropdown);

    const dr = dropdown.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - dr.width - VIEWPORT_GAP);
    dropdown.style.left = `${Math.min(Math.max(VIEWPORT_GAP, rect.left), maxLeft)}px`;

    this.activeDropdown = dropdown;
  }

  private closeDropdown(): void {
    if (this.activeDropdown) {
      this.activeDropdown.remove();
      this.activeDropdown = null;
    }
  }

  private clearHoverTimers(): void {
    for (const timer of this.hoverTimers) {
      window.clearTimeout(timer);
    }
    this.hoverTimers.clear();
  }

  private onDocumentClick = (): void => {
    this.clearHoverTimers();
    this.closeDropdown();
  };

  private activeAncestor(): HeadingItem | undefined {
    const ancestors = this.computeAncestors();
    return ancestors[ancestors.length - 1];
  }

  private scrollToHeading(heading: HeadingItem): void {
    const line = this.view.state.doc.lineAt(heading.from);
    this.view.dispatch({
      selection: EditorSelection.cursor(line.to),
      effects: EditorView.scrollIntoView(heading.from, { y: 'start', yMargin: this.getScrollMargin() })
    });
    this.keepPositionBelowBreadcrumb(heading.from);
    this.view.focus();
  }

  private keepPositionBelowBreadcrumb(position: number): void {
    requestAnimationFrame(() => {
      const targetTop = this.getScrollMargin();
      if (targetTop <= 0) {
        return;
      }

      const coords = this.view.coordsAtPos(position);
      if (!coords || coords.top >= targetTop) {
        return;
      }

      this.view.scrollDOM.scrollTop = Math.max(0, this.view.scrollDOM.scrollTop - (targetTop - coords.top));
    });
  }

  private getScrollMargin(): number {
    const breadcrumbBottom = this.container.getBoundingClientRect().bottom;
    const maxMargin = Math.max(5, this.view.scrollDOM.clientHeight - 1);
    return Math.min(maxMargin, Math.max(5, Math.ceil((breadcrumbBottom + 1) * 1.5)));
  }

  /**
   * Walk backward from cursor to find the nearest heading of each level —
   * the "ancestor chain" from outermost (lowest number) to innermost.
   *
   * When cursor is above all headings, returns the first top-level heading
   * so the breadcrumb always shows something (unless document has no headings).
   */
  private computeAncestors(): HeadingItem[] {
    const byLevel = new Map<number, HeadingItem>();

    for (const h of this.headings) {
      if (h.line > this.cursorLine) {
        break;
      }
      byLevel.set(h.level, h);
    }

    if (byLevel.size === 0) {
      // Cursor is above all headings — show the first top-level heading as context
      if (this.headings.length === 0) {
        return [];
      }
      const topLevel = Math.min(...this.headings.map(h => h.level));
      const first = this.headings.find(h => h.level === topLevel);
      return first ? [first] : [];
    }

    // Determine the chain: find min level present, then keep only items
    // that form a coherent ancestor path (each level >= previous in the chain)
    const minLevel = Math.min(...byLevel.keys());
    const chain: HeadingItem[] = [];
    let lastLevel = 0;

    for (let lvl = minLevel; lvl <= 6; lvl++) {
      const h = byLevel.get(lvl);
      if (h && h.level > lastLevel) {
        chain.push(h);
        lastLevel = h.level;
      }
    }

    return chain;
  }

  /**
   * Compute siblings of a given ancestor at position `index` in the ancestor chain.
   * Siblings = headings at the same level that share the same parent section.
   */
  private computeSiblings(heading: HeadingItem, index: number, ancestors: HeadingItem[]): HeadingItem[] {
    const parent = index > 0 ? ancestors[index - 1] : undefined;
    const parentLine = parent?.line ?? 0;

    // Find the end of the parent section: the next heading of equal or lower level after parent
    let sectionEnd = Infinity;
    if (parent) {
      for (const h of this.headings) {
        if (h.line > parent.line && h.level <= parent.level) {
          sectionEnd = h.line;
          break;
        }
      }
    }

    return this.headings.filter(
      (h) => h.level === heading.level && h.line > parentLine && h.line < sectionEnd
    );
  }
}
