import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getReportsData } from "@/lib/data";
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import { getDefaultRoute } from "@/lib/navigation";
import { getServerIdentity } from "@/lib/role-server";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Brand.pay.coachCanSeePay (TJD): saved report bodies carry money (the
  // weekly cron report prints MRR), and this detail route had no server
  // guard, so a coach could open /reports/<id> by URL. A TJD coach or head
  // coach lands on their dashboard instead. Gated on the brand flag so DP is
  // unchanged (DP's /reports list is brand-manager only; the detail page is
  // still unguarded there, flagged for the owner).
  const viewer = await getServerIdentity();
  if (moneyHiddenFromViewer(viewer)) redirect(getDefaultRoute(viewer.role));
  const report = (await getReportsData()).find((r) => r.id === id);
  if (!report) notFound();
  return (
    <div className="space-y-6">
      <Link href="/reports" className="text-xs text-fg-muted hover:text-fg-dim">
        ← Reports
      </Link>
      <PageHeader eyebrow={report.type} title={report.title} subtitle={`${report.period} · generated ${report.generatedAt}`} />
      <Card>
        {report.body ? (
          <div className="space-y-4 text-sm leading-relaxed text-fg-dim">
            {report.body.split(/\n{2,}/).map((paragraph, i) => (
              <p key={i} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <EmptyState icon="file" title="No report body" message="This report was saved without body text. Edit it from New report to add one." />
        )}
      </Card>
    </div>
  );
}
