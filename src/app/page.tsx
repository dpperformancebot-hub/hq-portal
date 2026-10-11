import { redirect } from "next/navigation";

// Entry point redirects to the owner default route. Per-role defaults are
// applied client-side by the shell's RouteGuard once a role is active.
export default function Home() {
  redirect("/dashboard");
}
