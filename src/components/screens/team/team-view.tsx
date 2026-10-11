"use client";

import { useState, useTransition } from "react";
import { Avatar, Button, Card, DataTable, EmptyState, PageHeader, Panel, useToast, type Column } from "@/components/ui";
import { RemovedCoachesPanel } from "@/components/screens/team/removed-coaches-panel";
import { getNavGroups, ROLES, type Role } from "@/lib/navigation";
import type { TeamMember } from "@/lib/seed";
import type { Invite } from "@/lib/invites";
import Link from "next/link";
import { addInviteEmailAction, checkInviteStatusAction, createInviteAction, resendInviteAction, revokeInviteAction } from "@/lib/invites-actions";
import {
  setHeadCoachAction,
  updateLoginAction,
  type LoginRow,
  type RoleChangeRow,
} from "@/lib/users-admin-actions";

const COLUMNS: Column<TeamMember>[] = [
  {
    key: "name",
    header: "Name",
    render: (m) => (
      <span className="flex items-center gap-2">
        <Avatar name={m.name} size="sm" />
        <span className="font-medium text-fg">{m.name}</span>
      </span>
    ),
  },
  { key: "role", header: "Role", render: (m) => <span className="text-fg-dim">{m.role}</span> },
  { key: "access", header: "Access", width: "120px", render: (m) => <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] text-fg-dim">{m.access}</span> },
  {
    key: "status",
    header: "Status",
    width: "100px",
    render: (m) => <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium capitalize ${m.status === "active" ? "bg-positive-soft text-positive" : "bg-warn-soft text-warn"}`}>{m.status}</span>,
  },
];

type CoachOpt = { id: string; name: string };
const ROLE_LABEL: Record<Role, string> = { owner: "Owner", coach: "Coach", sales: "Sales", va: "VA", admin: "Admin", ops_manager: "Ops Manager", ambassador_mgr: "Ambassador Mgr" };
const inputCls =
  "w-full rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent disabled:opacity-50";

function InviteSection({ authReady, invites, coaches }: { authReady: boolean; invites: Invite[]; coaches: CoachOpt[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("coach");
  const [coachId, setCoachId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const disabled = !authReady || pending;

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await createInviteAction({ name, email, role, linkedCoachId: role === "coach" ? coachId || null : null });
      if (res.ok) {
        setMsg({ ok: true, text: `Invited ${name || email}. They get their access on first sign-in.` });
        setName(""); setEmail(""); setRole("coach"); setCoachId("");
      } else {
        setMsg({ ok: false, text: res.error ?? "Could not add invite." });
      }
    });
  }

  return (
    <Panel title="Invite a team member">
      {!authReady && (
        <p className="mb-3 rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-xs text-fg-dim">
          Logins aren&apos;t switched on yet, so inviting is disabled. Once Clerk is connected, invites you add
          here grant each teammate their scoped access on first sign-in.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-fg-dim">Name</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" disabled={disabled} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-fg-dim">Email</span>
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" disabled={disabled} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-fg-dim">Role</span>
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={disabled}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r as Role]}</option>
            ))}
          </select>
        </label>
        {role === "coach" && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-fg-dim">Which coach</span>
            <select className={inputCls} value={coachId} onChange={(e) => setCoachId(e.target.value)} disabled={disabled}>
              <option value="">Select coach…</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={submit} disabled={disabled}>{pending ? "Adding…" : "Add invite"}</Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-positive" : "text-danger"}`}>{msg.text}</span>}
      </div>

      <div className="mt-5 border-t border-border-soft pt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
          Pending &amp; recent invites
        </div>
        {invites.length === 0 ? (
          <EmptyState icon="user" title="No invites yet" message="Add someone above and they appear here until they sign up." />
        ) : (
          <div className="divide-y divide-border-soft">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-fg">
                    {inv.name} <span className="text-fg-muted">· {ROLE_LABEL[inv.role]}</span>
                  </div>
                  <div className="truncate text-xs text-fg-muted">
                    {inv.email}
                    {inv.altEmails.length > 0 ? <span className="text-fg-dim"> · also {inv.altEmails.join(", ")}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`text-xs ${inv.claimedAt ? "text-positive" : "text-fg-muted"}`}>
                    {inv.claimedAt ? "Signed up" : "Pending"}
                  </span>
                  {/* R19-2a: what Clerk did with the EMAIL, which is a
                      different thing from whether they have signed up yet. An
                      invite can be Pending because the email failed, and that
                      used to look identical to Pending because they have not
                      got round to it. */}
                  {!inv.claimedAt ? <InviteEmailStatus invite={inv} /> : null}
                  {!inv.claimedAt && <AddEmailButton id={inv.id} />}
                  {!inv.claimedAt && <RevokeButton id={inv.id} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

/** R13-3: a second address the same person may sign up with (personal
 *  Gmail next to a work email). Matching is normalised server-side. */
function AddEmailButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Add another email this person might sign up with">
        + email
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="other@gmail.com"
        className="w-44 rounded-control border border-border-soft bg-surface-2 px-2 py-1 text-xs text-fg outline-none focus:border-accent"
        disabled={pending}
      />
      <Button
        size="sm"
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await addInviteEmailAction(id, email);
            if (res.ok) {
              setOpen(false);
              setEmail("");
            } else setError(res.error ?? "Could not add.");
          })
        }
        disabled={pending || !email.includes("@")}
      >
        {pending ? "…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

/** Sent / Failed / not recorded, plus Resend. "not recorded" is the honest
 *  state before migration 20261001000001 is applied: the email still goes, we
 *  just have nowhere to store what happened to it yet. */
function InviteEmailStatus({ invite }: { invite: Invite }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(invite.clerkStatus ?? null);

  const map: Record<string, { text: string; cls: string }> = {
    sent: { text: "Email sent", cls: "text-positive" },
    already_invited: { text: "Email sent", cls: "text-positive" },
    already_a_user: { text: "Already has a login", cls: "text-fg-muted" },
    revoked: { text: "Revoked", cls: "text-fg-muted" },
    skipped: { text: "No email: Clerk not configured", cls: "text-warn" },
    failed: { text: "Email failed", cls: "text-danger" },
  };
  const shown = status ? (map[status] ?? { text: status, cls: "text-fg-muted" }) : null;

  return (
    <>
      {shown ? (
        <span className={`text-xs ${shown.cls}`} title={invite.clerkError ?? undefined}>
          {shown.text}
        </span>
      ) : (
        <>
          <span className="text-xs text-fg-muted">email status not recorded</span>
          {/* Reads what Clerk already holds and records it. Sends nothing and
              revokes nothing, so an invite created before the status columns
              existed can be filled in without disturbing a live sign-up link
              the person may be part way through using. */}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await checkInviteStatusAction(invite.email);
                if (!r.ok) { toast.push(r.error); return; }
                setStatus(r.invite.status);
              })
            }
            className="rounded-pill border border-border px-2 py-0.5 text-[11px] text-fg-dim transition-colors hover:border-accent/40 hover:text-fg disabled:opacity-60"
            title="Ask Clerk what it holds for this address. Sends nothing."
          >
            {pending ? "…" : "Check"}
          </button>
        </>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await resendInviteAction(invite.email);
            if (!r.ok) { toast.push(r.error); return; }
            setStatus(r.invite.status);
            toast.push(r.invite.status === "sent" ? `Invite email sent to ${invite.email}.` : `Invite: ${r.invite.status.replace(/_/g, " ")}`);
          })
        }
        className="rounded-pill border border-border px-2 py-0.5 text-[11px] text-fg-dim transition-colors hover:border-accent/40 hover:text-fg disabled:opacity-60"
      >
        {pending ? "…" : "Resend"}
      </button>
    </>
  );
}

function RevokeButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await revokeInviteAction(id);
            if (!res.ok) setError(res.error ?? "Could not revoke.");
          })
        }
        disabled={pending}
      >
        {pending ? "…" : "Revoke"}
      </Button>
    </span>
  );
}

/** R7-4 confirm dialog: states exactly what the person gains and loses
 *  (screen lists straight from the nav config, the same source the shell
 *  enforces) before an owner commits a role change. */
function RoleChangeConfirm({
  name,
  fromRole,
  toRole,
  onConfirm,
  onCancel,
  pending,
}: {
  name: string;
  fromRole: Role;
  toRole: Role;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const screens = (r: Role) => getNavGroups(r).flatMap((g) => g.items.map((i) => i.label));
  const from = new Set(screens(fromRole));
  const to = new Set(screens(toRole));
  const gains = [...to].filter((s) => !from.has(s));
  const loses = [...from].filter((s) => !to.has(s));
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-label="Confirm role change"
    >
      <Card className="w-full max-w-md space-y-3">
        <h2 className="font-display text-xl tracking-display text-fg">
          Change {name} to {ROLE_LABEL[toRole]}?
        </h2>
        <p className="text-sm text-fg-dim">
          {name} is currently {ROLE_LABEL[fromRole]}. This changes what they can see and do across the portal.
        </p>
        {toRole === "owner" ? (
          <p className="rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-fg">
            Owner is full access: financials, pay, and role management included.
          </p>
        ) : null}
        {gains.length > 0 ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-positive">Gains</div>
            <p className="mt-1 text-xs text-fg-dim">{gains.join(", ")}</p>
          </div>
        ) : null}
        {loses.length > 0 ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-danger">Loses</div>
            <p className="mt-1 text-xs text-fg-dim">{loses.join(", ")}</p>
          </div>
        ) : null}
        <p className="text-xs text-fg-muted">
          Takes effect on their next page load. The change is recorded in the audit trail and you get a
          notification.
        </p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? "Changing…" : "Confirm change"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// One editable login row: role select + coach link + save, owner-gated
