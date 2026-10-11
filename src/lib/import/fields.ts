// Which columns the importer understands, and which of them it may WRITE.
//
// The split that matters: GHL owns name, email, phone, status and coach. The
// nightly sync rewrites those from the CRM, so writing them here would look
// like it worked and be gone by morning. Those columns are read, compared, and
// reported as "differs from GHL, fix in GHL". Everything the PORTAL owns is
// writable.

import { BRAND } from "@/lib/brand";

export type FieldId =
  | "ghlContactId" | "name" | "email" | "phone"            // identity / GHL-owned
  | "startDate" | "cadence" | "notes" | "termEnd" | "rate" // portal-owned
  | "clientType" | "payer" | "customClientMonthly" | "customCoachMonthly"; // TJD only

export type FieldDef = {
  id: FieldId;
  label: string;
  /** Column header in the downloadable template. */
  header: string;
  /** Headers that auto-detect to this field, normalised. */
  aliases: string[];
  kind: "identity" | "ghl_owned" | "portal_owned";
  /** The clients column actually written. Portal-owned only. */
  column?: string;
  type: "text" | "date" | "number" | "enum";
  options?: string[];
  tjdOnly?: boolean;
};

const A = (...s: string[]) => s.map((x) => x.toLowerCase().replace(/[^a-z0-9]/g, ""));

export const FIELDS: FieldDef[] = [
  { id: "ghlContactId", label: "GHL contact id", header: "GHL Contact ID", aliases: A("ghl contact id", "contact id", "ghlid", "ghl_contact_id"), kind: "identity", type: "text" },
  { id: "name", label: "Client name", header: "Client Name", aliases: A("client name", "name", "client", "full name"), kind: "identity", type: "text" },
  { id: "email", label: "Email", header: "Email", aliases: A("email", "email address", "e-mail"), kind: "ghl_owned", type: "text" },
  { id: "phone", label: "Phone", header: "Phone", aliases: A("phone", "mobile", "phone number", "contact number"), kind: "ghl_owned", type: "text" },

  { id: "startDate", label: "Start date", header: "Start Date", aliases: A("start date", "start", "started", "commenced"), kind: "portal_owned", column: "start_date_override", type: "date" },
  { id: "cadence", label: "Cadence", header: "Cadence", aliases: A("cadence", "plan", "coaching tier", "check in frequency", "frequency", "check ins"), kind: "portal_owned", column: "plan", type: "enum", options: ["Weekly", "Fortnightly"] },
  { id: "termEnd", label: "Term end", header: "Term End", aliases: A("term end", "end date", "term ends", "finish date"), kind: "portal_owned", column: "term_end_override", type: "date" },
  { id: "notes", label: "Notes", header: "Notes", aliases: A("notes", "note", "comments"), kind: "portal_owned", column: "notes", type: "text" },
  { id: "rate", label: "Weekly rate", header: "Weekly Rate", aliases: A("weekly rate", "rate", "price", "weekly price"), kind: "portal_owned", column: "weekly_rate", type: "number" },

  { id: "clientType", label: "Client type", header: "Client Type", aliases: A("client type", "type", "brand or referral"), kind: "portal_owned", column: "client_type", type: "enum", options: ["brand", "referral"], tjdOnly: true },
  { id: "payer", label: "Payer", header: "Payer", aliases: A("payer", "pays", "billing"), kind: "portal_owned", column: "payer", type: "enum", options: ["weekly", "monthly"], tjdOnly: true },
  { id: "customClientMonthly", label: "Custom client $", header: "Custom Client $", aliases: A("custom client $", "custom client", "client monthly", "custom price"), kind: "portal_owned", column: "custom_client_monthly", type: "number", tjdOnly: true },
  { id: "customCoachMonthly", label: "Custom coach $", header: "Custom Coach $", aliases: A("custom coach $", "custom coach", "coach monthly"), kind: "portal_owned", column: "custom_coach_monthly", type: "number", tjdOnly: true },
];

/** The fields this brand shows. TJD pay columns never appear on DP, where the
 *  columns exist in neither the schema nor the pay model. */
export function fieldsForBrand(): FieldDef[] {
  const tjd = BRAND.pay.model === "weeks-paid";
  return FIELDS.filter((f) => !f.tjdOnly || tjd);
}

export const normHeader = (s: unknown): string =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Auto-detect a header. Returns null when nothing matches, so the user maps
 *  it or ignores it rather than the importer picking something plausible. */
export function detectField(header: unknown, fields = fieldsForBrand()): FieldId | null {
  const h = normHeader(header);
  if (!h) return null;
  for (const f of fields) if (f.aliases.includes(h) || normHeader(f.header) === h) return f.id;
  return null;
}

/** The literal that clears a value. An EMPTY cell never clears: a column the
 *  owner did not fill in is not an instruction to wipe what is there. */
export const CLEAR_TOKEN = "CLEAR";
export const isClear = (raw: string): boolean => raw.trim().toUpperCase() === CLEAR_TOKEN;

export function templateCsv(): string {
  return fieldsForBrand().map((f) => f.header).join(",") + "\n";
}
