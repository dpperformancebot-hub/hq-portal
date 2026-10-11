import { Icon } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

/** Clean placeholder for screens on the build list but not built yet. */
export function ComingNext({ title }: { title: string }) {
  return (
    <div>
      <PageHeader
        eyebrow="Coming next"
        title={title}
        subtitle="This screen is on the build list. It is not built yet."
      />
      <Card className="mt-6 flex flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-accent-soft text-accent-deep">
          <Icon name="layers" size={22} />
        </span>
        <p className="text-sm text-fg-dim">We are building this screen soon.</p>
        <p className="max-w-sm text-xs text-fg-muted">
          The shell, navigation, and theming are ready. Content arrives as each milestone lands.
        </p>
      </Card>
    </div>
  );
}
