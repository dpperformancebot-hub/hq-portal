import { Card, SkeletonHeader, SkeletonKpiRow, Skeleton } from "@/components/ui";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonKpiRow count={4} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
          </Card>
        ))}
      </div>
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
