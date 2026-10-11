"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Avatar, Button, useToast } from "@/components/ui";
import { BackLink } from "@/components/ui/back-link";
import { Icon } from "@/lib/icons";
import { BRAND } from "@/lib/brand";
import { canSendTo, getWhatsAppLink, loadMessages, sendInboxMessageAction } from "@/app/(hq)/inbox/actions";
import { getUserStateAction, setUserStateAction } from "@/lib/user-state-actions";
import type { Conversation, ConversationMessage, InboxChannel } from "@/lib/seed";

const CHANNEL_LABEL: Record<InboxChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "Email",
};

/** Prefer the raw GHL channel label (e.g. Facebook, SMS) when the source did
 *  not map 1:1 to one of the three first-class channels. */
const channelLabel = (c: Conversation) => c.rawChannel ?? CHANNEL_LABEL[c.channel];

const CHANNEL_FILTERS: { label: string; value: InboxChannel | "all" }[] = [
  { label: "All", value: "all" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "IG", value: "instagram" },
  { label: "Email", value: "email" },
];

// Composer chips insert a starter message (2026-07-05: they were dead
// buttons). {first} is replaced with the contact's first name; links stay as
// placeholders until the booking/check-in URLs are confirmed.
const COMPOSER_CHIPS: { label: string; text: string }[] = [
  { label: "Templates", text: "Hey {first}! Great to hear from you. " },
  {
    label: "Form check",
    text: "Hey {first}, just checking you got the check-in form okay. Any trouble filling it in, tell me here.",
  },
  {
    label: "Send check-in link",
    text: "Hey {first}, here's your check-in link for this week: [check-in link]. Two minutes tops.",
  },
  {
    label: "Book call",
    text: "Hey {first}! Keen to chat about your goals. Grab a time that suits you here: [booking link]",
  },
];

const SNOOZE_KEY = "inbox-snoozed";
const SNOOZE_MS = 24 * 60 * 60 * 1000;

