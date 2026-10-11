import { RecipesView } from "@/components/screens/coach-tools/recipes-view";
import { listRecipes } from "@/lib/recipes-actions";
import { getServerIdentity } from "@/lib/role-server";

// Shared recipe library (2026-07-11): the built-ins plus every coach's
// uploads, merged in listRecipes (DB wins on title). Any coach or the owner
// can upload; only the head coach and owner can remove uploaded rows.
export default async function RecipesPage() {
  const { role, realRole, isHeadCoach } = await getServerIdentity();
  return (
    <RecipesView
      recipes={await listRecipes()}
      canUpload={role === "coach" || realRole === "owner"}
      canDelete={realRole === "owner" || isHeadCoach}
    />
  );
}
