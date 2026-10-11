import { Card } from "@/components/ui/card";

/** Single shimmer block. Compose into screen-shaped placeholders. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-surface-2 ${className}`} />;
}

/** A row of KPI card placeholders. */
export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-16" />
        </Card>
      ))}
    </div>
  );
}

/** A table placeholder: header bar + rows. */
export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <Card className="space-y-3">
      <Skeleton className="h-4 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </Card>
  );
}

/** A grid of card placeholders. */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-3 w-24" />
        </Card>
      ))}
    </div>
  );
}

/** Standard page header placeholder (eyebrow + title + subtitle). */
export function SkeletonHeader() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-3 w-80" />
    </div>
  );
}
