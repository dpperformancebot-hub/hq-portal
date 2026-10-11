import { SkeletonHeader, SkeletonKpiRow, SkeletonTable } from "@/components/ui";

// Default loading skeleton for any HQ screen without a tailored one.
export default function HqLoading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonKpiRow />
      <SkeletonTable />
    </div>
  );
}
