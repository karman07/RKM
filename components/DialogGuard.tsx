'use client';
import { useEffect } from 'react';

const MESSAGE = 'You have unsaved changes in this dialog. Discard them and close?';

/** The outermost `fixed inset-0` ancestor — the overlay / modal / drawer shell an element lives in. */
function findOverlay(el: Element | null): HTMLElement | null {
  let found: HTMLElement | null = null;
  for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    const c = typeof n.className === 'string' ? n.className : '';
    if (/(^|\s)fixed(\s|$)/.test(c) && /(^|\s)inset-0(\s|$)/.test(c)) found = n;
  }
  return found;
}

/** A click on bare backdrop / dead space around a dialog panel (the usual click-outside-to-close). */
function isBackdropClick(t: HTMLElement, overlay: HTMLElement): boolean {
  if (t === overlay) return true;
  const c = typeof t.className === 'string' ? t.className : '';
  return t.children.length === 0 && /(inset-0|bg-black|bg-slate-900|backdrop-blur)/.test(c);
}

function isDismissButton(t: HTMLElement): boolean {
  const btn = t.closest('button');
  if (!btn) return false;
  if (btn.hasAttribute('data-dialog-close')) return true;
  const label = (btn.textContent ?? '').trim().toLowerCase();
  return label === 'cancel' || label === 'close' || label === 'discard';
}

/**
 * App-wide protection against losing a half-filled dialog by accident.
 *
 * Once someone has typed into / changed a field inside a modal or side panel, clicking the dark
 * backdrop, pressing Escape, or hitting Cancel / Close asks for confirmation first — and so does
 * reloading or leaving the page. A dialog that has not been touched closes instantly as before,
 * and a dialog that closes itself after a successful save never asks (nothing is intercepted).
 *
 * Mounted once in the root layout; it works by watching events, so individual dialogs need no changes.
 */
export default function DialogGuard() {
  useEffect(() => {
    const dirty = new Set<HTMLElement>();
    const live = () => { dirty.forEach(el => { if (!el.isConnected) dirty.delete(el); }); return dirty; };

    function onInput(e: Event) {
      if (!e.isTrusted) return;
      const t = e.target as HTMLElement | null;
      if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)) return;
      if (t instanceof HTMLInputElement && (t.type === 'search' || t.type === 'hidden')) return;
      if (/search|filter/i.test((t as HTMLInputElement).placeholder ?? '')) return; // lookups aren't work worth protecting
      const overlay = findOverlay(t);
      if (overlay) dirty.add(overlay);
    }

    function onClick(e: MouseEvent) {
      if (!e.isTrusted) return; // our own re-dispatched click after the user confirmed
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const overlay = findOverlay(t);
      if (!overlay || !live().has(overlay)) return;
      if (!isBackdropClick(t, overlay) && !isDismissButton(t)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (window.confirm(MESSAGE)) {
        dirty.delete(overlay);
        t.click();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!e.isTrusted || e.key !== 'Escape' || live().size === 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (window.confirm(MESSAGE)) {
        const top = Array.from(dirty).pop();
        if (top) dirty.delete(top);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
    }

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (live().size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    }

    window.addEventListener('input', onInput, true);
    window.addEventListener('change', onInput, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('input', onInput, true);
      window.removeEventListener('change', onInput, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  return null;
}
