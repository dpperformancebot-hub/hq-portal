"use server";

// HQ-native create for the Reports store (reports table, migration
// 20260630000002). Server-side only: the write goes through the service-role
// dbAdmin() client and is gated by persistenceEnabled(), so the action no-ops
// with an honest message until the owner flips HQ_PERSISTENCE.
//
// Reports are an internal insights list with no outbound path: they contact
// nobody. Do NOT add any send/outreach here. generated_at defaults to today
// when the form leaves it blank; the report body is stored for the detail view.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import type { Report } from "@/lib/seed";
import { assertBrandManager } from "@/lib/role-server";

const PATH = "/reports";

type Result<T> = { ok: boolean; error?: string; data?: T };

const OFF: Result<never> = {
  ok: false,
  error: "Persistence is off. Saving reports goes live with the database.",
};

const REPORT_TYPES = ["Summary", "Monthly", "Quarterly", "Coaching"];
const cleanType = (type: string | undefined) =>
  REPORT_TYPES.includes((type ?? "").trim()) ? (type as string).trim() : "Summary";

export async function createReportAction(input: {
  title: string;
  type: string;
  period: string;
  body: string;
  generatedAt: string | null;
}): Promise<Result<Report>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Report title is required." };
  const { data, error } = await dbAdmin()
    .from("reports")
    .insert({
      title,
      type: cleanType(input.type),
      period: input.period.trim() || null,
      body: input.body.trim() || null,
      generated_at: input.generatedAt || new Date().toISOString().slice(0, 10),
    })
    .select("id,title,type,period,generated_at")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add report." };
  const r = data as { id: string; title: string; type: string; period: string | null; generated_at: string | null };
  revalidatePath(PATH);
  return {
    ok: true,
    data: {
      id: r.id,
      title: r.title,
      type: r.type,
      period: r.period ?? "",
      generatedAt: r.generated_at ? r.generated_at.slice(0, 10) : "",
    },
  };
}
