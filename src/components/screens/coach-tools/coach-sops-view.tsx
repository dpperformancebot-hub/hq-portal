// Coach SOPs (M6, coach toolset): Dan's real coaching SOPs, SERVER-rendered so
// the bodies never ship in the client bundle. Grouped by category, each with
// its Loom walkthrough(s) and the full written process. Bodies use the same
// **Heading** / bullet markdown-lite as the Academy.

import { Card, EmptyState, PageHeader } from "@/components/ui";
import { COACH_SOPS } from "@/lib/coach-content/sops";
import { BRAND } from "@/lib/brand";

/** Markdown-lite for SOP bodies: **Heading** blocks, paragraphs, "- " bullet
 *  lists, inline **bold**. The content uses nothing fancier. */
function renderBody(body: string): React.ReactNode[] {
  const blocks = body.split(/\n\s*\n/);
  return blocks.map((block, bi) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    const headingMatch = /^\*\*(.+)\*\*$/.exec(trimmed);
    if (headingMatch && !headingMatch[1].includes("**")) {
      return (
        <h4 key={bi} className="mt-5 text-sm font-semibold text-fg">
          {headingMatch[1]}
        </h4>
      );
    }
    const lines = trimmed.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      return (
        <ul key={bi} className="ml-4 list-disc space-y-1 text-sm leading-relaxed text-fg-dim">
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.trim().slice(2))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={bi} className="text-sm leading-relaxed text-fg-dim">
        {renderInline(trimmed)}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-fg">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

export function CoachSopsView() {
  const categories = Array.from(new Set(COACH_SOPS.map((s) => s.category)));

  // No SOPs loaded (a rebranded deploy filling its own): clean empty state,
  // not the DP-specific "more SOPs live on the external site" card below.
  if (COACH_SOPS.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Coach tools" title="SOPs" subtitle="Standard operating procedures for the coaching team." />
        <Card>
          <EmptyState title="No SOPs yet." message="Your team's SOPs will appear here once they are added." />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Coach tools"
        title="SOPs"
        subtitle={`${BRAND.name} standard operating procedures: the Loom walkthrough plus the full written process.`}
      />

      {categories.map((cat) => (
        <div key={cat} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{cat}</h2>
          {COACH_SOPS.filter((s) => s.category === cat).map((sop) => (
            <Card key={sop.id}>
              <h3 className="font-display text-lg tracking-display text-fg">{sop.title}</h3>
              <p className="mt-1 text-sm text-fg-dim">{sop.summary}</p>
              {sop.looms.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sop.looms.map((l, i) => (
                    <a
                      key={i}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-medium text-accent hover:underline"
                    >
                      ▶ {l.label ?? "Loom walkthrough"}
                    </a>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 space-y-3">{renderBody(sop.body)}</div>
            </Card>
          ))}
        </div>
      ))}

      <Card>
        <h3 className="text-sm font-semibold text-fg">More SOPs</h3>
        <p className="mt-1 text-sm text-fg-dim">
          {COACH_SOPS.length} of the ~22 SOPs are ported here with their full written process. The rest of the library
          (nutrition, training, communication, and decision-making SOPs) currently lives on the external SOP site. To
          bring them into the HQ the owner needs to export that content; until then, use the link below.
        </p>
        <a
          href="https://sop-library-six.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-medium text-accent hover:underline"
        >
          Open the full SOP library
        </a>
      </Card>
    </div>
  );
}
