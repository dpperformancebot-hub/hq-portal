"use client";

// R4-2: the real referral tracker, replacing the fake demo Referrals screen
// (S1). Sheet model, kept dead simple: client → up to 4 referrals, each with
// a reward-paid tick. Owner/VA edit; search to find the client fast.

import { useMemo, useState, useTransition } from "react";
import { Button, EmptyState, PageHeader, Panel, useToast } from "@/components/ui";
import { addReferralAction, setReferralPaidAction, type ReferralRow } from "@/lib/referral-actions";
import type { FeedbackReferralAnswer } from "@/lib/feedback-responses";

const inputCls =
  "rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent";

export function ReferralTrackerView({
  rows,
  clients,
  canEdit,
  fromForms = null,
}: {
  rows: ReferralRow[];
  clients: { id: string; name: string }[];
  canEdit: boolean;
  /** R7-2: referral answers from the week-4 feedback forms. Owner/ops only;
   *  null means the viewer's role never received the data. */
  fromForms?: FeedbackReferralAnswer[] | null;
}) {
  const toast = useToast();
  const [local, setLocal] = useState(rows);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const byClient = useMemo(() => {
    const m = new Map<string, ReferralRow[]>();
    for (const r of local) {
      const list = m.get(r.clientId) ?? [];
      list.push(r);
      m.set(r.clientId, list);
    }
    return m;
  }, [local]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withRows = clients.filter((c) => byClient.has(c.id) || q.length > 0);
    return (q ? withRows.filter((c) => c.name.toLowerCase().includes(q)) : withRows).slice(0, 60);
  }, [clients, byClient, query]);

  const add = (clientId: string) => {
    const name = (adding[clientId] ?? "").trim();
    if (!name || pending) return;
    start(async () => {
      const res = await addReferralAction({ clientId, name });
      if (res.ok) {
        setLocal((prev) => [
          ...prev,
          { id: `local-${prev.length}`, clientId, referralName: name, rewardPaid: false },
        ]);
        setAdding((prev) => ({ ...prev, [clientId]: "" }));
        toast.push(`Referral added: ${name}.`);
      } else {
        toast.push(res.error ?? "Could not add the referral.", "error");
      }
    });
  };

  const togglePaid = (row: ReferralRow) => {
    if (!canEdit || row.id.startsWith("local-")) return;
    const next = !row.rewardPaid;
    setLocal((prev) => prev.map((r) => (r.id === row.id ? { ...r, rewardPaid: next } : r)));
    start(async () => {
      const res = await setReferralPaidAction({ id: row.id, paid: next });
      if (!res.ok) {
        setLocal((prev) => prev.map((r) => (r.id === row.id ? { ...r, rewardPaid: !next } : r)));
        toast.push(res.error ?? "Could not update.", "error");
      }
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Brand"
        title="Referrals"
        subtitle="Who referred who, and whether the reward has been paid. Up to 4 per client."
      />

      <Panel
        title="Referral tracker"
        action={
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            className={inputCls}
            aria-label="Search clients"
          />
        }
        subtitle={canEdit ? "Search a client to add their first referral." : "Read-only view."}
      >
        {visible.length === 0 ? (
          <EmptyState
            compact
            icon="gift"
            title="No referrals tracked yet"
            message="Search a client above and add their first referral."
          />
        ) : (
          <div className="space-y-3">
            {visible.map((c) => {
              const list = byClient.get(c.id) ?? [];
              return (
                <div key={c.id} className="rounded-control border border-border-soft px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-fg">{c.name}</span>
                    <span className="text-xs tabular-nums text-fg-muted">{list.length}/4</span>
                  </div>
                  {list.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {list.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          disabled={!canEdit || pending}
                          onClick={() => togglePaid(r)}
                          title={r.rewardPaid ? "Reward paid. Click to unmark." : "Reward unpaid. Click to mark paid."}
                          className={`flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs transition-colors ${
                            r.rewardPaid
                              ? "border-accent bg-accent-soft text-accent-deep"
                              : "border-border text-fg-dim hover:border-accent/40"
                          } ${canEdit ? "" : "cursor-default"}`}
                        >
                          {r.referralName}
                          <span className={r.rewardPaid ? "font-semibold" : "text-fg-muted"}>
                            {r.rewardPaid ? "✓ paid" : "unpaid"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {canEdit && list.length < 4 ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={adding[c.id] ?? ""}
                        onChange={(e) => setAdding((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") add(c.id);
                        }}
                        placeholder="Referral name…"
                        maxLength={120}
                        className={`${inputCls} w-56`}
                        aria-label={`Add a referral for ${c.name}`}
                      />
                      <Button size="sm" onClick={() => add(c.id)} disabled={pending || !(adding[c.id] ?? "").trim()}>
                        Add
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* R7-2: referral answers lifted from the week-4 feedback forms. These
          are hidden from every coach view; here they feed the tracker above
          (add them to the client manually once verified). */}
      {fromForms ? (
        <Panel
          title="From feedback forms"
          subtitle="Referral answers clients gave on the week-4 form. Coaches never see these; add real leads to the tracker above."
        >
          {fromForms.length === 0 ? (
            <EmptyState
              compact
              icon="gift"
              title="No referral answers yet"
              message="When a week-4 feedback form includes a referral, it lands here."
            />
          ) : (
            <div className="space-y-2">
              {fromForms.map((f) => (
                <div key={f.id} className="rounded-control border border-border-soft px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-fg">{f.clientName}</span>
                    <span className="text-xs tabular-nums text-fg-muted">
                      {f.coachName ? `Coach ${f.coachName} · ` : ""}
                      {f.submittedAt ? new Date(f.submittedAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{f.question}</p>
                  <p className="mt-0.5 text-sm text-fg-dim">{f.answer}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
