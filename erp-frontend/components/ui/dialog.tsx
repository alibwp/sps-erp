"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A modal built on the native <dialog>, which handles focus and Escape. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/50 open:animate-pop-in",
        className,
      )}
    >
      {open && (
        <div className="grid gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1.5">
              <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </div>
          {children}
          {footer && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  destructive = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
