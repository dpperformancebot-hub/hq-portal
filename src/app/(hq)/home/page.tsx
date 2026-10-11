import { CoachHomeView } from "@/components/screens/coach-tools/coach-home-view";
import { getAcademyProgress } from "@/lib/academy-actions";
import { getServerIdentity } from "@/lib/role-server";

// Coach Home (DP, 2026-10): a plain coach login's landing screen. Server-
// rendered with the coach's Academy progress.
export default async function CoachHomePage() {
  const [identity, progress] = await Promise.all([getServerIdentity(), getAcademyProgress()]);
  const firstName = identity.displayName?.trim().split(/\s+/)[0] ?? null;
  return <CoachHomeView firstName={firstName} progress={progress} />;
}
