import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/misc";
import { SchoolToday } from "@/components/layout/school-today";
import { cn } from "@/lib/utils";

/**
 * The heading band every signed-in page opens with: title, actions, today's
 * date and breadcrumbs, followed by the page body.
 */
export function Page({
  title,
  breadcrumbs,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <div className="border-b bg-background/95 px-4 py-5 md:px-8" data-print-hide>
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="min-w-0 max-w-full break-words text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
            <div className="flex flex-wrap items-center gap-3">
              {actions}
              <SchoolToday />
            </div>
          </div>
          {breadcrumbs && <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, ...breadcrumbs]} />}
        </div>
      </div>
      <div id="main" tabIndex={-1} className={cn("mx-auto w-full max-w-screen-2xl p-4 outline-none md:p-8", className)}>
        {children}
      </div>
    </>
  );
}
