// R6-1: task templates (Dan's taskboard mockup, reference/taskboard-mockup).
// A task is not one shape: each request type collects different fields and
// creatableBy gates which roles can raise it. Adding a request type = adding
// one object here, nothing else. Client-safe (no server imports): the
// composer renders from these, the server action validates against them.

export type TemplateId = "general" | "pause" | "cancel" | "admin" | "onboard" | "handover";

export type TemplateField = {
  k: string;
  label: string;
  type: "text" | "textarea" | "date" | "select" | "client";
  required?: boolean;
  options?: string[];
  placeholder?: string;
  hint?: string;
};

/** Simplified viewer roles for creatableBy gating (server re-checks).
 *  README semantics: head_of_ops = Jameela (admin role; processes pause and
 *  cancel, the only escalator besides the owner backup); va RECEIVES tasks
 *  and creates none; ops_manager maps to the owner tier. */
export type TaskRole = "owner" | "head_of_ops" | "va" | "head_coach" | "coach" | "sales";

export type TaskTemplate = {
  id: TemplateId;
  label: string;
  short: string;
  creatableBy: TaskRole[];
  /** "va" routes to the VA, "picked" uses the chosen assignee. */
  routing: "va" | "picked";
  /** Pause/cancel get PROCESSED rather than done (button copy). */
  resolvable?: boolean;
  fields: TemplateField[];
};

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "general",
    label: "General task",
    short: "Task",
    creatableBy: ["owner", "head_of_ops", "head_coach"],
    routing: "picked",
    fields: [
      { k: "brief", label: "Task brief", type: "textarea", required: true, placeholder: "What needs doing, and what does done look like?" },
      { k: "timeline", label: "Timeline", type: "date", required: true },
      { k: "priority", label: "Priority", type: "select", options: ["Low", "Normal", "High", "Urgent"] },
    ],
  },
  {
    id: "pause",
    label: "Pause request",
    short: "Pause",
    creatableBy: ["coach", "head_coach"],
    routing: "va",
    resolvable: true,
    fields: [
      { k: "client", label: "Client name", type: "client", required: true, placeholder: "Start typing a client name…" },
      { k: "start", label: "Pause starts", type: "date", required: true },
      { k: "end", label: "Pause ends", type: "date", required: true, hint: "Mandatory (R6-1)" },
      { k: "reason", label: "Reason", type: "select", options: ["Injury", "Travel", "Financial", "Personal", "Medical", "Other"], required: true },
      { k: "notes", label: "Context for ops", type: "textarea", placeholder: "Anything ops needs to know before processing" },
    ],
  },
  {
    id: "cancel",
    label: "Cancel request",
    short: "Cancel",
    creatableBy: ["coach", "head_coach"],
    routing: "va",
    resolvable: true,
    fields: [
      { k: "client", label: "Client name", type: "client", required: true, placeholder: "Start typing a client name…" },
      { k: "effective", label: "Effective date", type: "date", required: true },
      { k: "reason", label: "Reason", type: "text", required: true, placeholder: "In their words: why are they cancelling?" },
      { k: "saveAttempt", label: "Save attempt made?", type: "select", options: ["Yes: offered pause", "Yes: offered downgrade", "No"], required: true },
      { k: "notes", label: "Context for ops", type: "textarea", placeholder: "What was said, and anything worth trying" },
    ],
  },
  {
    id: "admin",
    label: "Admin request",
    short: "Admin",
    creatableBy: ["owner", "head_of_ops", "head_coach", "coach", "sales"],
    routing: "va",
    fields: [
      { k: "request", label: "What do you need?", type: "textarea", required: true, placeholder: "e.g. Update a billing date to the 15th" },
      { k: "system", label: "System", type: "select", options: ["Kahunas", "Newie", "Notion", "Dashboard", "Google Drive", "Email", "Other"], required: true },
      { k: "timeline", label: "Needed by", type: "date", required: true },
      { k: "priority", label: "Priority", type: "select", options: ["Low", "Normal", "High", "Urgent"] },
    ],
  },
  {
    id: "onboard",
    label: "Onboarding handover",
    short: "Onboard",
    creatableBy: ["owner", "head_of_ops"],
    routing: "picked",
    fields: [
      { k: "client", label: "Client name", type: "client", required: true, placeholder: "Start typing a client name…" },
      { k: "startDate", label: "Start date", type: "date", required: true },
      { k: "plan", label: "Plan", type: "select", options: ["Weekly", "Fortnightly"], required: true },
      { k: "notes", label: "Intake notes", type: "textarea", placeholder: "Goals, injuries, anything from the sales call" },
    ],
  },
  {
    // R19-2d: a TRANSFER is not an onboarding. The client is already coaching
    // with someone; the new coach needs to pick up a relationship, not start
    // one. Sending "Onboard" for a transfer told the coach to run an intake
    // that already happened months ago.
    id: "handover",
    label: "Client handover",
    short: "Handover",
    creatableBy: ["owner", "head_of_ops"],
    routing: "picked",
    fields: [
      { k: "client", label: "Client name", type: "client", required: true, placeholder: "Start typing a client name…" },
      { k: "fromCoach", label: "Coming from", type: "text", required: true },
      { k: "startDate", label: "Client start date", type: "date" },
      { k: "plan", label: "Cadence", type: "select", options: ["Weekly", "Fortnightly"] },
      { k: "notes", label: "Handover notes", type: "textarea", placeholder: "Where they are up to, anything the new coach should know" },
    ],
  },
];

export const templateById = (id: string | null | undefined): TaskTemplate | undefined =>
  TASK_TEMPLATES.find((t) => t.id === id);

/** Card headline per template (mockup title(values)). */
export function templateTitle(t: TaskTemplate, f: Record<string, string>): string {
  switch (t.id) {
    case "pause":
      return `Pause: ${f.client ?? "?"} · ${f.start ?? "?"} to ${f.end ?? "?"}`;
    case "cancel":
      return `Cancel: ${f.client ?? "?"} · effective ${f.effective ?? "?"}`;
    case "admin":
      return `Admin (${f.system ?? "?"}): ${(f.request ?? "").slice(0, 80)}`;
    case "onboard":
      return `Onboard: ${f.client ?? "?"} · starts ${f.startDate ?? "?"}`;
    case "handover":
      return `Handover: ${f.client ?? "?"} · from ${f.fromCoach ?? "?"}`;
    default:
      return (f.brief ?? "Task").slice(0, 120);
  }
}

/** Plain-English scannable summary (mockup summary(values)). */
export function templateSummary(t: TaskTemplate, f: Record<string, string>): string {
  switch (t.id) {
    case "pause":
      return `${f.client} needs to pause from ${f.start} until ${f.end}${f.reason ? `: ${f.reason.toLowerCase()}` : ""}.`;
    case "cancel":
      // R8-6 (Dan: "did they try to save them?"): the save attempt reads on
      // the card summary, exactly like the mockup's summary(values).
      return `${f.client} wants to cancel effective ${f.effective}${f.reason ? `: ${f.reason}` : ""}. Save attempt: ${f.saveAttempt || "not recorded"}.`;
    case "admin":
      return `${f.system}: ${f.request}`;
    case "onboard":
      return `${f.client} starts ${f.startDate} on the ${f.plan} plan.`;
    case "handover":
      return `${f.client} moves across from ${f.fromCoach}${f.plan ? ` on the ${f.plan} plan` : ""}. They are already coaching, so pick up where ${f.fromCoach} left off.`;
    default:
      return f.brief ?? "";
  }
}
