/**
 * ConfirmDialog — modal confirmation that traps focus, closes on Escape and restores focus
 * to the element that opened it.
 */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog(props: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { open, onCancel } = props;

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    const focusables = (): HTMLElement[] =>
      dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    // Focus lands on the safer "Cancel" action (the last focusable in the dialog).
    const initial = focusables();
    initial[initial.length - 1]?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog?.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-overlay">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        ref={dialogRef}
      >
        <h2 id="confirm-dialog-title">{props.title}</h2>
        <div className="dialog-body">{props.body}</div>
        <div className="btn-row">
          <button
            type="button"
            className={props.danger ? "btn btn-danger" : "btn btn-primary"}
            onClick={props.onConfirm}
            disabled={props.busy}
          >
            {props.busy ? "Working…" : props.confirmLabel}
          </button>
          <button type="button" className="btn" onClick={props.onCancel} disabled={props.busy}>
            {props.cancelLabel ?? "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
