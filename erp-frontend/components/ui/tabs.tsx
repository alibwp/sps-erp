"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tabs({ tabs, className }: { tabs: { label: string; content: ReactNode }[]; className?: string }) {
  const [active, setActive] = useState(0);
  const baseId = useId();

  return (
    <div className={cn("grid gap-6", className)}>
      <div role="tablist" className="flex w-full gap-1 overflow-x-auto border-b">
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            id={`${baseId}-tab-${index}`}
            aria-selected={active === index}
            aria-controls={`${baseId}-panel-${index}`}
            onClick={() => setActive(index)}
            className={cn(
              "-mb-px min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors",
              active === index
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.label}
          role="tabpanel"
          id={`${baseId}-panel-${index}`}
          aria-labelledby={`${baseId}-tab-${index}`}
          hidden={active !== index}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
