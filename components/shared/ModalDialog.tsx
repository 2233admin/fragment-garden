"use client";

import { useEffect, useRef, type ReactNode } from "react";

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

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog === null) {
      return;
    }

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      aria-describedby={describedBy}
      aria-labelledby={labelledBy}
      className={className}
      onCancel={(event) => {
        event.preventDefault();

        if (!isPending) {
          onRequestClose();
        }
      }}
      onClose={() => {
        if (isOpen && !isPending) {
          onRequestClose();
        }
      }}
      ref={dialogRef}
      role={role}
    >
      {children}
    </dialog>
  );
}