export function InboxView({
  conversations,
  live,
  ghlLocationId,
  showMoney = true,
}: {
  conversations: Conversation[];
  live: boolean;
  ghlLocationId?: string;
  /** false for a money-blind coach (TJD head coach by URL): no LTV row. The
   *  page already zeroed it server-side. */
  showMoney?: boolean;
}) {
  const toast = useToast();
  const [channel, setChannel] = useState<InboxChannel | "all">("all");
  const [activeId, setActiveId] = useState(conversations[0]?.id ?? "");
  // On-demand message cache: thread id -> messages. Threads ship without
  // messages in live mode; they load when the thread is opened.
  const [loaded, setLoaded] = useState<Record<string, ConversationMessage[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Send write-back (gated): text + per-thread sendability. The server action
  // re-checks the outreach guard on EVERY send; this state is display only.
  const [draftText, setDraftText] = useState("");
  const [sendable, setSendable] = useState(false);
  const [sending, startSend] = useTransition();
  // Thread search + per-login snoozes (2026-07-05: the buttons now work).
  const [query, setQuery] = useState("");
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  // F1: AI-drafted reply per thread. DRAFT ONLY: copy + open-chat deep link;
  // this panel never touches the send path.
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    void getUserStateAction(SNOOZE_KEY).then((v) => {
      if (v && typeof v === "object") setSnoozed(v as Record<string, number>);
    });
  }, []);

  const snoozeActive = () => {
    if (!active) return;
    const next = { ...snoozed, [active.id]: Date.now() + SNOOZE_MS };
    setSnoozed(next);
    void setUserStateAction(SNOOZE_KEY, next);
    toast.push(`${active.name} snoozed until tomorrow`);
  };

  const q = query.trim().toLowerCase();
  const threads = conversations
    .filter((c) => (channel === "all" ? true : c.channel === channel))
    .filter((c) => (snoozed[c.id] ?? 0) < Date.now())
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q));
  const active = conversations.find((c) => c.id === activeId) ?? threads[0];

  // Messages that ship with the conversation (demo) win; otherwise use the
  // on-demand cache (live).
  const activeMessages: ConversationMessage[] = active
    ? active.messages.length > 0
      ? active.messages
      : loaded[active.id] ?? []
    : [];

  useEffect(() => {
    if (!active) return;
    if (active.messages.length > 0) return; // already has messages (demo)
    if (active.id in loaded) return; // already fetched
    let cancelled = false;
    setLoadingId(active.id);
    loadMessages(active.id)
      .then((msgs) => {
        if (!cancelled) setLoaded((prev) => ({ ...prev, [active.id]: msgs }));
      })
      .catch(() => {
        if (!cancelled) setLoaded((prev) => ({ ...prev, [active.id]: [] }));
      })
      .finally(() => {
        if (!cancelled) setLoadingId((id) => (id === active.id ? null : id));
      });
    return () => {
      cancelled = true;
    };
  }, [active, loaded]);

  // Per-thread sendability (outreach on, or the allowlisted test contact).
  useEffect(() => {
    setSendable(false);
    setDraftText("");
    setAiDraft(null);
    if (!active || !live) return;
    void canSendTo(active.contactId).then(setSendable);
  }, [active, live]);

  // F1: ask the assistant for a suggested reply built from the visible thread.
  const draftWithAi = async () => {
    if (!active || aiBusy || activeMessages.length === 0) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "inbox-reply",
          contactName: active.name,
          channel: channelLabel(active),
          thread: activeMessages.map((m) => ({ from: m.from, text: m.text })),
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (res.ok && data.text) setAiDraft(data.text);
      else toast.push(data.error ?? "Could not draft a reply.", "error");
    } catch {
      toast.push("Could not draft a reply.", "error");
    } finally {
      setAiBusy(false);
    }
  };

  const copyAiDraft = async () => {
    if (!aiDraft) return;
    try {
      await navigator.clipboard.writeText(aiDraft);
      toast.push("Draft copied. Paste it where you message them.", "success");
    } catch {
      toast.push("Could not copy. Select the text manually.", "error");
    }
  };

  const openChat = async () => {
    if (!active) return;
    // WhatsApp threads get the wa.me deep link when the contact has a phone;
    // everything else opens the GHL conversation for a human to paste into.
    if (active.channel === "whatsapp") {
      const link = await getWhatsAppLink(active.contactId);
      if (link) {
        window.open(link, "_blank", "noopener");
        return;
      }
    }
    if (ghlLocationId) {
      window.open(
        `https://app.gohighlevel.com/v2/location/${ghlLocationId}/conversations/conversations/${active.id}`,
        "_blank",
        "noopener",
      );
    } else {
      toast.push("No chat link available for this thread.", "error");
    }
  };

  const send = () => {
    if (!active || !draftText.trim() || sending) return;
    const text = draftText.trim();
    startSend(async () => {
      const res = await sendInboxMessageAction({
        contactId: active.contactId,
        channel: active.channel,
        rawChannel: active.rawChannel,
        text,
      });
      if (res.ok) {
        const now = new Date();
        const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        setLoaded((prev) => ({
          ...prev,
          [active.id]: [
            ...(prev[active.id] ?? active.messages),
            { id: `sent-${now.getTime()}`, from: "us", text, time },
          ],
        }));
        setDraftText("");
        toast.push(`Sent to ${active.name}`);
      } else {
        toast.push(res.error, "error");
      }
    });
  };

  return (
    <div className="space-y-3">
      <BackLink />
      {!live ? (
        <div className="flex items-center gap-2 rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
          <Icon name="message" size={14} />
          MOCK · UI preview. Messaging backend (WhatsApp / IG / email) is built later.
        </div>
      ) : null}

      <div className="grid h-[calc(100vh-10rem)] grid-cols-[300px_1fr_280px] gap-3">
        {/* LEFT: threads */}
        <div className="flex min-h-0 flex-col rounded-card border border-border bg-surface">
          <div className="border-b border-border p-3">
            <div className="flex gap-1">
              {CHANNEL_FILTERS.map((f) => {
                const count = f.value === "all" ? conversations.length : conversations.filter((c) => c.channel === f.value).length;
                const on = f.value === channel;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setChannel(f.value)}
                    className={`flex items-center gap-1 rounded-control px-2 py-1 text-xs font-medium transition-colors ${
                      on ? "bg-accent text-white" : "text-fg-dim hover:bg-surface-2"
                    }`}
                  >
                    {f.label}
                    <span className={on ? "text-white/80" : "text-fg-muted"}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-control border border-border bg-surface-2 px-2 py-1.5 text-fg-muted">
              <Icon name="search" size={14} />
              <input
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-fg-muted">No conversations.</div>
            ) : null}
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                className={`flex w-full gap-3 border-b border-border-soft px-3 py-3 text-left transition-colors ${
                  t.id === active?.id ? "bg-surface-2" : "hover:bg-surface-2"
                }`}
              >
                <Avatar name={t.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-fg">{t.name}</span>
                    <span className="shrink-0 text-[11px] text-fg-muted">{t.time}</span>
                  </div>
                  <div className="truncate text-xs text-fg-dim">{t.preview}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded-pill bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">{t.contactType}</span>
                    <span className="rounded-pill bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">{channelLabel(t)}</span>
                    {t.unread > 0 ? (
                      <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-semibold text-white">
                        {t.unread}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* CENTER: conversation */}
        <div className="flex min-h-0 flex-col rounded-card border border-border bg-surface">
          {active ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Avatar name={active.name} size="md" />
                  <div>
                    <div className="text-sm font-medium text-fg">{active.name}</div>
                    <div className="text-[11px] text-fg-muted">{channelLabel(active)} · {active.contactType}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={snoozeActive} title="Hide this thread until tomorrow (just for you)">
                    Snooze
                  </Button>
                  {ghlLocationId ? (
                    <a
                      href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/conversations/conversations/${active.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open this conversation in GoHighLevel (assign, tags, full actions)"
                      className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
                    >
                      Open in GHL
                      <Icon name="external" size={13} />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {loadingId === active.id && activeMessages.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">Loading messages…</div>
                ) : activeMessages.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">No messages in this thread.</div>
                ) : (
                  activeMessages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.from === "us" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-card px-3 py-2 text-sm ${
                          msg.from === "us" ? "bg-accent text-white" : "border border-border bg-surface-2 text-fg"
                        }`}
                      >
                        {msg.text}
                        <div className={`mt-1 text-[10px] ${msg.from === "us" ? "text-white/70" : "text-fg-muted"}`}>{msg.time}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-border p-3">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {COMPOSER_CHIPS.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => setDraftText(c.text.replaceAll("{first}", active.name.split(" ")[0] ?? ""))}
                      title="Insert this template into the composer"
                      className="rounded-pill border border-border bg-surface px-2.5 py-1 text-xs text-fg-dim transition-colors hover:text-fg"
                    >
                      {c.label}
                    </button>
                  ))}
                  {/* F1: AI draft. Never sends; copy + open chat only. */}
                  <button
                    type="button"
                    onClick={() => void draftWithAi()}
                    disabled={aiBusy || activeMessages.length === 0}
                    title="Draft a suggested reply with AI. Nothing is sent: you copy and paste it yourself."
                    className="rounded-pill border border-accent/40 bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-deep transition-colors hover:border-accent disabled:opacity-50"
                  >
                    {aiBusy ? "Drafting…" : "Draft with AI"}
                  </button>
                </div>

                {aiDraft !== null ? (
                  <div className="mb-2 space-y-2 rounded-control border border-accent/30 bg-accent-soft/40 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                      Suggested reply · nothing is sent from here
                    </div>
                    <textarea
                      value={aiDraft}
                      onChange={(e) => setAiDraft(e.target.value)}
                      rows={4}
                      className="w-full rounded-control border border-border bg-surface px-2.5 py-2 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                      aria-label="AI-drafted reply"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => void copyAiDraft()}>
                        Copy draft
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void openChat()}>
                        Open their chat
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setAiDraft(null)}>
                        Dismiss
                      </Button>
                      <span className="text-[11px] text-fg-muted">You paste and send it yourself.</span>
                    </div>
                  </div>
                ) : null}
                <div className="flex items-center gap-2 rounded-control border border-border bg-surface-2 px-3 py-2">
                  <input
                    placeholder={sendable ? `Message ${active.name} on ${channelLabel(active)}` : "Write a message"}
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && sendable) send();
                    }}
                    disabled={!sendable || sending}
                    className="w-full bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none disabled:cursor-not-allowed"
                  />
                  <Button
                    size="sm"
                    onClick={send}
                    disabled={!sendable || sending || !draftText.trim()}
                    title={sendable ? `Send on ${channelLabel(active)}` : "Sending is locked by the no-contact guard"}
                  >
                    <Icon name="send" size={14} />
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
                <div className="mt-1.5 text-[11px] text-fg-muted">
                  {live
                    ? sendable
                      ? `Replies send from the business ${channelLabel(active)} account. WhatsApp replies must land inside the 24h session window.`
                      : "Reading live from GoHighLevel. Sending is locked by the no-contact guard (test contact excepted)."
                    : `Sending as ${BRAND.name} ${channelLabel(active)}. Outbound priority: WhatsApp, Instagram, then iMessage/email.`}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-fg-muted">No conversation selected.</div>
          )}
        </div>

        {/* RIGHT: context rail */}
        <div className="min-h-0 overflow-y-auto rounded-card border border-border bg-surface p-4">
          {active ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Context</div>
                <dl className="mt-2 space-y-2 text-sm">
                  <ContextRow label="Coach" value={active.coach} />
                  <ContextRow label="Plan" value={active.plan} />
                  <ContextRow label="Adherence" value={active.adherence ? `${Math.round(active.adherence * 100)}%` : "awaiting"} />
                  <ContextRow label="Last check-in" value={active.lastCheckIn} />
                  {showMoney ? (
                    <ContextRow label="LTV" value={active.ltv ? `$${active.ltv.toLocaleString()}` : "n/a"} />
                  ) : null}
                </dl>
                {active.contactType === "Client" && active.contactId ? (
                  <Link
                    href={`/client-database/${active.contactId}`}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-control border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
                  >
                    Open profile
                  </Link>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full"
                    disabled
                    title="Leads get a full profile once they become clients; use Open in GHL meanwhile"
                  >
                    Open profile
                  </Button>
                )}
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">This week&apos;s signals</div>
                <ul className="mt-2 space-y-1 text-xs text-fg-dim">
                  <li>Check-in data lives in Kahunas (no API yet)</li>
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}
