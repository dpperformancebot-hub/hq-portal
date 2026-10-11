"use client";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
      className="inline-flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg-dim transition-colors hover:text-fg"
    >
      <span aria-hidden className="text-base leading-none">
        {isDark ? "☾" : "☀"}
      </span>
      {isDark ? "Dark" : "Light"}
    </button>
  );
}
