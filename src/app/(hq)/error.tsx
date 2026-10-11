"use client";

import { useEffect } from "react";
import { Card, ErrorState } from "@/components/ui";

// Error boundary for every HQ screen. Renders inside the shell.
export default function HqError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Avoid logging full PII; record message only.
    console.error("HQ screen error:", error.message);
  }, [error]);

  return (
    <Card>
      <ErrorState message="This screen could not load. Try again, or head back to the dashboard." onRetry={reset} />
    </Card>
  );
}
