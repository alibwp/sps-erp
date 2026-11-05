import type { ReactNode } from "react";
import { APP_NAME, Logo } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui/button";

/** Full-page error layout shared by the 404 and error pages. */
export function ErrorScreen({
  code,
  title,
  description,
  children,
}: {
  code: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 px-4 text-center">
      <Logo className="size-12 rounded-xl" />
      <div className="flex items-center gap-4">
        <span className="text-4xl font-semibold tabular-nums tracking-tight">{code}</span>
        <span className="h-10 w-px bg-border" aria-hidden />
        <h1 className="text-left text-lg font-medium">{title}</h1>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
        {children}
      </div>
      <p className="text-xs text-muted-foreground">{APP_NAME}</p>
    </main>
  );
}
