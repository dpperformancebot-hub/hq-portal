// Pill primitives. Class strings are written out in full so Tailwind's JIT
// picks them up (do not build these class names dynamically).

const pillBase =
  "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium";

const STATUS: Record<string, { cls: string; dot: string; label: string }> = {
  sent: { cls: "bg-status-sent text-status-sent-fg", dot: "bg-status-sent-dot", label: "Sent" },
  submitted: { cls: "bg-status-submitted text-status-submitted-fg", dot: "bg-status-submitted-dot", label: "Submitted" },
  due: { cls: "bg-status-due text-status-due-fg", dot: "bg-status-due-dot", label: "Due" },
  missed: { cls: "bg-status-missed text-status-missed-fg", dot: "bg-status-missed-dot", label: "Missed" },
  // R13-5: the N code is the one that needs attention, so it is red (missed
  // tokens) with its own label; "due" stays amber for engagement/audit states.
  "no-check-in": { cls: "bg-status-missed text-status-missed-fg", dot: "bg-status-missed-dot", label: "No check-in" },
  messaged: { cls: "bg-status-messaged text-status-messaged-fg", dot: "bg-status-messaged-dot", label: "Messaged" },
  "send-message": { cls: "bg-status-send-message text-status-send-message-fg", dot: "bg-status-send-message-dot", label: "Send Msg" },
  "message-sent": { cls: "bg-status-message-sent text-status-message-sent-fg", dot: "bg-status-message-sent-dot", label: "Message sent" },
  "missed-check-in": { cls: "bg-status-missed-check-in text-status-missed-check-in-fg", dot: "bg-status-missed-check-in-dot", label: "Missed" },
  "follow-up": { cls: "bg-status-follow-up text-status-follow-up-fg", dot: "bg-status-follow-up-dot", label: "Follow-up" },
  paused: { cls: "bg-status-paused text-status-paused-fg", dot: "bg-status-paused-dot", label: "Paused" },
  ghosted: { cls: "bg-status-ghosted text-status-ghosted-fg", dot: "bg-status-ghosted-dot", label: "Ghosted" },
  cancelled: { cls: "bg-status-cancelled text-status-cancelled-fg", dot: "bg-status-cancelled-dot", label: "Cancelled" },
};

const PLAN: Record<string, { cls: string; label: string }> = {
  weekly: { cls: "bg-plan-weekly text-plan-weekly-fg", label: "Weekly" },
  fortnightly: { cls: "bg-plan-fortnightly text-plan-fortnightly-fg", label: "Fortnightly" },
  monthly: { cls: "bg-type-policy text-type-policy-fg", label: "Monthly" },
};

const TYPE: Record<string, { cls: string; label: string }> = {
  sop: { cls: "bg-type-sop text-type-sop-fg", label: "SOP" },
  video: { cls: "bg-type-video text-type-video-fg", label: "Video" },
  article: { cls: "bg-type-article text-type-article-fg", label: "Article" },
  template: { cls: "bg-type-template text-type-template-fg", label: "Template" },
  cpd: { cls: "bg-type-cpd text-type-cpd-fg", label: "CPD" },
  policy: { cls: "bg-type-policy text-type-policy-fg", label: "Policy" },
};

// Conditional onboarding pathway tags. Reuse existing resource-type tokens so
// no new theme variables are introduced; both themes already define these.
const ONBOARDING: Record<string, { cls: string; label: string }> = {
  Standard: { cls: "bg-type-sop text-type-sop-fg", label: "Standard" },
  Challenge: { cls: "bg-type-cpd text-type-cpd-fg", label: "Challenge" },
  Photoshoot: { cls: "bg-type-video text-type-video-fg", label: "Photoshoot" },
};

export type StatusVariant = keyof typeof STATUS;
export type PlanVariant = keyof typeof PLAN;
export type TypeVariant = keyof typeof TYPE;
export type OnboardingVariant = keyof typeof ONBOARDING;

export function StatusPill({ variant }: { variant: StatusVariant }) {
  const s = STATUS[variant];
  return (
    <span className={`${pillBase} ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-pill ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

export function PlanPill({ variant }: { variant: PlanVariant }) {
  const p = PLAN[variant];
  return <span className={`${pillBase} ${p.cls}`}>{p.label}</span>;
}

export function TypePill({ variant }: { variant: TypeVariant }) {
  const t = TYPE[variant];
  return <span className={`${pillBase} ${t.cls}`}>{t.label}</span>;
}

export function OnboardingPill({ variant }: { variant: OnboardingVariant }) {
  const o = ONBOARDING[variant];
  return <span className={`${pillBase} ${o.cls}`}>{o.label}</span>;
}

export const STATUS_VARIANTS = Object.keys(STATUS) as StatusVariant[];
export const PLAN_VARIANTS = Object.keys(PLAN) as PlanVariant[];
export const TYPE_VARIANTS = Object.keys(TYPE) as TypeVariant[];
