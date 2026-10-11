import { redirect } from "next/navigation";

// R16-5c: the sidebar entry Dan asked for ("a tab for that"). The work happens
// on the Journey Tracker; this route just lands there with the Unassigned
// filter preselected so the queue is the first thing on screen.
export default function AssignClientsPage() {
  redirect("/client-journey?filter=unassigned");
}
