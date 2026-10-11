import { ComingNext } from "@/components/shell/coming-next";
import { titleForSlug } from "@/lib/navigation";

// Catch-all for HQ routes that don't have a built screen yet. Built screens
// get their own folder (e.g. app/(hq)/dashboard/page.tsx) which takes
// precedence over this catch-all.
export default async function HqPlaceholderPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  return <ComingNext title={titleForSlug(slug[0] ?? "")} />;
}
