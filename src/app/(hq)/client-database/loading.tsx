import { SkeletonHeader, SkeletonTable } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonTable rows={8} />
    </div>
  );
}
