import { MyClientsView } from "@/components/screens/coach-tools/my-clients-view";
import { getCoachRosterData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";

// Coach-only route (RouteGuard scopes it via the coach nav). Roster is
// pre-scoped to the logged-in coach (dev preview: head coach).
// ownOnly (R15-1): this screen is "MY Clients", so the head coach sees his own
// roster here, not every coach's. The deliberately wide head-coach surfaces
// (Client Audits, Coach Performance, Client Database) are unaffected.
export default async function MyClientsPage() {
  const identity = await getServerIdentity();
  // viewer: on TJD a coach's roster crosses with every client price zeroed.
  return (
    <MyClientsView
      data={await getCoachRosterData(identity.linkedCoachId, { ownOnly: true, viewer: identity })}
    />
  );
}
