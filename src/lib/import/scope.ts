// WHO may change WHICH client in an import. One helper, used by the preview
// AND the apply, so the two can never disagree about what is allowed.
//
// The rule that matters: a coach imports only their OWN clients. A row naming
// someone else's client is skipped and reported, never written. A coach also
// cannot move a client between coaches by import, because coach is a GHL-owned
// field this importer never writes at all (see FIELDS).

import type { AccessIdentity } from "@/lib/access-policy";

export type ImportScope =
  | { kind: "all" }
  | { kind: "own"; coachId: string }
  | { kind: "none"; reason: string };

/**
 * Owner, admin and ops_manager import any client. A coach, head coach
 * included, is limited to their own roster.
 *
 * The head coach is deliberately NOT given everyone here. They oversee the
 * team and can already see team performance, but a bulk file that silently
 * rewrote another coach's clients' start dates and rates is a different kind
 * of power, and the approved R19-2 matrix keeps that with owner and admin.
 */
export function importScopeFor(id: AccessIdentity): ImportScope {
  if (id.realRole === "owner" || id.role === "owner") return { kind: "all" };
  if (id.role === "admin" || id.role === "ops_manager") return { kind: "all" };
  if (id.role === "coach") {
    if (!id.linkedCoachId) {
      return { kind: "none", reason: "This login is not linked to a coach record yet, so it has no clients to import." };
    }
    return { kind: "own", coachId: id.linkedCoachId };
  }
  return { kind: "none", reason: "Your role cannot import client data." };
}

/** May this scope write to a client currently held by `coachId`? */
export function mayTouch(scope: ImportScope, clientCoachId: string | null): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "none") return false;
  return clientCoachId !== null && clientCoachId === scope.coachId;
}

/** The clients a scope is even allowed to MATCH against. Narrowing the search
 *  space, not just the write, means a coach's name match can never silently
 *  resolve to a client of someone else's who happens to share a name. */
export function visibleClients<T extends { coachId: string | null }>(scope: ImportScope, clients: T[]): T[] {
  if (scope.kind === "all") return clients;
  if (scope.kind === "none") return [];
  return clients.filter((c) => c.coachId === scope.coachId);
}
