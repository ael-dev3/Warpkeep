import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

type ElementRef<T extends HTMLElement> = RefObject<T | null>;

function getFocusableElements(container: HTMLElement) {
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((element) => (
    !element.hidden
    && element.getAttribute('aria-hidden') !== 'true'
    && element.getAttribute('tabindex') !== '-1'
    && !element.closest('[inert]')
  ));

  // Native tab navigation treats a named radio group as one stop. Mirror that
  // behavior when we move focus into the dialog or wrap at its boundary.
  return candidates.filter((element) => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio') {
      return true;
    }
    if (!element.name) return true;

    const group = candidates.filter((candidate) => (
      candidate instanceof HTMLInputElement
      && candidate.type === 'radio'
      && candidate.name === element.name
      && candidate.form === element.form
    )) as HTMLInputElement[];
    const checked = group.find((radio) => radio.checked);
    return checked ? checked === element : group[0] === element;
  });
}

export type ModalFocusBoundaryOptions<T extends HTMLElement> = Readonly<{
  dialogRef: ElementRef<T>;
  initialFocusRef: ElementRef<HTMLElement>;
  onEscape: () => void;
}>;

/**
 * Gives a custom modal the keyboard boundary supplied by a native dialog:
 * initial focus, Escape dismissal, and forward/reverse Tab containment.
 */
export function useModalFocusBoundary<T extends HTMLElement>({
  dialogRef,
  initialFocusRef,
  onEscape
}: ModalFocusBoundaryOptions<T>) {
  useEffect(() => {
    initialFocusRef.current?.focus({ preventScroll: true });
  }, [initialFocusRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onEscape();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        initialFocusRef.current?.focus({ preventScroll: true });
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      // Programmatically focused headings are intentionally outside the tab
      // order. Treat them (and any escaped focus) as an entry boundary.
      if (
        !dialog.contains(activeElement)
        || !focusableElements.includes(activeElement as HTMLElement)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [dialogRef, initialFocusRef, onEscape]);
}
