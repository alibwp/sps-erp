import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

// Screens and widgets whose backend does not exist yet still show sample data
// so the product can be demonstrated, but always say so: nothing on them is
// read from or saved to the server.

/** The banner at the top of a screen that shows sample data. */
export function DemoDataNotice({ className, what = "This screen" }: { className?: string; what?: string }) {
  return (
    <Alert tone="warning" icon={FlaskConical} title="Demo data" className={cn("mb-6", className)}>
      {what} is not connected to the server yet. What you see is sample data, and changes made here are not saved.
    </Alert>
  );
}

/** A small marker for one dashboard widget that shows sample data. */
export function SampleBadge() {
  return (
    <Badge tone="warning" title="Not connected to the server yet: sample data">
      Sample data
    </Badge>
  );
}
