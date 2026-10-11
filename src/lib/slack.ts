// Internal Slack notifications (2026-07-10, head-coach workflow).
//
// Posts to a Slack incoming webhook (SLACK_WEBHOOK_URL env). TEAM-INTERNAL
// ONLY: this never contacts clients or leads, it pings the DP team channel
// about portal events (plan submitted, approved). It is deliberately outside
// the outreach guard because it is not an outbound-contact path; keep it that
// way, never put a client-facing send behind this helper.
//
// Fail-silent by design: a Slack outage must never break a portal action.

export async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return; // not configured yet: no-op
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      // Keep the portal snappy; Slack is best-effort.
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* best-effort */
  }
}

export function slackConfigured(): boolean {
  return Boolean(process.env.SLACK_WEBHOOK_URL);
}

// R2-6: each ping type is individually toggleable so channels can be tuned.
// Unset = ON (a freshly configured webhook gets everything); set the env var
// to "false" to silence that ping type without touching the others.
export type SlackPingKind = "assign" | "checkin" | "onboarding";

const PING_ENV: Record<SlackPingKind, string> = {
  assign: "SLACK_PING_ASSIGN",
  checkin: "SLACK_PING_CHECKIN",
  onboarding: "SLACK_PING_ONBOARDING",
};

export function slackPingEnabled(kind: SlackPingKind): boolean {
  return process.env[PING_ENV[kind]] !== "false";
}
