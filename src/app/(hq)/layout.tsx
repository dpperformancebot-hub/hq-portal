import { headers } from "next/headers";
import { RoleProvider } from "@/components/role/role-provider";
import { SensitiveProvider } from "@/components/sensitive-provider";
import { ToastProvider } from "@/components/ui";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CoachImpersonationBanner } from "@/components/shell/coach-impersonation-banner";
import { RouteGuard } from "@/components/shell/route-guard";
import { RefreshOnFocus } from "@/components/shell/refresh-on-focus";
import { TitleSetter } from "@/components/shell/title-setter";
import { AssistantBubble } from "@/components/shell/assistant-bubble";
import { clerkAuthEnabled, getServerIdentity } from "@/lib/role-server";
import { getCoachNamesData, getNotificationsData } from "@/lib/data";
import { GHL_LOCATION_ID } from "@/lib/ghl/client";
import { HQ_COLUMN_CLASS, HQ_MAIN_CLASS, HQ_SHELL_CLASS } from "@/components/shell/shell-classes";

// Owner shell: fixed sidebar + topbar wrapping every HQ screen.
// Embed mode (inside the GHL Custom Menu Link iframe, detected in
// middleware via Sec-Fetch-Dest): the HQ drops its own sidebar/topbar so
// GHL's left nav is the only navigation. Standalone visits get the full shell.
// AUTH_MODE=clerk: the server-resolved role is passed in and LOCKS the
// client shell (sidebar scoped, no dev switching); embedded visits stay on
// the password gate and keep today's behaviour.
export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const embedded = h.get("x-hq-embed") === "1";
  const identity = await getServerIdentity();
  // Lock the shell to the server role under real auth, OR whenever an owner is
  // impersonating a coach (so the shell becomes that coach's portal).
  const authRole = (clerkAuthEnabled() && !embedded) || identity.impersonating ? identity.role : null;

  if (embedded) {
    return (
      <RoleProvider isHeadCoach={identity.isHeadCoach}>
        <ToastProvider>
          <div className={HQ_SHELL_CLASS}>
            <div className={HQ_COLUMN_CLASS}>
              <RouteGuard />
              <RefreshOnFocus />
              <TitleSetter />
              <SensitiveProvider>
              <main className={HQ_MAIN_CLASS}>{children}</main>
            </SensitiveProvider>
            </div>
          </div>
        </ToastProvider>
      </RoleProvider>
    );
  }

  // Coach names: the dev preview picker (dev mode) and the impersonation banner
  // label both need them. Skip the fetch when neither applies.
  const coachNames = authRole === null || identity.impersonating ? await getCoachNamesData() : {};
  const previewCoaches =
    authRole === null
      ? Object.entries(coachNames)
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  const impersonatingName =
    identity.impersonating && identity.linkedCoachId ? coachNames[identity.linkedCoachId] ?? "this coach" : null;

  // Topbar extras (2026-07-02 "feels alive" pass): role-scoped notifications
  // and the CRM add-client link. Clients are created in GHL, so Add client
  // deep-links there; owner-only (coaches/sales/va do not create clients).
  const notifications = await getNotificationsData(identity);
  const addClientUrl =
    identity.realRole === "owner"
      ? `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/smart_list/All`
      : undefined;

  // Profile name: the signed-in person, or the coach whose portal an owner is
  // currently viewing (so the bottom-left profile matches the shell context).
  const profileName = identity.impersonating ? impersonatingName : identity.displayName;

  return (
    <RoleProvider
      authRole={authRole}
      realRole={identity.realRole}
      isHeadCoach={identity.isHeadCoach}
      displayName={profileName}
    >
      <ToastProvider>
        <div className={HQ_SHELL_CLASS}>
          <Sidebar />
          <div className={HQ_COLUMN_CLASS}>
            {identity.impersonating ? <CoachImpersonationBanner coachName={impersonatingName ?? "this coach"} /> : null}
            <Topbar coaches={previewCoaches} notifications={notifications} addClientUrl={addClientUrl} />
            <RouteGuard />
            <RefreshOnFocus />
            <TitleSetter />
            <SensitiveProvider forced={identity.role === "ops_manager"}>
              <main className={HQ_MAIN_CLASS}>{children}</main>
            </SensitiveProvider>
            {/* I1: floating Coach Assistant, coach sessions only, key-gated. */}
            {identity.role === "coach" && process.env.ANTHROPIC_API_KEY ? <AssistantBubble /> : null}
          </div>
        </div>
      </ToastProvider>
    </RoleProvider>
  );
}
