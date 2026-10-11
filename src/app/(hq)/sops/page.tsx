import { SopsScreen } from "@/components/screens/documents/sops-view";
import { CoachSopsView } from "@/components/screens/coach-tools/coach-sops-view";
import { getServerRole } from "@/lib/role-server";

// Coaches see Dan's coaching SOPs; owner/others see the business SOPs store.
export default async function SopsPage() {
  const role = await getServerRole();
  if (role === "coach") return <CoachSopsView />;
  return <SopsScreen />;
}
