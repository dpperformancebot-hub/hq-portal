import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import { getServerIdentity } from "@/lib/role-server";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrimitivesShowcase } from "@/components/style-guide/primitives-showcase";
import {
  OnboardingPill,
  PlanPill,
  StatusPill,
  TypePill,
  PLAN_VARIANTS,
  STATUS_VARIANTS,
  TYPE_VARIANTS,
} from "@/components/ui/pill";

const ONBOARDING_VARIANTS = ["Standard", "Challenge", "Photoshoot"] as const;

export const metadata: Metadata = {
  title: "Style Guide",
  robots: { index: false, follow: false },
};

const BASE_TOKENS: { varName: string; label: string }[] = [
  { varName: "--bg", label: "Background" },
  { varName: "--panel", label: "Surface / Card" },
  { varName: "--panel-2", label: "Surface 2" },
  { varName: "--panel-3", label: "Surface 3" },
  { varName: "--border", label: "Border" },
  { varName: "--border-soft", label: "Border soft" },
  { varName: "--accent", label: "Accent" },
  { varName: "--accent-soft", label: "Accent soft" },
  { varName: "--accent-deep", label: "Accent deep" },
  { varName: "--accent-solid", label: "Accent solid" },
  { varName: "--positive", label: "Positive" },
  { varName: "--positive-soft", label: "Positive soft" },
  { varName: "--warn", label: "Warn" },
  { varName: "--warn-soft", label: "Warn soft" },
  { varName: "--danger", label: "Danger" },
  { varName: "--danger-soft", label: "Danger soft" },
];

const RADII: { cls: string; label: string }[] = [
  { cls: "rounded-sm", label: "sm 6px" },
  { cls: "rounded-control", label: "control 8px" },
  { cls: "rounded-card", label: "card 14px" },
  { cls: "rounded-pill", label: "pill" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </h3>
  );
}

function Swatch({ varName, label }: { varName: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-12 w-full rounded-control border border-border"
        style={{ backgroundColor: `var(${varName})` }}
      />
      <div className="text-xs text-fg-dim">{label}</div>
      <div className="text-[11px] text-fg-muted">{varName}</div>
    </div>
  );
}

function ThemePanel({ theme }: { theme: "light" | "dark" }) {
  return (
    <section
      className={`${theme} flex-1 rounded-card border border-border bg-bg p-6 text-fg`}
    >
      <header className="mb-6 flex items-baseline justify-between">
        <h2 className="font-display text-2xl tracking-display">
          {theme === "light" ? "Light" : "Dark"}
        </h2>
        <span className="text-xs text-fg-muted">forced .{theme}</span>
      </header>

      <div className="mb-8">
        <SectionLabel>Base palette</SectionLabel>
        <div className="grid grid-cols-4 gap-3">
          {BASE_TOKENS.map((t) => (
            <Swatch key={t.varName} varName={t.varName} label={t.label} />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <SectionLabel>Text ladder</SectionLabel>
        <div className="space-y-1">
          <p className="text-fg">Primary text. The main reading level.</p>
          <p className="text-fg-dim">Dim text. Secondary, supporting copy.</p>
          <p className="text-fg-muted">Muted text. Labels, captions, hints.</p>
        </div>
      </div>

      <div className="mb-8">
        <SectionLabel>Typography</SectionLabel>
        <p className="font-display text-4xl tracking-display">Fraunces display</p>
        <p className="font-display text-2xl font-normal tracking-display text-fg-dim">
          Display 400, tight tracking
        </p>
        <p className="font-display text-2xl font-semibold tracking-display">
          Display 600, tight tracking
        </p>
        <p className="mt-3 font-sans text-base text-fg">
          Inter body. The quick brown fox jumps over the lazy dog.
        </p>
        <p className="font-sans text-sm text-fg-dim">
          Inter small. The quick brown fox jumps over the lazy dog.
        </p>
      </div>

      <div className="mb-8">
        <SectionLabel>KPI display number</SectionLabel>
        <div className="flex items-end gap-6">
          <div className="[container-type:inline-size]">
            <div className="kpi text-fg">1,284</div>
            <div className="text-xs text-fg-muted">Active clients</div>
          </div>
          <div className="[container-type:inline-size]">
            <div className="kpi text-accent">$48,250</div>
            <div className="text-xs text-fg-muted">MRR</div>
          </div>
          <div className="[container-type:inline-size]">
            <div className="kpi text-fg">-3.1%</div>
            <div className="text-xs text-fg-muted">Net change</div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <SectionLabel>Status pills</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {STATUS_VARIANTS.map((v) => (
            <StatusPill key={v} variant={v} />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <SectionLabel>Plan pills</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {PLAN_VARIANTS.map((v) => (
            <PlanPill key={v} variant={v} />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <SectionLabel>Resource-type pills</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {TYPE_VARIANTS.map((v) => (
            <TypePill key={v} variant={v} />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <SectionLabel>Onboarding pills</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {ONBOARDING_VARIANTS.map((v) => (
            <OnboardingPill key={v} variant={v} />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <SectionLabel>Radii</SectionLabel>
        <div className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <div key={r.cls} className="flex flex-col items-center gap-1.5">
              <div
                className={`h-16 w-16 border border-border bg-surface-2 ${r.cls}`}
              />
              <div className="text-[11px] text-fg-muted">{r.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Depth: hairline borders, no shadows</SectionLabel>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="text-sm text-fg">Card on surface</div>
          <div className="mt-1 text-xs text-fg-dim">
            1px hairline border defines the edge. No drop shadow.
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-border pt-8">
        <SectionLabel>Primitives</SectionLabel>
        <PrimitivesShowcase />
      </div>
    </section>
  );
}

export default async function StyleGuidePage() {
  // The showcase renders placeholder $ figures (a sample MRR KPI, revenue
  // chart, rate column). On TJD a coach or head coach must not see any $
  // figure, real or sample, so they land on their dashboard. DP unchanged.
  if (moneyHiddenFromViewer(await getServerIdentity())) redirect("/dashboard");
  return (
    <main className="min-h-full bg-bg p-6 text-fg">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-display">Style guide</h1>
          <p className="text-sm text-fg-dim">
            Token set in both themes. The toggle flips the app theme (this
            page chrome); the two panels below are always shown side by side.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <ThemePanel theme="light" />
        <ThemePanel theme="dark" />
      </div>
    </main>
  );
}
