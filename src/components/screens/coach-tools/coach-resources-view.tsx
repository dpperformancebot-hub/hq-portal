// Coach Resources (DP, 2026-10): the coach's tools and outside links in one
// place. Internal tools first, then the accounts and admin forms. Links live
// in COACH_LINKS (src/lib/coach-content/handbook.ts); a null link renders as
// "Link coming" until the owner supplies it.

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { COACH_LINKS } from "@/lib/coach-content/handbook";

type Res = { title: string; body: string; href: string | null; internal?: boolean };

const GROUPS: { label: string; items: Res[] }[] = [
  {
    label: "In the portal",
    items: [
      { title: "Macro calculator", body: "The starting macro calculator we use with clients.", href: "/calculators", internal: true },
      { title: "Recipe Index", body: "Templated meals with macros. Adjust for each client.", href: "/recipes", internal: true },
      { title: "Quizzes", body: "Practice quizzes for each Academy module.", href: "/quizzes", internal: true },
      { title: "Contacts", body: "Who to go to, and their WhatsApp numbers.", href: "/start-here?p=contacts", internal: true },
    ],
  },
  {
    label: "Your accounts",
    items: [
      { title: "Work email", body: "Google Workspace. Sign in with your @dpperformance.com.au address.", href: COACH_LINKS.workEmail },
      { title: "1fit", body: "Client programs, training and meals.", href: COACH_LINKS.oneFit },
      { title: "Slack", body: "New clients, admin channels and #transformations.", href: COACH_LINKS.slackInvite },
      { title: "Loom", body: "Welcome videos and check-in walkthroughs.", href: COACH_LINKS.loom },
    ],
  },
  {
    label: "Admin forms",
    items: [
      { title: "Compliance form", body: "ABN, invoicing and bank details, qualifications and insurance.", href: COACH_LINKS.complianceForm },
      { title: "Coach profile form", body: "So we match the right clients to you.", href: COACH_LINKS.coachProfileForm },
    ],
  },
];

function ResourceCard({ r }: { r: Res }) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-fg">{r.title}</div>
        {r.href ? (
          <span aria-hidden className="text-sm text-accent">
            {r.internal ? "→" : "↗"}
          </span>
        ) : (
          <span className="shrink-0 rounded-pill bg-surface-3 px-2 py-0.5 text-[11px] text-fg-muted">Link coming</span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-fg-dim">{r.body}</p>
    </>
  );
  const cls = "block h-full rounded-card border border-border bg-surface p-4";
  if (!r.href) return <div className={`${cls} opacity-70`}>{inner}</div>;
  return r.internal ? (
    <Link href={r.href} className={`${cls} transition-colors hover:border-accent`}>
      {inner}
    </Link>
  ) : (
    <a href={r.href} target="_blank" rel="noopener noreferrer" className={`${cls} transition-colors hover:border-accent`}>
      {inner}
    </a>
  );
}

export function CoachResourcesView() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Coach portal" title="Resources" subtitle="Your tools, accounts and forms in one place." />
      {GROUPS.map((g) => (
        <section key={g.label} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{g.label}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.items.map((r) => (
              <ResourceCard key={r.title} r={r} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
