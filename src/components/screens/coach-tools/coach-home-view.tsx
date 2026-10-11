// Coach Home (DP, 2026-10): the landing screen for a plain coach login. Day-to-
// day client work lives in 1fit, so this is a launchpad, not a dashboard:
// Academy progress, the handbook, the SOPs coaches reach for most, resources.

import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { ACADEMY_MODULES } from "@/lib/coach-content/academy";
import type { AcademyProgress } from "@/lib/academy-actions";

const QUICK_SOPS: { label: string; href: string }[] = [
  { label: "Save a cancelling client", href: "/sops?p=de-cancel" },
  { label: "Pause or cancel a client", href: "/sops?p=pauses-cancellations" },
  { label: "Switch a service", href: "/sops?p=changes-refunds" },
  { label: "Set up a new client", href: "/sops?p=new-client" },
  { label: "Check-in rules", href: "/sops?p=response-checkins" },
  { label: "Chase a missed check-in", href: "/sops?p=missed-checkins" },
  { label: "Flag a transformation", href: "/sops?p=transformations" },
  { label: "Call in sick or book time off", href: "/sops?p=retention-time-away" },
];

function Tile({ href, eyebrow, title, body, cta }: { href: string; eyebrow: string; title: string; body: string; cta: string }) {
  return (
    <Link href={href} className="group block rounded-card border border-border bg-surface p-5 transition-colors hover:border-accent">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">{eyebrow}</div>
      <div className="mt-1 font-display text-xl tracking-display text-fg">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-fg-dim">{body}</p>
      <div className="mt-3 text-sm font-medium text-accent group-hover:underline">{cta} →</div>
    </Link>
  );
}

export function CoachHomeView({ firstName, progress }: { firstName: string | null; progress: AcademyProgress }) {
  const completed = new Set(progress.completedLessons);
  const totalLessons = ACADEMY_MODULES.reduce((s, m) => s + m.lessons.length, 0);
  const done = ACADEMY_MODULES.reduce((s, m) => s + m.lessons.filter((l) => completed.has(l.id)).length, 0);
  const pct = totalLessons > 0 ? Math.round((done / totalLessons) * 100) : 0;
  const current = ACADEMY_MODULES.find((m) => m.lessons.some((l) => !completed.has(l.id)));
  const finished = totalLessons > 0 && done === totalLessons;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Coach portal"
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        subtitle="Your Academy, the handbook and everything you need to coach the DP way. Client work lives in 1fit."
      />

      <Card roomy>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">Coach Academy</div>
            <div className="mt-1 font-display text-2xl tracking-display text-fg">
              {finished ? "Course complete" : current ? `Module ${current.number}: ${current.title}` : "Start the course"}
            </div>
            <p className="mt-1 text-sm text-fg-dim">
              {progress.canTrack
                ? `${done} of ${totalLessons} lessons complete. Modules unlock in order.`
                : "Work through every module in order. Progress is tracked on coach logins."}
            </p>
          </div>
          <Link
            href={current ? `/academy?m=${current.id}` : "/academy"}
            className="shrink-0 self-start rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep sm:self-auto"
          >
            {finished ? "Review the Academy" : done > 0 ? "Continue" : "Start the Academy"}
          </Link>
        </div>
        {progress.canTrack ? (
          <div className="mt-4 h-2 overflow-hidden rounded-pill bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Tile href="/start-here" eyebrow="New here?" title="Start here" body="Setup, your first week, your first 4 weeks, contacts and pay." cta="Read it end to end" />
        <Tile href="/sops" eyebrow="Day to day" title="SOPs" body="Admin, client setup, check-ins and client wins, with copy-ready formats." cta="Open the SOPs" />
        <Tile href="/resources" eyebrow="Tools & links" title="Resources" body="Calculators, recipes, 1fit, Slack, Loom and the admin forms." cta="Open resources" />
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-fg">I need to…</h2>
        <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {QUICK_SOPS.map((q) => (
            <li key={q.href}>
              <Link href={q.href} className="flex items-center justify-between rounded-control px-2 py-1.5 text-sm text-fg-dim hover:bg-surface-2 hover:text-fg">
                <span>{q.label}</span>
                <span aria-hidden className="text-fg-muted">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-fg">Stuck?</h2>
        <p className="mt-1 text-sm text-fg-dim">
          Coaching and programming questions go to <strong className="font-semibold text-fg">Angus</strong>. Pauses, cancellations and billing go to{" "}
          <strong className="font-semibold text-fg">Jameela</strong>. Everyone else is in{" "}
          <Link href="/start-here?p=contacts" className="font-medium text-accent hover:underline">
            your contacts
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
