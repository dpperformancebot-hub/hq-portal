"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import type { Integration } from "@/lib/seed";
import { ROLE_CONFIG, type Role } from "@/lib/navigation";
import { setNotificationPrefAction } from "@/lib/local-state-actions";
import { CoachPayRates } from "@/components/screens/settings/coach-pay-rates";

const TABS = ["Integrations", "Notifications", "Profile", "Billing", "Security"] as const;
type Tab = (typeof TABS)[number];

const ROLE_SCOPE: Record<Role, string> = {
  owner: "Full access: every screen, financials, brand, automations, and settings.",
  admin: "Full access like the owner, except owner-only actions (role grants, impersonation).",
  ops_manager: "Everything except financials, MRR, and the sales screens. Taskboard is home.",
  ambassador_mgr: "The Ambassadors area only: pipeline, deliverables, content ideation.",
  coach: "Own clients only: roster, check-ins, results, calendar. No financials or other coaches' data.",
  sales: "Lead pipeline, call calendar, and sales performance.",
  va: "Operations: client database, pipeline, audits, calendar, tasks. No financials or brand.",
};

// Notification preferences are stored per-browser in localStorage. There is no
// notifications/user-settings table yet (and no delivery backend), so these set
// the owner's defaults locally; persisting them server-side and actually sending
// would need a `notification_prefs` column/table plus the email/push backend.
const NOTIFY_KEY = "tjd-notify-prefs";

