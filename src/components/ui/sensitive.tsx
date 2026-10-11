"use client";

// Wrap any money/financial value in <Sensitive> to hide it when the owner has
// the "hide financials" toggle on (see SensitiveProvider).
//
// R5-6 (stories rule): hiding keeps the SHAPE of the number. String/number
// children get their digits masked ("$1,234,567" -> "$•,•••,•••") so the
// figure count and commas still read on a screenshot; an 8-figure month still
// looks like one. Non-text children (charts, composed nodes) keep the CSS
// blur fallback. Layout never shifts either way; select-none stops the value
// being selected or copied. Renders inert when no provider / toggle off.

import { Children } from "react";
import { useSensitive } from "@/components/sensitive-provider";

const maskDigits = (value: string) => value.replace(/\d/g, "•");

/** Flatten children to one string when every child is a primitive, so
 *  fragment money like {prefix}{value}{suffix} still gets digit dots. */
function primitiveText(children: React.ReactNode): string | null {
  const parts = Children.toArray(children);
  if (parts.length === 0) return null;
  let out = "";
  for (const part of parts) {
    if (typeof part === "string" || typeof part === "number") out += String(part);
    else return null;
  }
  return out;
}

export function Sensitive({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { blurred } = useSensitive();
  if (!blurred) return <>{children}</>;
  const text = primitiveText(children);
  if (text !== null) {
    return (
      <span className={`inline-block select-none ${className}`} title="Financial figure hidden">
        {maskDigits(text)}
      </span>
    );
  }
  return (
    <span
      className={`inline-block select-none blur-[6px] transition-[filter] duration-150 ${className}`}
      title="Financial figure hidden"
    >
      {children}
    </span>
  );
}
