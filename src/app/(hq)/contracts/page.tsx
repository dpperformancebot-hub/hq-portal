import { ContractsView } from "@/components/screens/documents/contracts-view";
import { getContracts, liveMode } from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { canManageBrandContent } from "@/lib/access-policy";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

// Writes land in the live document store, so they are enabled only when the
// screen is reading live from Supabase (live mode + persistence). Demo mode
// stays a read-only seed view with the honest disabled-button label.
export default async function ContractsPage() {
  // R11 guard: server-side allowlist. The client RouteGuard cannot stop
  // the RSC payload from streaming, so the block must happen here.
  const _id = await getServerIdentity();
  if (!canManageBrandContent({ role: _id.role, realRole: _id.realRole, isHeadCoach: _id.isHeadCoach, linkedCoachId: _id.linkedCoachId })) {
    redirect(getDefaultRoute(_id.role));
  }
  const canWrite = liveMode() && persistenceEnabled();
  return <ContractsView contracts={await getContracts()} canWrite={canWrite} />;
}
