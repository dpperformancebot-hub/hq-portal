// Coach Assistant backend (2026-07-05, owner-approved). Four modes:
//   chat: free-form coaching Q&A grounded in the DP Academy + SOPs
//   client-summary: structured read of one client's check-in history + notes
//   loom-summary: turn a pasted Loom/Trellis check-in transcript into a
//     client-facing summary + action items + coach notes (2026-07-10); saved
//     to check_in_summaries when a client is attached and persistence is on.
//   inbox-reply (F1, FEEDBACK-V2): draft a suggested reply for an inbox
//     thread. DRAFT ONLY: the result is copied out by a human; this mode
//     never touches the send path or the outreach guard.
//
// GATED on ANTHROPIC_API_KEY: absent -> 503 and the UI stays honest-disabled.
// Auth: any signed-in portal user (coach tool); requests are stateless.
// SAFETY: read-only toward clients. The assistant never messages clients;
// client-summary and the loom-summary save path only touch data the caller's
// role already sees (roster scoping via the same selectors the screens use).

import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity } from "@/lib/role-server";
import { getClientDetailData } from "@/lib/data";
import { canAccessClient, saveCheckInSummary, type CheckInSummary } from "@/lib/check-in-summaries";
import { ACADEMY_MODULES } from "@/lib/coach-content/academy";
import { COACH_SOPS } from "@/lib/coach-content/sops";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

// Not exported: Next 15 route files may only export route fields, and no one
// imports it (pages check process.env.ANTHROPIC_API_KEY directly).
function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type ChatMessage = { role: "user" | "assistant"; content: string };

function academyDigest(): string {
  // Titles + summaries only: the full academy JSON is ~330KB, far more than a
  // system prompt needs. The digest orients the model; it answers from
  // general coaching knowledge anchored to DP's structure and tone.
  const modules = ACADEMY_MODULES.map(
    (m) =>
      `Module ${m.number}: ${m.title} - ${m.summary}\n` +
      m.lessons.map((l) => `  ${l.number} ${l.title}: ${l.summary}`).join("\n"),
  ).join("\n");
  const sops = COACH_SOPS.map((s) => `SOP: ${s.title} (${s.category}) - ${s.summary}`).join("\n");
  return `${modules}\n\n${sops}`;
}

const SYSTEM = `You are the ${BRAND.name} Coach Assistant inside the team's internal HQ portal. You help the coaching team (online fitness coaching business) with coaching questions, check-in reviews, and drafting replies IN THE HOUSE TONE: direct, warm, no fluff, Australian English, no em dashes.

Ground your coaching answers in the Academy curriculum and SOPs below. If a question falls outside coaching/nutrition/training/client-management, say so briefly.

HARD RULES: you never send messages to clients (coaches copy text out themselves); you never invent client data; when reviewing a check-in, structure the read as: wins, flags, suggested reply.

ACADEMY AND SOPS:
${academyDigest()}`;

// Loom Summary Assistant. Marker-delimited output (not JSON) so the model
// writes naturally and parsing stays trivial; REFUSED mirrors the Trellis
// behaviour of politely declining anything that is not a coaching check-in.
const LOOM_SYSTEM = `You are the ${BRAND.name} Loom Summary Assistant inside the team's internal HQ portal. A coach pastes the transcript of a Loom/Trellis check-in video they recorded for a client. You turn it into three sections, writing IN THE HOUSE TONE: direct, warm, no fluff, Australian English, no em dashes.

Respond in EXACTLY this format (plain text, these markers on their own lines):
SUMMARY:
A client-facing message (first person, from the coach to the client) recapping the check-in: wins, what was reviewed, and the plan going forward. Warm, specific, ready to copy into a message. 4-8 sentences.
ACTION ITEMS:
A dash-list of the concrete things the CLIENT should do before the next check-in, pulled only from the transcript.
COACH NOTES:
Internal notes for the coach and head coach: flags, adherence signals, things to watch, follow-ups the COACH owes. Never shown to the client.

HARD RULES: use only what is in the transcript, never invent details or numbers. You never send anything to clients; the coach copies text out themselves. If the transcript is clearly not a fitness/nutrition coaching check-in or client video review, do not summarise it: reply with a single line starting with "REFUSED:" followed by a short polite explanation that this tool only summarises client check-in videos.`;

/** Split the model's marker-delimited reply into the three sections.
 *  Tolerant: a malformed reply lands whole in `summary` so nothing is lost. */
function parseLoomSections(text: string): { summary: string; actionItems: string; coachNotes: string } {
  const m = text.match(/SUMMARY:\s*([\s\S]*?)\s*ACTION ITEMS:\s*([\s\S]*?)\s*COACH NOTES:\s*([\s\S]*)/);
  if (!m) return { summary: text.trim(), actionItems: "", coachNotes: "" };
  return { summary: m[1].trim(), actionItems: m[2].trim(), coachNotes: m[3].trim() };
}

