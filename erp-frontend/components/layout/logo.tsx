import { cn } from "@/lib/utils";

/** The SPS ERP mark: a shield with an open book, drawn inline. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border bg-primary text-primary-foreground",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6l-8-3Z" />
        <path d="M8 10.5c1.6-.6 2.9-.4 4 .6 1.1-1 2.4-1.2 4-.6v5c-1.6-.6-2.9-.4-4 .6-1.1-1-2.4-1.2-4-.6v-5Z" />
        <path d="M12 11.1v5" />
      </svg>
    </span>
  );
}

export const APP_NAME = "SPS ERP";
