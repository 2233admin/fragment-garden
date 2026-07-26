"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function listFocusableElements(dialog: HTMLDialogElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.closest("[inert]") === null &&
      element.getClientRects().length > 0,
  );
}

function canRestoreFocus(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest("[inert]") !== null) return false;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  const ownerDialog = element.closest("dialog");
  return ownerDialog === null || ownerDialog.open;
}

type ModalDialogProps = {
  children: ReactNode;
  className?: string;
  describedBy?: string;
  isOpen: boolean;
  isPending?: boolean;
  labelledBy: string;
  onRequestClose: () => void;
  role?: "dialog" | "alertdialog";
};

export function ModalDialog({
  children,
  className,
  describedBy,
  isOpen,
  isPending = false,
  labelledBy,
  onRequestClose,
  role = "dialog",
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastExternalFocusRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const restoreFocus = useCallback((): void => {
    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    if (previousFocus !== null && canRestoreFocus(previousFocus)) {
      previousFocus.focus();
    }
  }, []);

  useEffect(() => {
    const rememberExternalFocus = (event: FocusEvent): void => {
      const dialog = dialogRef.current;
      const target = event.target;
      if (
        dialog !== null &&
        !dialog.open &&
        target instanceof HTMLElement &&
        target !== document.body &&
        !dialog.contains(target)
      ) {
        lastExternalFocusRef.current = target;
      }
    };

    document.addEventListener("focusin", rememberExternalFocus, true);
    return () => document.removeEventListener("focusin", rememberExternalFocus, true);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog === null) {
      return;
    }

    if (isOpen && !dialog.open) {
      const activeElement = document.activeElement;
      previousFocusRef.current =
        activeElement instanceof HTMLElement &&
        activeElement !== document.body &&
        !dialog.contains(activeElement)
          ? activeElement
          : lastExternalFocusRef.current;
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
      restoreFocus();
    }
  }, [isOpen, restoreFocus]);

  useEffect(
    () => () => {
      restoreFocus();
    },
    [restoreFocus],
  );

  function keepFocusInsideDialog(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== "Tab" || event.defaultPrevented) return;
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;

    const focusableElements = listFocusableElements(event.currentTarget);
    if (focusableElements.length === 0) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      return;
    }

    const activeElement = document.activeElement;
    const activeIndex =
      activeElement instanceof HTMLElement ? focusableElements.indexOf(activeElement) : -1;
    const shouldCycleBackward = event.shiftKey && activeIndex <= 0;
    const shouldCycleForward = !event.shiftKey && activeIndex === focusableElements.length - 1;
    const shouldRecoverFocus = activeIndex === -1;
    if (!shouldCycleBackward && !shouldCycleForward && !shouldRecoverFocus) return;

    event.preventDefault();
    event.stopPropagation();
    const target = event.shiftKey
      ? focusableElements[focusableElements.length - 1]
      : focusableElements[0];
    target?.focus();
  }

  return (
    <dialog
      aria-describedby={describedBy}
      aria-labelledby={labelledBy}
      className={`${className ?? ""} [&:not([open])]:hidden`}
      onCancel={(event) => {
        event.preventDefault();
        // Nested dialogs can be rendered through a React portal while remaining
        // in the same React event tree. Keep their cancellation local so an
        // inner disclosure/preview cannot close its parent dialog.
        event.stopPropagation();

        if (!isPending) {
          onRequestClose();
        }
      }}
      onClose={(event) => {
        event.stopPropagation();
        restoreFocus();
        if (isOpen && !isPending) {
          onRequestClose();
        }
      }}
      onKeyDown={keepFocusInsideDialog}
      ref={dialogRef}
      role={role}
      tabIndex={-1}
    >
      {children}
    </dialog>
  );
}