async function callClaude(system: string, messages: ChatMessage[], maxTokens = 1024): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Anthropic API responded ${res.status}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "Assistant not configured (ANTHROPIC_API_KEY missing)." }, { status: 503 });
  }
  // Signed-in users only (any role: it is a team tool).
  const identity = await getServerIdentity();
  if (!identity.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    mode?: string;
    messages?: ChatMessage[];
    clientId?: string;
    transcript?: string;
    loomUrl?: string;
    weekNumber?: number;
    contactName?: string;
    channel?: string;
    thread?: { from: "them" | "us"; text: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    if (body.mode === "loom-summary") {
      const transcript = (body.transcript ?? "").trim();
      if (!transcript) return NextResponse.json({ error: "transcript required" }, { status: 400 });
      const clientId = body.clientId?.trim() || null;
      // Scope check BEFORE spending tokens: a plain coach can only attach a
      // summary to a client on their own roster.
      if (clientId && !(await canAccessClient(clientId, identity))) {
        return NextResponse.json({ error: "client not found" }, { status: 404 });
      }
      // Cap the transcript defensively (~30 min of speech fits well inside
      // this); the stored copy keeps what was actually summarised.
      const clipped = transcript.slice(0, 60_000);
      const text = await callClaude(
        LOOM_SYSTEM,
        [{ role: "user", content: `Transcript of my check-in video:\n\n${clipped}` }],
        1500,
      );
      if (text.startsWith("REFUSED:")) {
        return NextResponse.json({ refused: text.replace(/^REFUSED:\s*/, "").trim() || "Not a check-in transcript." });
      }
      const sections = parseLoomSections(text);
      // Persist when a client is attached and the store is live. A failed or
      // unavailable save never blocks the result; saved:false keeps it honest.
      let saved: CheckInSummary | null = null;
      if (clientId) {
        saved = await saveCheckInSummary({
          clientId,
          coachId: identity.linkedCoachId,
          weekNumber: Number.isFinite(body.weekNumber) ? (body.weekNumber as number) : null,
          loomUrl: body.loomUrl?.trim() || null,
          transcript: clipped,
          summary: sections.summary,
          actionItems: sections.actionItems,
          coachNotes: sections.coachNotes,
        });
      }
      return NextResponse.json({ ...sections, saved });
    }

    if (body.mode === "inbox-reply") {
      // F1: draft only. The UI shows the text with a copy button; nothing
      // here can send (no send import, no outreach path).
      const thread = (body.thread ?? []).filter((m) => m && typeof m.text === "string").slice(-12);
      if (thread.length === 0) return NextResponse.json({ error: "thread required" }, { status: 400 });
      const name = (body.contactName ?? "the contact").trim().slice(0, 80);
      const first = name.split(" ")[0] ?? name;
      const channel = (body.channel ?? "message").trim().slice(0, 30);
      const convo = thread
        .map((m) => `${m.from === "us" ? "Us" : first}: ${m.text.slice(0, 1000)}`)
        .join("\n");
      const prompt =
        `Draft our next reply to ${name} on ${channel}. Conversation so far (most recent last):\n\n${convo}\n\n` +
        `Write ONLY the reply text, ready to paste into ${channel}: no preamble, no quotes, no signature block. ` +
        `Keep it short and natural for a chat message. If their last message needs a question answered, answer it.`;
      const text = await callClaude(SYSTEM, [{ role: "user", content: prompt }], 512);
      return NextResponse.json({ text });
    }

    if (body.mode === "client-summary") {
      if (!body.clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
      // R11 (IDOR fix): scope-check BEFORE reading or spending tokens. Without
      // this, any signed-in role could enumerate clientIds and get an LLM
      // summary of any client's check-in history and coach notes.
      if (!(await canAccessClient(body.clientId, identity))) {
        return NextResponse.json({ error: "client not found" }, { status: 404 });
      }
      const detail = await getClientDetailData(body.clientId);
      if (!detail || !detail.client) return NextResponse.json({ error: "client not found" }, { status: 404 });
      const c = detail.client;
      const checkIns = (detail.checkIns ?? [])
        .slice(0, 20)
        .map((ci) => `${ci.submittedAt}: ${ci.code ?? "-"}`)
        .join("; ");
      const notes = (detail.notes ?? [])
        .slice(0, 10)
        .map((n) => `${n.createdAt}: ${n.body}`)
        .join("; ");
      const prompt =
        `Give a tight coaching summary of this client for their coach: 3-5 sentences, then one suggested next action. ` +
        `Client: ${c.name}, plan ${c.plan}, status ${c.status}, started ${c.startDate}. ` +
        `Recent weekly check-in codes (Y=submitted, MS=message sent, M=missed, F=follow-up, G=ghosted, P=paused, C=cancelled, N=no check-in): ${checkIns || "none"}. ` +
        `Coach notes: ${notes || "none"}.`;
      const text = await callClaude(SYSTEM, [{ role: "user", content: prompt }], 512);
      return NextResponse.json({ text });
    }

    const messages = (body.messages ?? []).slice(-12);
    if (messages.length === 0) return NextResponse.json({ error: "messages required" }, { status: 400 });
    const text = await callClaude(SYSTEM, messages);
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "assistant failed" },
      { status: 502 },
    );
  }
}
