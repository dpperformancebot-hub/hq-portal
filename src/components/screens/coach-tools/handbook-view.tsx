// Coach Handbook view (DP, 2026-10): renders a handbook section ("Start here"
// or "SOPs") as a page list plus one page at a time. Server component: the
// content in src/lib/coach-content/handbook.ts never ships to the browser.
// ?p=<page id> selects the page; an unknown id falls back to the first page.

import Link from "next/link";
import type { ReactNode } from "react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  handbookHref,
  type HandbookBlock,
  type HandbookPage,
  type HandbookSection,
  type HandbookStep,
} from "@/lib/coach-content/handbook";

/** Inline text: **bold** and [label](href). Internal hrefs use next/link. */
export function renderHandbookInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <strong key={k++} className="font-semibold text-fg">
          {m[1]}
        </strong>,
      );
    } else {
      const href = handbookHref(m[3]);
      const external = /^https?:/.test(href);
      out.push(
        external ? (
          <a key={k++} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
            {m[2]}
          </a>
        ) : (
          <Link key={k++} href={href} className="font-medium text-accent hover:underline">
            {m[2]}
          </Link>
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const inline = renderHandbookInline;

/** The Academy/SOP markdown-lite: **Heading** blocks, "- " bullets, paragraphs. */
function renderMd(body: string): ReactNode[] {
  return body.split(/\n\s*\n/).map((block, bi) => {
    const t = block.trim();
    if (!t) return null;
    const h = /^\*\*(.+)\*\*$/.exec(t);
    if (h && !h[1].includes("**")) {
      return (
        <h3 key={bi} className="mt-5 text-sm font-semibold text-fg">
          {h[1]}
        </h3>
      );
    }
    const lines = t.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      return (
        <ul key={bi} className="ml-4 list-disc space-y-1 text-sm leading-relaxed text-fg-dim">
          {lines.map((l, li) => (
            <li key={li}>{inline(l.trim().slice(2))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={bi} className="whitespace-pre-line text-sm leading-relaxed text-fg-dim">
        {inline(t)}
      </p>
    );
  });
}

function Script({ text, label }: { text: string; label?: string }) {
  return (
    <figure className="rounded-control border-l-2 border-accent bg-accent-soft/40 px-4 py-3">
      {label ? <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">{label}</figcaption> : null}
      <blockquote className="text-sm italic leading-relaxed text-fg">&ldquo;{text}&rdquo;</blockquote>
    </figure>
  );
}

function Step({ step }: { step: HandbookStep }) {
  return (
    <li className="relative rounded-control border border-border-soft bg-surface-2/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {step.when ? <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{step.when}</span> : null}
        {step.deadline ? (
          <span className="rounded-pill bg-warn-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-warn">
            Deadline
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-fg">{step.title}</div>
      {step.body ? <p className="mt-1 text-sm leading-relaxed text-fg-dim">{inline(step.body)}</p> : null}
      {step.script ? (
        <div className="mt-2">
          <Script text={step.script} />
        </div>
      ) : null}
    </li>
  );
}

function Block({ block }: { block: HandbookBlock }) {
  switch (block.kind) {
    case "p":
      return <p className="text-sm leading-relaxed text-fg-dim">{inline(block.text)}</p>;
    case "h":
      return (
        <h3 className="flex flex-wrap items-center gap-2 pt-3 text-base font-semibold text-fg">
          <span>{block.text}</span>
          {block.tag ? (
            <span className="rounded-pill bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-medium text-fg-muted">{block.tag}</span>
          ) : null}
        </h3>
      );
    case "list":
      return (
        <ul className="ml-4 list-disc space-y-1.5 text-sm leading-relaxed text-fg-dim marker:text-fg-muted">
          {block.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>
      );
    case "checklist":
      return (
        <ul className="space-y-1.5 text-sm leading-relaxed text-fg-dim">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded border border-border" />
              <span>{inline(it)}</span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="space-y-2">
          {block.items.map((s, i) => (
            <Step key={i} step={s} />
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} className="border-b border-border px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-border-soft last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className={`px-2 py-2 align-top ${ci === 0 ? "text-fg" : "text-fg-dim"}`}>
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "script":
      return <Script text={block.text} label={block.label} />;
    case "template":
      return (
        <div className="rounded-control border border-border bg-surface-2/60">
          <div className="border-b border-border-soft px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Copy this format
          </div>
          <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-relaxed text-fg">
            {[block.title, ...block.lines].join("\n")}
          </pre>
          {block.note ? <p className="border-t border-border-soft px-4 py-2 text-xs text-fg-muted">{block.note}</p> : null}
        </div>
      );
    case "note":
      return (
        <div
          className={`rounded-control px-4 py-3 text-sm leading-relaxed ${
            block.tone === "warn" ? "bg-warn-soft text-fg" : "bg-surface-2 text-fg-dim"
          }`}
        >
          {block.title ? <div className="mb-0.5 font-semibold text-fg">{block.title}</div> : null}
          {inline(block.text)}
        </div>
      );
    case "stats":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {block.items.map((s, i) => (
            <div key={i} className="rounded-control border border-border-soft bg-surface-2/60 px-4 py-3">
              <div className="font-display text-2xl tabular-nums tracking-display text-fg">{s.value}</div>
              <div className="mt-0.5 text-xs leading-snug text-fg-muted">{s.label}</div>
            </div>
          ))}
        </div>
      );
    case "cards":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {block.items.map((c, i) => (
            <div key={i} className="rounded-control border border-border-soft bg-surface-2/60 px-4 py-3">
              <div className="text-sm font-semibold text-fg">{c.title}</div>
              {c.sub ? <div className="text-xs text-fg-muted">{c.sub}</div> : null}
              {c.body ? <p className="mt-1 text-sm leading-relaxed text-fg-dim">{inline(c.body)}</p> : null}
            </div>
          ))}
        </div>
      );
    case "links":
      return (
        <div className="space-y-2">
          {block.items.map((l, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-control border border-border-soft bg-surface-2/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-fg">{l.label}</div>
                {l.note ? <p className="mt-0.5 text-xs leading-relaxed text-fg-dim">{l.note}</p> : null}
              </div>
              {l.href ? (
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 self-start rounded-pill bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-deep sm:self-auto"
                >
                  Open →
                </a>
              ) : (
                <span className="shrink-0 self-start rounded-pill bg-surface-3 px-3 py-1.5 text-xs text-fg-muted sm:self-auto">Link coming</span>
              )}
            </div>
          ))}
        </div>
      );
    case "md":
      return <div className="space-y-3">{renderMd(block.body)}</div>;
  }
}

function groupsOf(pages: HandbookPage[]): { group: string; pages: HandbookPage[] }[] {
  const out: { group: string; pages: HandbookPage[] }[] = [];
  for (const p of pages) {
    const g = out.find((x) => x.group === p.group);
    if (g) g.pages.push(p);
    else out.push({ group: p.group, pages: [p] });
  }
  return out;
}

export function HandbookView({ section, pageId }: { section: HandbookSection | null; pageId?: string }) {
  if (!section || section.pages.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Coach handbook" title={section?.title ?? "Handbook"} subtitle="Nothing has been added here yet." />
        <Card>
          <EmptyState title="No pages yet." message="Pages will appear here once they are added." />
        </Card>
      </div>
    );
  }

  const idx = Math.max(0, section.pages.findIndex((p) => p.id === pageId));
  const page = section.pages[idx];
  const prev = section.pages[idx - 1];
  const next = section.pages[idx + 1];
  const hrefFor = (p: HandbookPage) => `${section.path}?p=${p.id}`;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Coach handbook" title={section.title} subtitle={section.subtitle} />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Phones: the page itself comes first and the page list follows it
            (prev/next links sit at the foot of each page); lg up: list left. */}
        <nav className="order-2 w-full shrink-0 space-y-4 lg:order-1 lg:w-64" aria-label={`${section.title} pages`}>
          <div className="px-2 text-xs font-semibold text-fg lg:hidden">All {section.title} pages</div>
          {groupsOf(section.pages).map((g) => (
            <div key={g.group}>
              <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{g.group}</div>
              <ul>
                {g.pages.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={hrefFor(p)}
                      aria-current={p.id === page.id ? "page" : undefined}
                      className={`block rounded-control px-2 py-1.5 text-sm ${
                        p.id === page.id ? "bg-surface-2 font-medium text-fg" : "text-fg-dim hover:text-fg"
                      }`}
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="order-1 min-w-0 flex-1 lg:order-2">
          <Card roomy>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">{page.group}</div>
            <h2 className="mt-1 font-display text-2xl tracking-display text-fg">{page.title}</h2>
            {page.intro ? <p className="mt-1 text-sm text-fg-dim">{inline(page.intro)}</p> : null}
            <div className="mt-5 space-y-4">
              {page.blocks.map((b, i) => (
                <Block key={i} block={b} />
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between gap-3 border-t border-border-soft pt-4 text-sm">
              {prev ? (
                <Link href={hrefFor(prev)} className="text-fg-dim hover:text-fg">
                  ← {prev.title}
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={hrefFor(next)} className="text-right font-medium text-accent hover:underline">
                  {next.title} →
                </Link>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
