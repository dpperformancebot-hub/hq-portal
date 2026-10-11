import { AcademyView } from "@/components/screens/coach-tools/academy-view";
import { getAcademyProgress } from "@/lib/academy-actions";

// Coach-only route: the DP Academy course, server-rendered (the course text
// stays out of the client bundle). ?m=<module>&l=<lesson> selects content.
// Progress + stage gating resolve per coach; owners preview fully unlocked.
export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; l?: string }>;
}) {
  const [{ m, l }, progress] = await Promise.all([searchParams, getAcademyProgress()]);
  return <AcademyView moduleId={m} lessonId={l} progress={progress} />;
}
