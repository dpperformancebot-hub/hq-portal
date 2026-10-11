// Server-side search index for the global Cmd+K palette. Built on demand by
// the /api/search route (so the full roster is not shipped on every page),
// then filtered client-side in the command palette.
//
// SEC-AUDIT P0-2 (2026-09-06): entity rows are scoped to the caller.
//   clients  all-client roles (owner/admin/ops/va/head coach) see everyone,
//            linking to the client database; a plain coach sees ONLY their
//            own roster, linking to /my-clients; everyone else gets none.
//   coaches  all-client roles only (the row links to Coach Overview).
//   leads    canViewLeadData (all-client roles + sales).
// Screens are scoped to the caller's role nav (head coach gets Oversight).

import {
  canViewAllClientData,
  canViewLeadData,
  scopeClientsForIdentity,
  type AccessIdentity,
} from "@/lib/access-policy";
import { getClientsData, getCoachNamesData, getLeadsData } from "@/lib/data";
import { getNavGroupsFor } from "@/lib/navigation";

export type SearchItemType = "client" | "coach" | "lead" | "screen";

export type SearchItem = {
  id: string;
  type: SearchItemType;
  label: string;
  sublabel: string;
  href: string;
};

function screenItems(id: AccessIdentity): SearchItem[] {
  const items: SearchItem[] = [];
  for (const group of getNavGroupsFor({ role: id.role, isHeadCoach: id.isHeadCoach, realRole: id.realRole })) {
    for (const item of group.items) {
      items.push({
        id: `screen:${item.slug}`,
        type: "screen",
        label: item.label,
        sublabel: group.label,
        href: `/${item.slug}`,
      });
    }
  }
  return items;
}

export async function buildSearchIndex(id: AccessIdentity): Promise<SearchItem[]> {
  const allClients = canViewAllClientData(id);
  const seesLeads = canViewLeadData(id);
  const [clients, coachNames, leads] = await Promise.all([
    scopeClientsForIdentity(id, await getClientsData()),
    getCoachNamesData(),
    seesLeads ? getLeadsData() : Promise.resolve([]),
  ]);

  const clientItems: SearchItem[] = clients.map((c) => ({
    id: `client:${c.id}`,
    type: "client",
    label: c.name,
    sublabel: `${c.coachId ? coachNames[c.coachId] ?? "Unassigned" : "Unassigned"} · ${c.status}`,
    href: allClients ? `/client-database/${c.id}` : `/my-clients/${c.id}`,
  }));

  const coachItems: SearchItem[] = allClients
    ? Object.entries(coachNames).map(([cid, name]) => ({
        id: `coach:${cid}`,
        type: "coach",
        label: name,
        sublabel: "Coach",
        href: "/coach-overview",
      }))
    : [];

  const leadItems: SearchItem[] = leads.map((l) => ({
    id: `lead:${l.id}`,
    type: "lead",
    label: l.name,
    sublabel: `${l.source} · ${l.stage}`,
    href: "/pipeline",
  }));

  // Screens first so they rank ahead of entities for short queries.
  return [...screenItems(id), ...coachItems, ...clientItems, ...leadItems];
}
