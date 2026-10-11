"use client";

// Shared Coach Assistant chat (extracted 2026-08-07 for I1). One chat surface
// used by BOTH the full /coach-assistant page and the floating bubble on
// coach screens, so behaviour and gating stay identical: /api/assistant mode
// "chat", ANTHROPIC_API_KEY-gated, read-only by design (never messages
// clients, never writes to the portal).

import { useRef, useState } from "react";
import { Button, Card, useToast } from "@/components/ui";
import { BRAND } from "@/lib/brand";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Review this check-in: client hit workouts but diet slipped on the weekend, feeling flat.",
  "Draft a warm nudge for a client who's ghosted two weeks.",
  `How does ${BRAND.name} set starting macros for a 90kg male wanting fat loss?`,
];

export function AssistantChat({
  configured = false,
  heightClass = "h-[55vh]",
}: {
  configured?: boolean;
  /** Chat card height, e.g. "h-[55vh]" (page) or "h-[26rem]" (bubble). */
  heightClass?: string;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "chat", messages: next }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error ?? "Assistant failed.");
      setMessages((m) => [...m, { role: "assistant", content: data.text as string }]);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }));
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Assistant failed.", "error");
      setMessages((m) => m.slice(0, -1)); // roll back the unanswered question
      setInput(q);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={`flex flex-col p-0 ${heightClass}`}>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-fg-dim">
              {configured ? "Try one of these:" : "What it will handle once the key is in:"}
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!configured || busy}
                onClick={() => ask(s)}
                className="block w-full rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-left text-sm text-fg-dim transition-colors hover:border-accent/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-card px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-accent text-white" : "border border-border bg-surface-2 text-fg"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {busy ? <div className="text-xs text-fg-muted">Thinking…</div> : null}
      </div>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ask(input);
          }}
          disabled={!configured || busy}
          placeholder={configured ? "Ask the assistant" : "Ask the assistant (not yet connected)"}
          className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed"
        />
        <Button size="sm" onClick={() => void ask(input)} disabled={!configured || busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </Button>
      </div>
    </Card>
  );
}
