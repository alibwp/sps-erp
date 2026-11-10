"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CloseContext = createContext<() => void>(() => {});

type Props = {
  /** Content of the trigger button. */
  trigger: ReactNode;
  triggerLabel?: string;
  triggerClassName?: string;
  triggerVariant?: "ghost" | "outline";
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
};

export function DropdownMenu({
  trigger,
  triggerLabel,
  triggerClassName,
  triggerVariant = "ghost",
  align = "end",
  className,
  children,
}: Props) {
  // The menu is positioned against the viewport so scrolling table
  // containers and the sidebar never clip it.
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const open = position !== null;

  const toggle = () => {
    if (open || !triggerRef.current) {
      setPosition(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const openUpwards = rect.bottom > window.innerHeight - 240;
    setPosition({
      position: "fixed",
      ...(openUpwards ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      ...(align === "end" ? { right: Math.max(8, window.innerWidth - rect.right) } : { left: Math.max(8, rect.left) }),
    });
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={buttonVariants({ variant: triggerVariant, size: "none", className: triggerClassName })}
        onClick={toggle}
      >
        {trigger}
      </button>
      {open && (
        <CloseContext.Provider value={() => setPosition(null)}>
          <div
            id={menuId}
            role="menu"
            style={position}
            className={cn(
              "animate-pop-in z-[120] min-w-44 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg",
              className,
            )}
          >
            {children}
          </div>
        </CloseContext.Provider>
      )}
    </div>
  );
}

const itemClasses =
  "flex w-full select-none items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent [&_svg]:size-4 [&_svg]:shrink-0";

export function DropdownMenuItem({
  className,
  destructive,
  onClick,
  ...props
}: ComponentProps<"button"> & { destructive?: boolean }) {
  const close = useContext(CloseContext);
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(itemClasses, destructive && "text-destructive", className)}
      onClick={(event) => {
        onClick?.(event);
        close();
      }}
      {...props}
    />
  );
}

export function DropdownMenuLink({ className, ...props }: ComponentProps<typeof Link>) {
  const close = useContext(CloseContext);
  return <Link role="menuitem" className={cn(itemClasses, className)} onClick={close} {...props} />;
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-border" />;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)} {...props} />;
}
