"use client";

// Coach Assistant (2026-07-05): a real chat over /api/assistant, grounded in
// the DP Academy + SOPs. GATED: until ANTHROPIC_API_KEY is set the page keeps
// its honest disabled state (configured=false from the server). Read-only by
// design: it never messages clients and never writes to the portal.
// Chat surface extracted to assistant-chat.tsx (2026-08-07, shared with the
// I1 floating bubble).

import { Card, PageHeader } from "@/components/ui";
import { AssistantChat } from "@/components/screens/coach-tools/assistant-chat";
import { BRAND } from "@/lib/brand";

export function CoachAssistantView({ configured = false }: { configured?: boolean }) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Coach tools"
        title="Coach Assistant"
        subtitle={
          configured
            ? `Grounded in the ${BRAND.name} Academy and SOPs. It drafts, you decide: nothing here ever reaches a client.`
            : "An AI helper for coaching workflows. Switches on when the API key lands."
        }
      />

      {!configured ? (
        <Card>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Waiting on the key</div>
          <p className="mt-1 text-sm text-fg-dim">
            The assistant backend is built and gated on ANTHROPIC_API_KEY. Add the key in Vercel, redeploy, and this
            page becomes a live coaching Q&A: check-in reviews, reply drafting in the house tone, and Academy-grounded
            answers. Read-only by design: it never messages clients.
          </p>
        </Card>
      ) : null}

      <AssistantChat configured={configured} heightClass="h-[55vh]" />
    </div>
  );
}
