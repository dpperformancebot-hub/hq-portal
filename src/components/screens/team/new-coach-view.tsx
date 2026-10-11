"use client";

// R19-2b: the "New coach" screen. Replaces a panel buried 1.6 screens down the
// Team page, under a small-caps label that read as a section divider, with a
// page of its own reached by a primary button from Team and Coach Overview.
// That placement is the whole reason the owner could not find it.
//
// One submit creates the coach record, the pay setup for this brand, the portal
// invite and the Clerk invitation, in that order. The email is last and cannot
// fail the creation: a coach with a record and no email can be resent from the
// success screen, but an email promising a portal that was never made cannot be
// taken back.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, PageHeader, Panel, useToast } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import type { TjdRateCard } from "@/lib/pay/tjd-pay";
import { addCoachAction, resendCoachInviteAction, type AddCoachResult, type CoachPaySetup } from "@/lib/add-coach-actions";

type Saved = Extract<AddCoachResult, { ok: true }>;

const WEEKS_PAID = BRAND.pay.model === "weeks-paid";

const label = "block text-xs font-medium text-fg-dim";
const field =
  "mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none";

function InviteBadge({ status }: { status: Saved["invite"] }) {
  const map: Record<string, { text: string; cls: string }> = {
    sent: { text: "Email sent", cls: "bg-positive-soft text-positive" },
    already_invited: { text: "Already invited, link still valid", cls: "bg-positive-soft text-positive" },
    already_a_user: { text: "Already has a login, they can just sign in", cls: "bg-surface-2 text-fg-dim" },
    skipped: { text: "No email sent: Clerk is not configured here", cls: "bg-warn-soft text-warn" },
    failed: { text: "Email failed", cls: "bg-danger-soft text-danger" },
  };
  const m = map[status.status] ?? map.failed;
  return <span className={`rounded-pill px-2 py-1 text-xs font-medium ${m.cls}`}>{m.text}</span>;
}

