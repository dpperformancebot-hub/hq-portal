import { redirect } from "next/navigation";
import { SettingsView } from "@/components/screens/team/settings-view";
import type { Integration } from "@/lib/seed";
import { ghlConfigured } from "@/lib/ghl/client";
import { stripeConfigured } from "@/lib/stripe";
import { persistenceEnabled } from "@/lib/db/client";
import { getNotificationPrefs } from "@/lib/local-state";
import { getDefaultRoute } from "@/lib/navigation";
import { getServerIdentity } from "@/lib/role-server";

// Server component: connection status is computed from real config (env), not
// seed. We only READ whether each integration is configured; connecting/secrets
// happen in Vercel env, never in-app.
// HARD EXCLUSION (2026-07-11 audit): coaches (incl. head coach) redirect
// server-side, matching /financials and /team, not just the client RouteGuard.
export default async function SettingsPage() {
  const identity = await getServerIdentity();
  if (identity.role === "coach") redirect(getDefaultRoute(identity.role));
  const integrations: Integration[] = [
    { id: "ghl", name: "GoHighLevel", category: "CRM, source of truth", connected: ghlConfigured() },
    { id: "supabase", name: "Supabase", category: "Datastore (HQ persistence)", connected: persistenceEnabled() },
    { id: "stripe", name: "Stripe", category: "Payments + financials", connected: stripeConfigured() },
    { id: "kahunas", name: "Kahunas (via Zapier)", category: "Coaching check-ins", connected: Boolean(process.env.KAHUNAS_WEBHOOK_SECRET) },
    { id: "clerk", name: "Clerk", category: "Authentication", connected: process.env.AUTH_MODE === "clerk" },
    { id: "calendly", name: "Calendly", category: "Scheduling", connected: false },
    { id: "zoom", name: "Zoom", category: "Video calls", connected: false },
    { id: "whatsapp", name: "WhatsApp", category: "Messaging", connected: false },
    { id: "typeform", name: "Typeform", category: "Lead forms", connected: false },
    { id: "manychat", name: "ManyChat", category: "Messaging", connected: false },
    { id: "gcal", name: "Google Calendar", category: "Scheduling", connected: false },
  ];
  const savedPrefs = await getNotificationPrefs();
  return (
    <SettingsView
      integrations={integrations}
      authMode={process.env.AUTH_MODE === "clerk" ? "clerk" : "password"}
      savedPrefs={savedPrefs}
      canEditPay={identity.realRole === "owner" || identity.role === "admin"}
    />
  );
}
