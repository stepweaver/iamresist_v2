import { useEffect } from 'react';

export default function useModalFocusTrap(dialogRef, initialFocusRef) {
  useEffect(() => {
    const dialog = dialogRef?.current;
    if (!dialog) return;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const focusables = () =>
      Array.from(dialog.querySelectorAll(focusableSelector)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
      );

    const initial = initialFocusRef?.current || focusables()[0];
    initial?.focus?.();

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || active === dialog) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [dialogRef, initialFocusRef]);
}

