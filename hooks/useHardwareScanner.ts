'use client';
import { useEffect, useRef } from 'react';

interface Options {
  /** Turn the listener off (e.g. while a modal with its own scanner is open). Default true. */
  enabled?: boolean;
  /** Shortest burst of characters that counts as a scan. Default 4. */
  minLength?: number;
  /** Largest pause between two keystrokes of one scan, in ms — a human types far slower. Default 50. */
  maxGapMs?: number;
}

/**
 * Listens for a USB / Bluetooth barcode & QR scanner in "keyboard wedge" mode — the common
 * default, where the scanner types the code very fast and finishes with Enter (or Tab).
 * Works anywhere on the page, no input needs focus. Keystrokes that land in a text field are
 * left alone so normal typing and scanning into a search box still behave as before.
 *
 * `onScan` always sees the latest closure, so it is safe to pass an inline function.
 */
export function useHardwareScanner(onScan: (code: string) => void, options: Options = {}) {
  const { enabled = true, minLength = 4, maxGapMs = 50 } = options;
  const handlerRef = useRef(onScan);
  handlerRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let lastKeyTime = 0;
    let lastCode = '';
    let lastCodeTime = 0;

    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      if (now - lastKeyTime > maxGapMs) buffer = '';
      lastKeyTime = now;

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= minLength) {
          const code = buffer.trim();
          buffer = '';
          e.preventDefault();
          // Ignore the double-fire some scanners produce (Enter + Tab suffix, or a re-read).
          if (code === lastCode && now - lastCodeTime < 800) return;
          lastCode = code; lastCodeTime = now;
          handlerRef.current(code);
        } else {
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, minLength, maxGapMs]);
}
