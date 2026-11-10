"use client";

import { ErrorScreen } from "@/components/error-screen";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorScreen code="500" title="Something went wrong" description="An unexpected error stopped this page from loading.">
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </ErrorScreen>
  );
}
