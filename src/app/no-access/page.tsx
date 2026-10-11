import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { BRAND } from "@/lib/brand";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { insertNotification } from "@/lib/notify";
import { recordAccessRequest } from "@/lib/access-requests";
import { clerkAuthEnabled } from "@/lib/role-server";

// R13-2 holding screen. Reached when a signed-in Clerk user has no users row
// and no matching invite (role-server redirects here). Deliberately OUTSIDE
// the (hq) shell: no sidebar, no data, no role. Shows the address they signed
// up with so they can tell their admin the right one, and files ONE pending
// access request for the approvers (/access-requests).
export default async function NoAccessPage() {
  if (!clerkAuthEnabled()) redirect("/dashboard");
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Already granted since this page was last loaded? Straight in.
  if (persistenceEnabled()) {
    const { data } = await dbAdmin().from("users").select("role").eq("clerk_id", userId).maybeSingle();
    if (data?.role) redirect("/dashboard");
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? "";
  const name = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null;

  let requested = false;
  if (persistenceEnabled() && email) {
    const res = await recordAccessRequest({ clerkId: userId, email, name }).catch(() => null);
    requested = Boolean(res?.stored);
    if (res?.created) {
      try {
        await insertNotification({
          recipientName: BRAND.ownerName,
          type: "access_request",
          payload: { name: name ?? email, email, coach: res.suggestedCoach?.name ?? "" },
        });
      } catch {
        /* the request row is the record */
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-8 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{BRAND.name}</div>
        <h1 className="mt-2 font-display text-2xl tracking-[-0.018em] text-fg">No access yet</h1>
        <p className="mt-3 text-sm text-fg-dim">
          You are signed in, but this address is not linked to a portal login yet:
        </p>
        <div className="mt-2 rounded-control border border-border-soft bg-surface-2 px-3 py-2 font-mono text-sm text-fg">
          {email || "(no email on this account)"}
        </div>
        <p className="mt-4 text-sm text-fg-dim">
          {requested
            ? "Your admin has been asked to approve this login. Once they do, sign in again and you will land in your portal."
            : "Send this address to your admin so they can link it to your portal login, then sign in again."}
        </p>
        <p className="mt-2 text-xs text-fg-muted">
          Signed up with the wrong email? Sign out and create the account with the address your admin has for you.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <SignOutButton redirectUrl="/sign-in">
            <button
              type="button"
              className="rounded-control border border-border px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
            >
              Sign out
            </button>
          </SignOutButton>
          <Link href="/dashboard" className="text-sm text-accent hover:underline">
            Try again
          </Link>
        </div>
      </div>
    </div>
  );
}
