import { getTasks as getSeedTasks } from "@/lib/seed";
import { listTasks, listTaskDirectory, toTaskAssignees, type TaskAssignee } from "@/lib/tasks";
import { assignableFor, buildTaskDirectory, taskRoleFor, type DirectoryEntry } from "@/lib/task-assignees";
import { getCoaches as getSeedCoaches } from "@/lib/seed";
import { BRAND } from "@/lib/brand";
import { getCoachNamesData, getCoachRosterData, getCoachTasksData, getClientsData, liveMode } from "@/lib/data";
import { listWeekCapacity } from "@/lib/capacity";
import { persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { canViewAllClientData } from "@/lib/access-policy";
import { TasksView } from "@/components/screens/tasks/tasks-view";

// HQ-native tasks. The list reads the live Supabase tasks table whenever
// persistence is on; create/complete/edit/delete are enabled only when the
// screen is showing that live store (live mode + persistence), so the controls
// never no-op. Demo mode is a read-only seed view.
//
// A coach sees ONLY tasks assigned to them or opened by them (scoped in
// getCoachTasksData), with the team scope toggle hidden.
//
// Assignee picker (2026-10-08): every active coach, every pending/claimed
// invitee and every active login, deduped (src/lib/task-assignees.ts), then
// narrowed to who THIS viewer may assign to (canAssignTaskTo; the server
// actions re-check). Invitees are assignable before their first sign-in.

/** The assignee directory: live tables when persistence is on, else the seed
 *  coaches + owner (demo board is read-only anyway). */
async function loadDirectory(persisted: boolean): Promise<DirectoryEntry[]> {
  if (persisted) {
    return listTaskDirectory().catch(() =>
      buildTaskDirectory({ ownerName: BRAND.ownerName, coaches: [] }),
    );
  }
  return buildTaskDirectory({
    ownerName: BRAND.ownerName,
    coaches: getSeedCoaches().map((c) => ({ id: c.id, name: c.name, role: c.role, is_active: true })),
  });
}

export default async function TasksPage() {
  const identity = await getServerIdentity();
  const { role, linkedCoachId } = identity;
  // R6-1: simplified role for template gating (server re-checks on create).
  const viewerRole = taskRoleFor(identity);
  const persisted = persistenceEnabled();
  const directory = await loadDirectory(persisted);

  if (role === "coach") {
    // The signed-in person's own keys only when they ARE this coach; an owner
    // viewing as a coach matches on the coach's name alone.
    const ownKeys = identity.impersonating
      ? undefined
      : { userId: identity.userId ?? null, names: identity.displayName ? [identity.displayName] : [] };
    const [{ coachName, tasks, live }, roster, coachNames] = await Promise.all([
      getCoachTasksData(linkedCoachId, ownKeys),
      getCoachRosterData(linkedCoachId, { viewer: identity }),
      getCoachNamesData(),
    ]);
    // README §5: the unassigned-client queue lives on the HEAD COACH's board.
    let unassigned: { id: string; name: string; startDate: string | null; plan: string }[] = [];
    let coaches: { id: string; name: string }[] = [];
    const capacityByCoach: Record<string, string> = {};
    if (identity.isHeadCoach) {
      const [all, weekCapacity] = await Promise.all([getClientsData(), listWeekCapacity()]);
      unassigned = all
        .filter((c) => (c.status === "active" || c.status === "paused") && !c.coachId)
        .map((c) => ({ id: c.id, name: c.name, startDate: c.startDate, plan: c.plan }))
        .sort((a, b) => (b.startDate ? Date.parse(b.startDate) : 0) - (a.startDate ? Date.parse(a.startDate) : 0));
      coaches = Object.entries(coachNames)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const c of weekCapacity) capacityByCoach[c.coachId] = c.capacity;
    }
    return (
      <TasksView
        tasks={tasks}
        assignees={toTaskAssignees(
          assignableFor(directory, {
            role: viewerRole,
            coachId: linkedCoachId,
            names: [coachName ?? "", ...(ownKeys?.names ?? [])].filter(Boolean),
          }),
        )}
        live={live}
        viewer={coachName ?? ""}
        viewerNames={ownKeys?.names ?? []}
        viewerUserId={ownKeys?.userId ?? null}
        allowTeamScope={false}
        viewerRole={viewerRole}
        // Picker matches show coach/plan/status (mockup).
        pauseClients={roster.clients.map((c) => ({
          id: c.id,
          name: c.name,
          coachName: c.coachId ? coachNames[c.coachId] : undefined,
          plan: c.plan,
          status: c.status,
        }))}
        unassignedQueue={unassigned}
        queueCoaches={coaches}
        capacityByCoach={capacityByCoach}
      />
    );
  }

  let tasks = getSeedTasks();
  if (persisted) tasks = await listTasks().catch(() => []);
  // Whose board "My tasks" is: the owner tier (real owner) is the brand owner;
  // everyone else is themselves (users.name), falling back to the owner name
  // in dev preview where there is no signed-in person.
  const viewer = identity.realRole === "owner" ? BRAND.ownerName : identity.displayName ?? BRAND.ownerName;
  const viewerNames = [identity.displayName ?? ""].filter(Boolean);
  const assignees: TaskAssignee[] = toTaskAssignees(
    assignableFor(directory, { role: viewerRole, coachId: null, names: [viewer, ...viewerNames] }),
  );
  // R5-2: owner/ops file requests for anyone; picker rows carry coach/plan/
  // status per the mockup.
  // SEC-AUDIT (2026-09-06): the picker list is the whole active roster. Only
  // all-client roles get it; sales/ambassador_mgr get an empty picker.
  const seesAllClients = canViewAllClientData({ role, realRole: identity.realRole, isHeadCoach: identity.isHeadCoach, linkedCoachId });
  const ownerCoachNames = seesAllClients ? await getCoachNamesData() : {};
  const allClients = (seesAllClients ? await getClientsData() : [])
    .filter((c) => c.status === "active" || c.status === "paused")
    .map((c) => ({
      id: c.id,
      name: c.name,
      coachName: c.coachId ? ownerCoachNames[c.coachId] : undefined,
      plan: c.plan,
      status: c.status,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <TasksView
      tasks={tasks}
      assignees={assignees}
      live={liveMode() && persisted}
      viewer={viewer}
      viewerNames={viewerNames}
      viewerUserId={identity.userId ?? null}
      pauseClients={allClients}
      viewerRole={viewerRole}
    />
  );
}
