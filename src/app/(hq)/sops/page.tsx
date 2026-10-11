import { SopsScreen } from "@/components/screens/documents/sops-view";
import { CoachSopsView } from "@/components/screens/coach-tools/coach-sops-view";
import { HandbookView } from "@/components/screens/coach-tools/handbook-view";
import { getHandbookSection } from "@/lib/coach-content/handbook";
import { IS_DP } from "@/lib/brand";
import { getServerRole } from "@/lib/role-server";

// Coaches see the coaching SOPs; owner/others see the business SOPs store.
// DP (2026-10): coaches get the handbook SOPs section (the welcome pack's admin,
// client setup, KPI and client wins pages, then Dan's written SOPs).
export default async function SopsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const role = await getServerRole();
  if (role === "coach") {
    if (IS_DP) {
      const { p } = await searchParams;
      return <HandbookView section={getHandbookSection("sops")} pageId={p} />;
    }
    return <CoachSopsView />;
  }
  return <SopsScreen />;
}