const NOTIFICATIONS: { id: string; label: string; desc: string; on: boolean }[] = [
  { id: "digest", label: "Daily digest email", desc: "Morning summary of KPIs, tasks, and check-ins.", on: true },
  { id: "new_lead", label: "New lead", desc: "When a lead enters the pipeline.", on: true },
  { id: "checkin_overdue", label: "Check-in overdue", desc: "When a client misses their check-in window.", on: true },
  { id: "renewal_due", label: "Renewal due (14 days)", desc: "Upcoming re-sign calls.", on: true },
  { id: "payment_failed", label: "Payment failed", desc: "A client's payment was declined.", on: true },
  { id: "payroll_ready", label: "Weekly payroll ready", desc: "Coach pay computed, awaiting approval.", on: false },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative h-6 w-10 shrink-0 rounded-pill transition-colors ${on ? "bg-accent" : "border border-border bg-surface-2"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-pill bg-white shadow-sm transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}

export function SettingsView({
  integrations,
  authMode,
  savedPrefs = {},
  canEditPay = false,
}: {
  integrations: Integration[];
  authMode: "clerk" | "password";
  /** R18: owner or admin. Only meaningful on a weeks-paid brand (TJD). */
  canEditPay?: boolean;
  /** Notification toggles saved in the DB (notification_prefs); empty until the
   *  owner applies migration 20260630000003. Takes priority over localStorage. */
  savedPrefs?: Record<string, boolean>;
}) {
  const [tab, setTab] = useState<Tab>("Integrations");
  // Initialise from the defaults on both server and client (so hydration
  // matches), then hydrate saved prefs after mount (DB first, then any local).
  const [notify, setNotify] = useState<Record<string, boolean>>(
    () => Object.fromEntries(NOTIFICATIONS.map((n) => [n.id, n.on])),
  );
  const [loaded, setLoaded] = useState(false);

  // Toggle one preference: update local state + localStorage (via the effect
  // below) and best-effort persist to the DB (no-op until the migration lands).
  const toggleNotify = (id: string) =>
    setNotify((p) => {
      const next = { ...p, [id]: !p[id] };
      void setNotificationPrefAction(id, next[id]);
      return next;
    });
  const connectedCount = integrations.filter((i) => i.connected).length;
  const stripeConnected = integrations.find((i) => i.id === "stripe")?.connected ?? false;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIFY_KEY);
      const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      setNotify((prev) => {
        const next = { ...prev };
        // Only accept known ids with boolean values, so a renamed/added
        // notification falls back to its default instead of breaking. Apply
        // localStorage first, then DB-saved prefs so the DB wins when present.
        for (const n of NOTIFICATIONS) {
          if (typeof saved[n.id] === "boolean") next[n.id] = saved[n.id] as boolean;
          if (typeof savedPrefs[n.id] === "boolean") next[n.id] = savedPrefs[n.id];
        }
        return next;
      });
    } catch {
      // ignore unreadable/blocked storage; defaults stand
    }
    setLoaded(true);
  }, [savedPrefs]);

  useEffect(() => {
    if (!loaded) return; // don't overwrite saved prefs before we've read them
    try {
      localStorage.setItem(NOTIFY_KEY, JSON.stringify(notify));
    } catch {
      // ignore storage write failures (private mode, quota)
    }
  }, [notify, loaded]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Team & Settings" title="Settings" subtitle="Integrations, notifications, profile, billing, security." />
      {/* R18: TJD only. DP prices coaches in code (check-in codes plus setup
          and retention bonuses), so this panel never renders there. */}
      {BRAND.pay.model === "weeks-paid" && canEditPay ? <CoachPayRates /> : null}

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${t === tab ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Integrations" ? (
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            {connectedCount} of {integrations.length} connected. Status is read live from environment config.
            Keys are set in the deployment environment, never entered here.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((ig) => (
              <Card key={ig.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg">{ig.name}</div>
                  <div className="truncate text-xs text-fg-muted">{ig.category}</div>
                </div>
                <span className={`flex shrink-0 items-center gap-1.5 text-xs ${ig.connected ? "text-positive" : "text-fg-muted"}`}>
                  <span className={`h-2 w-2 rounded-pill ${ig.connected ? "bg-positive" : "bg-fg-muted"}`} />
                  {ig.connected ? "Connected" : "Not connected"}
                </span>
              </Card>
            ))}
          </div>
        </div>
      ) : tab === "Notifications" ? (
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            Saved on this device as your defaults. Delivery (email and in-app) switches on with the
            notifications backend; these preferences carry over when it does.
          </p>
          <Card className="divide-y divide-border-soft">
            {NOTIFICATIONS.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">{n.label}</div>
                  <div className="text-xs text-fg-muted">{n.desc}</div>
                </div>
                <Toggle on={notify[n.id]} onClick={() => toggleNotify(n.id)} />
              </div>
            ))}
          </Card>
        </div>
      ) : tab === "Profile" ? (
        <div className="space-y-3">
          <Card className="divide-y divide-border-soft">
            <Row label="Workspace" value={BRAND.name} />
            <Row label="Owner" value={BRAND.ownerFirstName} />
            <Row label="Owner email" value={BRAND.ownerEmail} />
            <Row label="Role" value="Owner" />
            <Row label="Authentication" value={authMode === "clerk" ? "Clerk SSO" : "Password gate"} />
            <Row label="Theme" value="Light or dark, toggled in the sidebar" />
          </Card>
          <p className="text-xs text-fg-muted">
            Workspace and owner come from the brand config. Per-user name, email, and avatar populate from
            Clerk once per-user sign-in is enabled.
          </p>
        </div>
      ) : tab === "Billing" ? (
        <div className="space-y-3">
          <Card className="divide-y divide-border-soft">
            <Row label="Workspace" value={BRAND.name} />
            <Row label="Plan" value="Internal operating dashboard (HQ), not a billed subscription" />
            <Row label="Client payments" value="Processed in Stripe" />
            <Row label="Stripe connection" value={stripeConnected ? "Connected" : "Not connected"} />
          </Card>
          <p className="text-xs text-fg-muted">Client revenue and refunds live in Financials. This tab covers the HQ workspace itself.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-fg">Authentication</div>
              <div className="text-xs text-fg-muted">
                {authMode === "clerk" ? "Clerk SSO sessions, per-user roles." : "Shared password gate. Clerk not yet enabled."}
              </div>
            </div>
            <span className={`flex items-center gap-1.5 text-xs ${authMode === "clerk" ? "text-positive" : "text-warn"}`}>
              <span className={`h-2 w-2 rounded-pill ${authMode === "clerk" ? "bg-positive" : "bg-warn"}`} />
              {authMode === "clerk" ? "Clerk active" : "Password gate"}
            </span>
          </Card>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Roles &amp; access</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(Object.keys(ROLE_CONFIG) as Role[]).map((role) => {
                const cfg = ROLE_CONFIG[role];
                const screens = cfg.navGroups.reduce((n, g) => n + g.items.length, 0);
                return (
                  <Card key={role}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize text-fg">{role}</span>
                      <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums text-fg-muted">{screens} screens</span>
                    </div>
                    <div className="mt-1 text-xs text-fg-dim">{ROLE_SCOPE[role]}</div>
                    <div className="mt-1 text-[11px] text-fg-muted">Lands on {cfg.defaultRoute}</div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
