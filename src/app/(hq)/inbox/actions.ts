"use server";

// On-demand message loading for the inbox (Stage 1 read) plus the Stage 2
// SEND write-back (2026-07-03, owner-approved gated build). Every send passes
// the outreach guard: with OUTREACH_ENABLED off, only the single allowlisted
// test contact (OUTREACH_TEST_CONTACT_ID) is reachable; everyone else gets a
// refusal, never a message. Sends are owner-only until roles are decided.

import { getMessagesData } from "@/lib/data";
import { fetchContactById, outboundMessageType, sendConversationMessage } from "@/lib/ghl/client";
import { getServerIdentity } from "@/lib/role-server";
import { canViewLeadData } from "@/lib/access-policy";
import { assertOutreachAllowed, isOutreachTestContact, outreachAllowed } from "@/lib/outreach-guard";
import type { ConversationMessage } from "@/lib/seed/m4";

/** SEC-AUDIT P1-3 (2026-09-06): the inbox reads had no identity check, so a
 *  coach could pull any conversation's messages or a contact's phone by
 *  calling the action directly. Inbox is a lead/CRM surface: the same
 *  allowlist the /inbox page uses (owner, admin, ops, va, head coach, sales). */
async function canReadInbox(): Promise<boolean> {
  const id = await getServerIdentity();
  return canViewLeadData({ role: id.role, realRole: id.realRole, isHeadCoach: id.isHeadCoach, linkedCoachId: id.linkedCoachId });
}

export async function loadMessages(conversationId: string): Promise<ConversationMessage[]> {
  if (!conversationId || !(await canReadInbox())) return [];
  return getMessagesData(conversationId);
}

/** F1 (FEEDBACK-V2): the WhatsApp deep link for the AI-draft copy flow, so a
 *  HUMAN can open the person's chat and paste. Read-only GHL contact fetch;
 *  no send, no outreach path. Null when there is no usable phone. */
export async function getWhatsAppLink(contactId: string | null | undefined): Promise<string | null> {
  if (!contactId) return null;
  if (!(await canReadInbox())) return null;
  try {
    const contact = await fetchContactById(contactId);
    const digits = (contact?.phone ?? "").replace(/[^\d]/g, "");
    return digits.length >= 8 ? `https://wa.me/${digits}` : null;
  } catch {
    return null;
  }
}

type SendResult = { ok: true } | { ok: false; error: string };

export async function sendInboxMessageAction(input: {
  contactId: string | null | undefined;
  channel: string;
  rawChannel?: string | null;
  text: string;
}): Promise<SendResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "Message is empty." };
  if (!input.contactId) return { ok: false, error: "This thread has no linked contact." };

  // Owner-only while the send rollout is decided (role gate is separate from
  // the outreach gate on purpose: flipping outreach on must not open sends to
  // every role by accident).
  const { realRole } = await getServerIdentity();
  if (realRole !== "owner") return { ok: false, error: "Sending is owner-only right now." };

  try {
    assertOutreachAllowed({ ghlContactId: input.contactId });
  } catch {
    return {
      ok: false,
      error: "Outreach is off: only the allowlisted test contact can receive messages. Nothing was sent.",
    };
  }

  const type = outboundMessageType(input.channel, input.rawChannel);
  if (!type) {
    return { ok: false, error: `No outbound mapping for this channel (${input.rawChannel ?? input.channel}).` };
  }

  const res = await sendConversationMessage({ type, contactId: input.contactId, message: text });
  if (!res.ok) return res;
  return { ok: true };
}

/** Whether the composer should present as enabled for this contact: global
 *  outreach on, or the allowlisted test contact. Display-only; the action
 *  re-checks server-side on every send. */
export async function canSendTo(contactId: string | null | undefined): Promise<boolean> {
  return outreachAllowed() || isOutreachTestContact(contactId);
}
