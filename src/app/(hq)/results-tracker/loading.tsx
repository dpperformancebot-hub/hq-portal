import { SkeletonCards, SkeletonHeader } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonCards count={6} />
    </div>
  );
}