// server-side (updateLoginAction re-checks the caller's REAL role and
// enforces last-owner protection + the audit precondition).
function LoginRowEditor({
  login,
  coaches,
  headCoachId,
  onHeadChange,
  canRemoveCoach = false,
}: {
  login: LoginRow;
  coaches: CoachOpt[];
  headCoachId: string | null;
  onHeadChange: (coachId: string | null) => void;
  /** R19-2c: owner/admin, the same gate the removal action enforces. */
  canRemoveCoach?: boolean;
}) {
  const toast = useToast();
  // R7-4: the role dropdown is back as the real thing (the R5-4 placeholder
  // removal stands superseded): owner-only screen, server re-check, confirm
  // dialog stating gains/losses, audited, last-owner protected.
  const [role, setRole] = useState<Role>(login.role);
  const [savedRole, setSavedRole] = useState<Role>(login.role);
  const [confirming, setConfirming] = useState(false);
  const [coachId, setCoachId] = useState(login.linkedCoachId ?? "");
  const [pending, start] = useTransition();
  const dirty = role === "coach" && (coachId || null) !== login.linkedCoachId;
  const isHead = role === "coach" && !!coachId && coachId === headCoachId;

  // Head-coach tier lives on the coach record (single head at a time: the
  // action demotes any other). Elevated oversight resolves from it live.
  const toggleHead = () =>
    start(async () => {
      const next = !isHead;
      const res = await setHeadCoachAction(coachId, next);
      if (res.ok) {
        onHeadChange(next ? coachId : null);
        toast.push(next ? `${login.name ?? "Coach"} is now HEAD COACH` : "Head-coach tier removed");
      } else toast.push(res.error, "error");
    });

  const save = () =>
    start(async () => {
      const res = await updateLoginAction({
        clerkId: login.clerkId,
        role,
        linkedCoachId: role === "coach" ? coachId || null : null,
      });
      if (res.ok) {
        setSavedRole(role);
        setConfirming(false);
        toast.push(`${login.name ?? "Login"} is now ${ROLE_LABEL[role]}`);
      } else {
        toast.push(res.error, "error");
        setConfirming(false);
        setRole(savedRole);
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="flex min-w-[160px] items-center gap-2">
        <Avatar name={login.name ?? "?"} size="sm" />
        <span className="truncate text-sm font-medium text-fg">{login.name ?? login.clerkId.slice(0, 12)}</span>
      </span>
      {/* R7-4: real role management. Picking a role opens the confirm dialog;
          nothing changes until Confirm, and Cancel reverts the select. */}
      <select
        aria-label={`Role for ${login.name ?? "login"}`}
        className="rounded-control border border-border-soft bg-surface-2 px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
        value={role}
        onChange={(e) => {
          const next = e.target.value as Role;
          if (next === savedRole) {
            setRole(next);
            return;
          }
          setRole(next);
          setConfirming(true);
        }}
        disabled={pending}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {confirming ? (
        <RoleChangeConfirm
          name={login.name ?? "This login"}
          fromRole={savedRole}
          toRole={role}
          pending={pending}
          onConfirm={save}
          onCancel={() => {
            setConfirming(false);
            setRole(savedRole);
          }}
        />
      ) : null}
      {role === "coach" ? (
        <select
          aria-label={`Linked coach for ${login.name ?? "login"}`}
          className="rounded-control border border-border-soft bg-surface-2 px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
          value={coachId}
          onChange={(e) => setCoachId(e.target.value)}
          disabled={pending}
        >
          <option value="">No coach linked</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}
      {role === "coach" && coachId ? (
        <button
          type="button"
          onClick={toggleHead}
          disabled={pending}
          aria-pressed={isHead}
          title={isHead ? "Remove the head-coach oversight tier" : "Promote to head coach (oversight across all coaches, no pay/financials)"}
          className={`rounded-pill px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60 ${
            isHead
              ? "bg-accent text-white"
              : "border border-border text-fg-dim hover:border-accent/40 hover:text-fg"
          }`}
        >
          {isHead ? "★ Head coach" : "Make head coach"}
        </button>
      ) : null}
      {/* R19-2c: removing a coach is a deactivation with a screen of its own,
          because their clients have to go somewhere first. Owner/admin only,
          matching the action's own gate. */}
      {role === "coach" && coachId && canRemoveCoach ? (
        <Link
          href={`/team/remove-coach/${coachId}`}
          className="rounded-pill border border-border px-2.5 py-1 text-[11px] font-medium text-fg-dim transition-colors hover:border-danger/40 hover:text-danger"
          title="Deactivate this coach. Nothing is deleted and their history stays."
        >
          Remove coach
        </Link>
      ) : null}
      {dirty ? (
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      ) : null}
    </div>
  );
}

/** R7-4: who changed whom, from -> to, when. Read-only trail so a role
 *  change is never a mystery later. */
function RoleAuditPanel({ changes }: { changes: RoleChangeRow[] }) {
  const label = (r: string) => ROLE_LABEL[r as Role] ?? r;
  return (
    <Panel title="Role change history" subtitle="Every role change, newest first. Written server-side with the change itself.">
      {changes.length === 0 ? (
        <EmptyState compact icon="user" title="No role changes yet" message="Changes made above appear here with who made them." />
      ) : (
        <div className="divide-y divide-border-soft">
          {changes.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="font-medium text-fg">{c.targetName ?? "Unknown"}</span>
              <span className="text-fg-dim">
                {label(c.fromRole)} → {label(c.toRole)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
                by {c.changedByName ?? "unknown"}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                {new Date(c.changedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** What each role can see, straight from the nav config (the same source the
 *  shell enforces), so this matrix can never drift from reality. */
function PermissionsPanel() {
  return (
    <Panel title="Role permissions">
      <p className="mb-3 text-xs text-fg-dim">
        Access is role-based and enforced server-side. Each role sees only the screens below; data inside them is
        scoped to that person (a coach only ever sees their own roster and pay).
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => {
          const groups = getNavGroups(role);
          const count = groups.reduce((s, g) => s + g.items.length, 0);
          return (
            <div key={role} className="rounded-control border border-border-soft bg-surface-2 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-fg">{ROLE_LABEL[role]}</span>
                <span className="text-xs tabular-nums text-fg-muted">{count} screens</span>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-fg-dim">
                {groups.flatMap((g) => g.items).map((item) => (
                  <li key={item.slug}>{item.label}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function TeamView({
  members,
  authReady,
  invites,
  coaches,
  logins = [],
  isOwner = false,
  headCoachId = null,
  roleChanges = [],
  pendingAccessRequests = 0,
  canAddCoach = false,
}: {
  members: TeamMember[];
  authReady: boolean;
  invites: Invite[];
  coaches: CoachOpt[];
  logins?: LoginRow[];
  isOwner?: boolean;
  headCoachId?: string | null;
  /** R7-4: audit trail rows, owner-only (empty for everyone else). */
  roleChanges?: RoleChangeRow[];
  /** R13-2: unmatched sign-ins waiting for approval. */
  pendingAccessRequests?: number;
  /** R17-4: owner + admin only. Creating a coach also creates a login. */
  canAddCoach?: boolean;
}) {
  // Single head coach at a time; promoting one visually demotes the other
  // rows immediately (the action enforces the same server-side).
  const [headId, setHeadId] = useState<string | null>(headCoachId);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team & Settings"
        title="Team"
        subtitle="Staff, roles, and access. Invite a teammate and they sign in to their own scoped view."
        actions={
          <div className="flex items-center gap-2">
            {/* R19-2b: the primary action, at the top where it is findable. The
                old Add coach panel sat 1.6 screens down under a small-caps
                label, which is why the owner could not find it at all. */}
            {canAddCoach ? (
              <Link
                href="/team/new-coach"
                className="rounded-control bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
              >
                + New coach
              </Link>
            ) : null}
          {authReady ? (
            <Link
              href="/access-requests"
              className={`rounded-control border px-3 py-1.5 text-sm font-medium transition-colors ${
                pendingAccessRequests > 0 ? "border-warn/40 bg-warn-soft text-warn" : "border-border text-fg-dim hover:bg-surface-2"
              }`}
            >
              {pendingAccessRequests > 0 ? `${pendingAccessRequests} access request${pendingAccessRequests === 1 ? "" : "s"} waiting` : "Access requests"}
            </Link>
          ) : null}
          </div>
        }
      />
      {isOwner && authReady ? (
        <Panel title={`Logins (${logins.length})`}>
          {logins.length === 0 ? (
            <EmptyState
              icon="user"
              title="No logins yet"
              message="Clerk accounts appear here once created and linked; manage each login's role and coach link."
            />
          ) : (
            <div className="divide-y divide-border-soft">
              {logins.map((l) => (
                <LoginRowEditor key={l.clerkId} login={l} coaches={coaches} headCoachId={headId} onHeadChange={setHeadId} canRemoveCoach={canAddCoach} />
              ))}
            </div>
          )}
        </Panel>
      ) : null}
      {/* R17-4: one form instead of the old four-step dance. Above Invite on
          purpose: for a NEW coach this is the thing to use, because it creates
          the coach record and the invite together and refuses a near-miss
          spelling. Invite below stays for everyone who is not a coach.
          Not gated on authReady, matching InviteSection: the coach record half
          is useful with or without Clerk, and the action guards the rest. */}
      {/* R19-2b: the full form moved to /team/new-coach. This stays as a
          signpost so anyone who scrolls here still lands in the right place,
          rather than finding two different ways to create a coach. */}
      {canAddCoach ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-sm font-medium text-fg">Adding a coach?</div>
            <div className="text-xs text-fg-dim">
              Creates their record, their pay setup and their login, and emails them to sign in.
            </div>
          </div>
          <Link
            href="/team/new-coach"
            className="rounded-control bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            + New coach
          </Link>
        </Card>
      ) : null}
      {canAddCoach ? <RemovedCoachesPanel /> : null}
      <InviteSection authReady={authReady} invites={invites} coaches={coaches} />
      {isOwner && authReady ? <RoleAuditPanel changes={roleChanges} /> : null}
      {isOwner ? <PermissionsPanel /> : null}
      <Card className="p-2">
        <DataTable columns={COLUMNS} data={members} getRowKey={(m) => m.id} emptyMessage="No team members." />
      </Card>
    </div>
  );
}
