// R5-3: read layer for client feedback-form responses (Typeform webhook
// intake, client_feedback_responses table). Server-only.

import { dbAdmin, persistenceEnabled } from "@/lib/db/client";

export type FeedbackResponse = {
  id: string;
  clientName: string;
  answers: { question: string; answer: string }[];
  submittedAt: string | null;
};

/** R7-2: the week-4 form asks for referrals alongside feedback, and referral
 *  answers are owner/ops-only — coaches never see them. Matched on the
 *  question wording so it survives Typeform edits without a field-id map. */
export const isReferralQuestion = (question: string) => /referr|\brefer\b/i.test(question);

/** Latest responses for one coach, newest first. Empty pre-migration.
 *  R7-2: this feeds the COACH view, so referral answers are stripped here at
 *  the read layer, not in the component. */
export async function listCoachFeedbackResponses(coachId: string | null, limit = 10): Promise<FeedbackResponse[]> {
  if (!coachId || !persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("client_feedback_responses")
    .select("id, client_name, answers, submitted_at, created_at")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as {
    id: string;
    client_name: string | null;
    answers: { question: string; answer: string }[] | null;
    submitted_at: string | null;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    clientName: r.client_name ?? "Unknown",
    answers: (Array.isArray(r.answers) ? r.answers : []).filter((a) => !isReferralQuestion(a.question)),
    submittedAt: r.submitted_at ?? r.created_at,
  }));
}

export type FeedbackReferralAnswer = {
  id: string;
  clientName: string;
  coachName: string | null;
  question: string;
  answer: string;
  submittedAt: string | null;
};

/** R7-2: the referral answers coaches never see, for owner/ops on /referrals
 *  (the natural feed into the referral tracker). Newest first; blank answers
 *  dropped. Empty pre-migration / persistence off. */
export async function listFeedbackReferralAnswers(limit = 40): Promise<FeedbackReferralAnswer[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("client_feedback_responses")
    .select("id, client_name, coach_id, coach_key, answers, submitted_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  if (error || !data) return [];
  const rows = data as {
    id: string;
    client_name: string | null;
    coach_id: string | null;
    coach_key: string | null;
    answers: { question: string; answer: string }[] | null;
    submitted_at: string | null;
    created_at: string;
  }[];
  const coachIds = [...new Set(rows.map((r) => r.coach_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (coachIds.length) {
    const { data: coaches } = await dbAdmin().from("coaches").select("id, name").in("id", coachIds);
    for (const c of ((coaches ?? []) as { id: string; name: string }[])) names.set(c.id, c.name);
  }
  const out: FeedbackReferralAnswer[] = [];
  for (const r of rows) {
    for (const a of (Array.isArray(r.answers) ? r.answers : [])) {
      if (!isReferralQuestion(a.question) || !a.answer.trim()) continue;
      out.push({
        id: `${r.id}:${out.length}`,
        clientName: r.client_name ?? "Unknown",
        coachName: (r.coach_id && names.get(r.coach_id)) || r.coach_key || null,
        question: a.question,
        answer: a.answer,
        submittedAt: r.submitted_at ?? r.created_at,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
