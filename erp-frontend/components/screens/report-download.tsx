"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ReportDownload({ title, children }: { title: string; children: ReactNode }) {
  const toast = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => toast({ title: `${title} is being prepared`, description: "Reports download once the backend API is connected." })}
    >
      {children}
    </Button>
  );
}
