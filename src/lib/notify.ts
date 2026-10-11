// R6-5: portal-owned notifications (notifications table, migration
// 20260808000003). The dashboard is the source of truth; Slack is a delivery
// channel. Inserts happen inside the same server action as the event and
// attempt immediate Slack delivery (stamping delivered_slack_at); the cron
// route retries undelivered rows older than 5 minutes. Everything here is
// best-effort and team-internal: a notification failure never breaks the
// action, and nothing client-facing is ever sent.

import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { notifySlack, slackConfigured } from "@/lib/slack";

export type PortalNotification = {
  id: string;
  recipientName: string;
  type: string;
  payload: Record<string, string>;
  createdAt: string;
  readAt: string | null;
};

/** One-line Slack rendering per type; the payload carries the details. */
export function notificationText(n: { recipientName: string; type: string; payload: Record<string, string> }): string {
  const p = n.payload;
  switch (n.type) {
    case "task_assigned":
      return `@${n.recipientName}: new ${p.template ?? "task"} on your board: ${p.title ?? ""}`;
    case "task_blocked":
      return `@${n.recipientName}: ${p.by ?? "someone"} is blocked on "${p.title ?? "a task"}": ${p.reason ?? ""}`;
    case "task_escalated":
      return `@${n.recipientName}: escalation from ${p.by ?? "ops"}: ${p.title ?? ""} (${p.note ?? ""})`;
    case "client_assigned":
      return `@${n.recipientName}: new client ${p.client ?? ""} starts ${p.startDate ?? ""}.`;
    case "capacity_nudge":
      return `@${n.recipientName}: reminder to submit your capacity for the week starting ${p.week ?? "this week"}.`;
    case "task_completed":
      return `@${n.recipientName}: ${p.by ?? "someone"} completed "${p.title ?? "a task"}".`;
    case "backup_failed":
      return `@${n.recipientName}: NIGHTLY BACKUP FAILED for ${p.brand ?? "?"} (run ${p.run ?? "?"}). Check rawandformed/tjd-hq-backups Actions.`;
    case "role_change":
      return `@${n.recipientName}: role change: ${p.target ?? "someone"} is now ${p.to ?? "?"} (was ${p.from ?? "?"}).`;
    case "access_request":
      return `@${n.recipientName}: ${p.name ?? "someone"} (${p.email ?? "?"}) signed in but has no portal access${p.coach ? `, name matches coach ${p.coach}` : ""}. Approve at /access-requests.`;
    default:
      return `@${n.recipientName}: ${p.title ?? n.type}`;
  }
}

/** Insert + immediate best-effort Slack delivery. Never throws. */
/** Insert + immediate Slack attempt. Never throws; the return says what
 *  actually happened (R8-2: callers whose UI claims "reminder sent" must be
 *  able to say honestly whether a Slack ping went out). */
export async function insertNotification(input: {
  recipientName: string;
  type: string;
  payload: Record<string, string>;
}): Promise<{ stored: boolean; slack: boolean }> {
  if (!persistenceEnabled() || !input.recipientName) return { stored: false, slack: false };
  try {
    const { data, error } = await dbAdmin()
      .from("notifications")
      .insert({ recipient_name: input.recipientName, type: input.type, payload: input.payload })
      .select("id")
      .single();
    if (error || !data) return { stored: false, slack: false }; // table absent pre-migration
    if (slackConfigured()) {
      await notifySlack(notificationText(input));
      await dbAdmin()
        .from("notifications")
        .update({ delivered_slack_at: new Date().toISOString() })
        .eq("id", data.id);
      return { stored: true, slack: true };
    }
    return { stored: true, slack: false };
  } catch {
    return { stored: false, slack: false };
  }
}

/** Unread rows for one recipient, newest first (bell). Empty pre-migration. */
export async function listUnreadNotifications(recipientName: string, limit = 10): Promise<PortalNotification[]> {
  if (!persistenceEnabled() || !recipientName) return [];
  const { data, error } = await dbAdmin()
    .from("notifications")
    .select("id, recipient_name, type, payload, created_at, read_at")
    .eq("recipient_name", recipientName)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as {
    id: string;
    recipient_name: string;
    type: string;
    payload: Record<string, string> | null;
    created_at: string;
    read_at: string | null;
  }[]).map((r) => ({
    id: r.id,
    recipientName: r.recipient_name,
    type: r.type,
    payload: r.payload ?? {},
    createdAt: r.created_at,
    readAt: r.read_at,
  }));
}

/** Cron retry: deliver undelivered rows older than 5 minutes. Returns the
 *  count attempted. */
export async function deliverPendingNotifications(): Promise<number> {
  if (!persistenceEnabled() || !slackConfigured()) return 0;
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data, error } = await dbAdmin()
    .from("notifications")
    .select("id, recipient_name, type, payload")
    .is("delivered_slack_at", null)
    .lt("created_at", cutoff)
    .limit(50);
  if (error || !data) return 0;
  let delivered = 0;
  for (const r of data as { id: string; recipient_name: string; type: string; payload: Record<string, string> | null }[]) {
    try {
      await notifySlack(notificationText({ recipientName: r.recipient_name, type: r.type, payload: r.payload ?? {} }));
      await dbAdmin().from("notifications").update({ delivered_slack_at: new Date().toISOString() }).eq("id", r.id);
      delivered++;
    } catch {
      /* keep going */
    }
  }
  return delivered;
}
