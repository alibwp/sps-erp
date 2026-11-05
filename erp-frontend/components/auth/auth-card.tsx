import type { ReactNode } from "react";
import { APP_NAME, Logo } from "@/components/layout/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The centered card every sign-in screen uses, as in the reference. */
export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/30 px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-accent/60 to-transparent" aria-hidden />

      <main className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="size-16 rounded-2xl shadow-lg" />
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{APP_NAME}</p>
        </div>

        <Card className="w-full border-border/70 bg-card/95 shadow-xl shadow-black/5 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-2xl">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-6">{children}</CardContent>
        </Card>

        {footer && <div className="pt-5 text-center text-sm text-muted-foreground">{footer}</div>}
      </main>
    </div>
  );
}
