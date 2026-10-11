import { NextRequest, NextResponse } from "next/server";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";

// R5-3: Typeform webhook intake for client feedback forms. Each coach's form
// points its webhook at:
//   POST /api/webhooks/typeform?token=<TYPEFORM_WEBHOOK_SECRET>&coach=<first name>
// Responses store to client_feedback_responses and surface on that coach's
// dashboard. INBOUND ONLY: nothing is sent anywhere, no client is contacted.
// Replaces the per-coach Zapier -> Slack DM zaps.

type TypeformAnswer = {
  field?: { id?: string; ref?: string; type?: string };
  type?: string;
  text?: string;
  email?: string;
  number?: number;
  boolean?: boolean;
  date?: string;
  phone_number?: string;
  choice?: { label?: string };
  choices?: { labels?: string[] };
};

type TypeformPayload = {
  form_response?: {
    form_id?: string;
    submitted_at?: string;
    hidden?: Record<string, string>;
    definition?: { fields?: { id?: string; title?: string }[] };
    answers?: TypeformAnswer[];
  };
};

const answerValue = (a: TypeformAnswer): string => {
  if (a.text != null) return a.text;
  if (a.email != null) return a.email;
  if (a.number != null) return String(a.number);
  if (a.boolean != null) return a.boolean ? "Yes" : "No";
  if (a.date != null) return a.date;
  if (a.phone_number != null) return a.phone_number;
  if (a.choice?.label) return a.choice.label;
  if (a.choices?.labels) return a.choices.labels.join(", ");
  return "";
};

export async function POST(req: NextRequest) {
  const secret = process.env.TYPEFORM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  if (req.nextUrl.searchParams.get("token") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!persistenceEnabled()) return NextResponse.json({ error: "persistence off" }, { status: 503 });

  let payload: TypeformPayload;
  try {
    payload = (await req.json()) as TypeformPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const fr = payload.form_response;
  if (!fr) return NextResponse.json({ error: "no form_response" }, { status: 400 });

  // Q&A pairs: field titles from the definition, values from the answers.
  const titleById = new Map((fr.definition?.fields ?? []).map((f) => [f.id ?? "", f.title ?? ""]));
  const answers = (fr.answers ?? []).slice(0, 60).map((a) => ({
    question: titleById.get(a.field?.id ?? "") || a.field?.ref || "Question",
    answer: answerValue(a).slice(0, 2000),
  }));

  // Client name: hidden field wins, else the first short-text answer.
  const hiddenName = fr.hidden?.name ?? fr.hidden?.client ?? null;
  const firstText = (fr.answers ?? []).find((a) => a.type === "text" && a.text)?.text ?? null;
  const clientName = (hiddenName || firstText || "Unknown").slice(0, 160);

  // Coach match by the ?coach= slug against coach first names.
  const coachKey = (req.nextUrl.searchParams.get("coach") ?? "").trim().toLowerCase();
  let coachId: string | null = null;
  if (coachKey) {
    const { data: coaches } = await dbAdmin().from("coaches").select("id, name");
    const hit = ((coaches ?? []) as { id: string; name: string }[]).find(
      (c) => c.name.trim().toLowerCase().split(" ")[0] === coachKey || c.name.trim().toLowerCase() === coachKey,
    );
    coachId = hit?.id ?? null;
  }

  const { error } = await dbAdmin().from("client_feedback_responses").insert({
    coach_id: coachId,
    coach_key: coachKey || null,
    client_name: clientName,
    form_id: fr.form_id ?? null,
    answers,
    submitted_at: fr.submitted_at ?? null,
  });
  if (error) {
    const missing = error.code === "42P01" || /client_feedback_responses/i.test(error.message);
    return NextResponse.json(
      { error: missing ? "table missing (migration 20260807000006)" : "store failed" },
      { status: missing ? 503 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
