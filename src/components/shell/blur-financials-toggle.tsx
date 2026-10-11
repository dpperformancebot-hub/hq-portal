"use client";

// Eye toggle that hides/shows every dollar figure on screen (see
// SensitiveProvider + <Sensitive>). Drop it in any screen header; it reads the
// shared context, so the same click hides financials everywhere at once.

import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { useSensitive } from "@/components/sensitive-provider";

export function BlurFinancialsToggle() {
  const { blurred, toggle } = useSensitive();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-pressed={blurred}
      aria-label={blurred ? "Show financial figures" : "Hide financial figures"}
      title={blurred ? "Show financials" : "Hide financials"}
      className="px-2"
    >
      <Icon name={blurred ? "eye-off" : "eye"} size={16} />
    </Button>
  );
}
