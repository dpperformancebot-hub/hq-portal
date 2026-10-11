import { Card, Skeleton, SkeletonHeader, SkeletonKpiRow } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonKpiRow count={4} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Skeleton className="h-60 w-full" />
        </Card>
        <Card>
          <Skeleton className="h-60 w-full" />
        </Card>
      </div>
    </div>
  );
}
