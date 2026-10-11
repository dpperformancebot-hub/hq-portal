import { PausesView } from "@/components/screens/pauses/pauses-view";
import { listPauses } from "@/lib/pause-actions";
import { getClientsData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { isOpsRole } from "@/lib/navigation";

// R4-1: pause board. Owner/VA/head coach edit; a plain coach's list is
// server-scoped to their own roster (listPauses) and read-only.
export default async function PausesPage() {
  const identity = await getServerIdentity();
  const [rows, clients] = await Promise.all([listPauses(), getClientsData()]);
  const canEdit =
    identity.realRole === "owner" || isOpsRole(identity.role) || (identity.role === "coach" && identity.isHeadCoach);
  const pickable = clients
    .filter((c) => c.status === "active" || c.status === "paused")
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return <PausesView rows={rows} clients={canEdit ? pickable : []} canEdit={canEdit} />;
}
