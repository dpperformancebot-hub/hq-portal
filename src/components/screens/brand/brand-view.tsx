import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/lib/icons";
import { BRAND } from "@/lib/brand";
import { getBrief } from "@/lib/seed";

const LINKS = [
  { label: "Brand Assets", href: "/brand-assets", icon: "folder" },
  { label: "Brand Guidelines", href: "/brand-assets", icon: "book" },
  { label: "SOPs", href: "/sops", icon: "note" },
  { label: "Brief", href: "/brief", icon: "file" },
];

export function BrandView() {
  const northStar = getBrief()[0];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Brand" title="Brand" subtitle={`The master reference for ${BRAND.name}.`} />

      <Card className="border-accent/30 bg-accent-soft/40">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-accent-deep">
          <Icon name="star" size={14} /> North star
        </div>
        <p className="mt-2 font-display text-xl tracking-display text-fg">{northStar.note}</p>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {LINKS.map((l) => (
          <Link key={l.label} href={l.href}>
            <Card className="flex flex-col items-center gap-2 py-6 text-center transition-colors hover:bg-surface-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface-2 text-fg-dim">
                <Icon name={l.icon} size={18} />
              </span>
              <span className="text-sm font-medium text-fg">{l.label}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
