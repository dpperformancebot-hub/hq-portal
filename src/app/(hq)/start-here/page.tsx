import { HandbookView } from "@/components/screens/coach-tools/handbook-view";
import { getHandbookSection } from "@/lib/coach-content/handbook";

// Coach handbook, "Start here" section (DP): onboarding pages split out of the
// Coach Welcome Pack. Server-rendered; ?p=<page id> selects the page.
export default async function StartHerePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  return <HandbookView section={getHandbookSection("start")} pageId={p} />;
}
