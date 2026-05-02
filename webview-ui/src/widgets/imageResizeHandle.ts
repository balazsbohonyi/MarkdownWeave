const hiddenAfterResizeClass = 'mw-image-resize-handle-hidden-after-resize';
const mermaidHiddenAfterResizeClass = 'mw-mermaid-resize-handle-hidden-after-resize';

export function hideImageResizeHandlesUntilPointerLeaves(): void {
  hideResizeHandlesUntilPointerLeaves(hiddenAfterResizeClass, '.mw-image-widget');
}

export function hideMermaidResizeHandlesUntilPointerLeaves(): void {
  hideResizeHandlesUntilPointerLeaves(mermaidHiddenAfterResizeClass, '.mw-mermaid');
}

function hideResizeHandlesUntilPointerLeaves(hiddenClass: string, widgetSelector: string): void {
  document.body.classList.add(hiddenClass);

  const cleanup = (): void => {
    document.body.classList.remove(hiddenClass);
    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('blur', cleanup);
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!(event.target instanceof Element) || !event.target.closest(widgetSelector)) {
      cleanup();
    }
  };

  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('blur', cleanup);
}