export function NewCoachView({
  defaultCard = null,
}: {
  /** TJD's default rate card, handed in by the (owner/admin-only) server page.
   *  Not read from BRAND: brand.ts ships to every login's bundle. */
  defaultCard?: TjdRateCard | null;
} = {}) {
  const DEFAULT_CARD = defaultCard;
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [headCoach, setHeadCoach] = useState(false);
  const [capacity, setCapacity] = useState("70");
  const [startDate, setStartDate] = useState("");
  const [weeklyRate, setWeeklyRate] = useState("25");
  const [fortnightlyRate, setFortnightlyRate] = useState("15");
  const [brandWeekly, setBrandWeekly] = useState(String(DEFAULT_CARD?.brandWeekly ?? ""));
  const [brandFortnightly, setBrandFortnightly] = useState(String(DEFAULT_CARD?.brandFortnightly ?? ""));
  const [referralWeekly, setReferralWeekly] = useState(String(DEFAULT_CARD?.referralWeekly ?? ""));
  const [referralFortnightly, setReferralFortnightly] = useState(String(DEFAULT_CARD?.referralFortnightly ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nearMatch, setNearMatch] = useState<{ name: string; score: number } | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [resending, setResending] = useState(false);

  const payFor = (): CoachPaySetup =>
    WEEKS_PAID
      ? {
          model: "weeks-paid",
          brandWeekly: Number(brandWeekly),
          brandFortnightly: Number(brandFortnightly),
          referralWeekly: Number(referralWeekly),
          referralFortnightly: Number(referralFortnightly),
        }
      : { model: "checkin-codes", weeklyRate: Number(weeklyRate), fortnightlyRate: Number(fortnightlyRate) };

  async function submit(confirmNearMatch = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await addCoachAction(
        {
          name,
          email,
          headCoach,
          capacity: Number(capacity),
          startDate: startDate || null,
          pay: payFor(),
        },
        confirmNearMatch,
      );
      if (!res.ok) {
        setError(res.error);
        setNearMatch(res.nearMatch ?? null);
        return;
      }
      setNearMatch(null);
      setSaved(res);
      router.refresh(); // the new coach shows in every list and picker at once
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!saved) return;
    setResending(true);
    try {
      const r = await resendCoachInviteAction(saved.email, saved.coachId);
      if (r.ok) {
        setSaved({ ...saved, invite: r.invite });
        toast.push(r.invite.status === "sent" ? "Invite sent again." : `Invite: ${r.invite.status}`);
      } else {
        toast.push(r.error);
      }
    } finally {
      setResending(false);
    }
  }

  if (saved) {
    return (
      <div className="space-y-6">
        <PageHeader back eyebrow="Team & Settings" title={`${saved.name} is set up`} subtitle="Their portal exists and is empty until clients are assigned." />
        <Panel title="Invite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-fg-dim">
              <div className="text-fg">{saved.email}</div>
              <div className="mt-0.5 text-xs">
                {saved.linkedExisting
                  ? "Linked to their existing coach record, so their current clients stay attached."
                  : "New coach record, 0 clients."}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <InviteBadge status={saved.invite} />
              {saved.invite.status !== "sent" && saved.invite.status !== "already_a_user" ? (
                <Button size="sm" onClick={resend} disabled={resending}>
                  {resending ? "Sending..." : "Resend"}
                </Button>
              ) : null}
            </div>
          </div>
          {saved.invite.status === "failed" ? (
            <p className="mt-3 rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">
              {saved.invite.error} The coach record and their rates are saved, so nothing is half-made. Press Resend
              when Clerk is reachable.
            </p>
          ) : null}
        </Panel>

        <Panel title="What happens next">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-fg-dim">
            {saved.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </Panel>

        <Panel title="Message for them">
          <pre className="whitespace-pre-wrap rounded-card bg-surface-2 p-3 text-xs text-fg-dim">{saved.message}</pre>
        </Panel>

        <div className="flex gap-2">
          <Link href="/team"><Button variant="ghost">Back to Team</Button></Link>
          <Link href="/coach-overview"><Button variant="ghost">Coach Overview</Button></Link>
          <Button onClick={() => { setSaved(null); setName(""); setEmail(""); }}>Add another</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader back eyebrow="Team & Settings" title="New coach" subtitle="Creates their coach record, their pay setup and their login, and emails them to sign in." />

      <Card className="space-y-5 p-5">
        <div>
          <label className={label} htmlFor="nc-name">Display name</label>
          <input id="nc-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nina Hart" />
          <p className="mt-1 text-xs text-fg-muted">
            Spell it exactly as the GHL Assigned Coach field does. Clients are matched to coaches by this name, so a
            different spelling sends them to a different coach.
          </p>
        </div>

        <div>
          <label className={label} htmlFor="nc-email">Login email</label>
          <input id="nc-email" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@example.com" />
          <p className="mt-1 text-xs text-fg-muted">They must sign in with exactly this address.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="nc-cap">Capacity</label>
            <input id="nc-cap" type="number" min={1} className={field} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="nc-start">Start date</label>
            <input id="nc-start" type="date" className={field} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-fg-dim">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={headCoach} onChange={(e) => setHeadCoach(e.target.checked)} />
            Head coach
          </label>
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Pay setup</div>
          {WEEKS_PAID ? (
            <>
              <p className="mt-1 text-xs text-fg-muted">
                {BRAND.name} pays rate times weeks paid. A coach with no rate card invoices nothing, so this is
                required. Weekly dollars, which is the SOP monthly figure divided by four.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-4">
                <div><label className={label} htmlFor="nc-bw">Brand weekly</label><input id="nc-bw" type="number" step="0.01" min={0} className={field} value={brandWeekly} onChange={(e) => setBrandWeekly(e.target.value)} /></div>
                <div><label className={label} htmlFor="nc-bf">Brand fortnightly</label><input id="nc-bf" type="number" step="0.01" min={0} className={field} value={brandFortnightly} onChange={(e) => setBrandFortnightly(e.target.value)} /></div>
                <div><label className={label} htmlFor="nc-rw">Referral weekly</label><input id="nc-rw" type="number" step="0.01" min={0} className={field} value={referralWeekly} onChange={(e) => setReferralWeekly(e.target.value)} /></div>
                <div><label className={label} htmlFor="nc-rf">Referral fortnightly</label><input id="nc-rf" type="number" step="0.01" min={0} className={field} value={referralFortnightly} onChange={(e) => setReferralFortnightly(e.target.value)} /></div>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-fg-muted">{BRAND.name} pays from check-in codes at these rates.</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div><label className={label} htmlFor="nc-wr">Weekly rate</label><input id="nc-wr" type="number" step="0.01" min={0} className={field} value={weeklyRate} onChange={(e) => setWeeklyRate(e.target.value)} /></div>
                <div><label className={label} htmlFor="nc-fr">Fortnightly rate</label><input id="nc-fr" type="number" step="0.01" min={0} className={field} value={fortnightlyRate} onChange={(e) => setFortnightlyRate(e.target.value)} /></div>
              </div>
            </>
          )}
        </div>

        {error ? (
          <div className="rounded-card border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-fg">
            {error}
            {nearMatch ? (
              <div className="mt-2">
                <Button size="sm" onClick={() => submit(true)} disabled={busy}>
                  No, &quot;{name}&quot; is a different person. Create them.
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Button onClick={() => submit(false)} disabled={busy || !name.trim() || !email.trim()}>
            {busy ? "Creating..." : "Create coach and send invite"}
          </Button>
          <Link href="/team"><Button variant="ghost">Cancel</Button></Link>
        </div>
      </Card>
    </div>
  );
}
