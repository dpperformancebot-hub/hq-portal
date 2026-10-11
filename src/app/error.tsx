"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App error:", error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <ErrorState onRetry={reset} />
    </div>
  );
}
