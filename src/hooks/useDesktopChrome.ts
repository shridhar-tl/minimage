import { useEffect } from 'react';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA']);

function isEditable(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  if (EDITABLE_TAGS.has(node.tagName)) return true;
  return node.isContentEditable === true;
}

/** Strips web-like browser behaviors so the app feels native. */
export function useDesktopChrome() {
  useEffect(() => {
    // Right-click: no browser menu, except inside real text fields (cut/copy/paste).
    const onContextMenu = (e: MouseEvent) => {
      if (!isEditable(e.target)) e.preventDefault();
    };
    // Ctrl/Cmd + scroll zoom.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    // Ctrl/Cmd + (+ / - / = / 0) zoom, and pinch-zoom gesture.
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
        e.preventDefault();
      }
    };
    const onGesture = (e: Event) => e.preventDefault();

    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('gesturestart', onGesture);

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('gesturestart', onGesture);
    };
  }, []);
}
