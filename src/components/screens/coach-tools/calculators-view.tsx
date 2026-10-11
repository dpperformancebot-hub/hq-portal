"use client";

// Calculators (M6, coach toolset): Starting Macro Calculator, the one
// fully-built calculator in the prototype, ported onto the app stack. The
// maths lives in src/lib/coach-content/macro-calculator.ts (DP policy,
// ported verbatim). Tab scaffold ready for more calculators.

import { useMemo, useState } from "react";
import { Card, PageHeader, Panel } from "@/components/ui";
import { CALCULATORS } from "@/lib/coach-content/calculators";
import {
  computeMacros,
  type Activity,
  type BfRange,
  type Gender,
  type Goal,
  type MacroSplit,
} from "@/lib/coach-content/macro-calculator";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg tabular-nums focus:outline-none focus:ring-1 focus:ring-accent";

function NumberInput({ value, onChange }: { value: number | ""; onChange: (v: number | "") => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className={inputCls}
    />
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function MacroCard({ title, data }: { title: string; data: MacroSplit }) {
  const DOT: Record<string, string> = { protein: "bg-accent", carbs: "bg-[#3b82f6]", fat: "bg-warn" };
  return (
    <Card className="flex-1">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</div>
        <div className="font-display text-sm tabular-nums tracking-display text-accent">
          {data.kcal.toLocaleString()} kcal
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {(["protein", "carbs", "fat"] as const).map((k) => (
          <div key={k} className="flex items-center gap-2.5 text-sm">
            <span className={`h-2 w-2 rounded-pill ${DOT[k]}`} />
            <span className="flex-1 capitalize text-fg">{k}</span>
            <span className="font-semibold tabular-nums text-fg">{data[k].g}g</span>
            <span className="w-9 text-right text-xs tabular-nums text-fg-muted">{data[k].pct}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function CalculatorsView() {
  const [gender, setGender] = useState<Gender>("M");
  const [age, setAge] = useState<number | "">(30);
  const [heightCm, setHeightCm] = useState<number | "">(178);
  const [weightKg, setWeightKg] = useState<number | "">(80);
  const [targetWeightKg, setTargetWeightKg] = useState<number | "">("");
  const [trainingDays, setTrainingDays] = useState<number | "">(4);
  const [activity, setActivity] = useState<Activity>("moderate");
  const [goal, setGoal] = useState<Goal>("cut");
  const [bfRange, setBfRange] = useState<BfRange>("mid");

  const result = useMemo(
    () =>
      computeMacros({
        gender,
        age: Number(age) || 0,
        heightCm: Number(heightCm) || 0,
        weightKg: Number(weightKg) || 0,
        targetWeightKg: targetWeightKg === "" ? null : Number(targetWeightKg),
        trainingDays: Number(trainingDays) || 0,
        activity,
        goal,
        bfRange,
      }),
    [gender, age, heightCm, weightKg, targetWeightKg, trainingDays, activity, goal, bfRange],
  );

  const calc = CALCULATORS[0];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Coach tools" title="Calculators" subtitle={calc?.summary} />

      <Panel title="Starting Macro Calculator">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <Field label="Gender">
            <Select
              value={gender}
              onChange={setGender}
              options={[
                { value: "M", label: "Male" },
                { value: "F", label: "Female" },
              ]}
            />
          </Field>
          <Field label="Age">
            <NumberInput value={age} onChange={setAge} />
          </Field>
          <Field label="Height (cm)">
            <NumberInput value={heightCm} onChange={setHeightCm} />
          </Field>
          <Field label="Weight (kg)">
            <NumberInput value={weightKg} onChange={setWeightKg} />
          </Field>
          <Field label="Target weight (kg, optional)">
            <NumberInput value={targetWeightKg} onChange={setTargetWeightKg} />
          </Field>
          <Field label="Training days / week">
            <NumberInput value={trainingDays} onChange={setTrainingDays} />
          </Field>
          <Field label="Daily activity (outside training)">
            <Select
              value={activity}
              onChange={setActivity}
              options={[
                { value: "sedentary", label: "Sedentary (<5k steps)" },
                { value: "light", label: "Light (5-7.5k)" },
                { value: "moderate", label: "Moderate (7.5-10k)" },
                { value: "active", label: "Active (10-14k)" },
                { value: "very", label: "Very active (14k+)" },
              ]}
            />
          </Field>
          <Field label="Goal">
            <Select
              value={goal}
              onChange={setGoal}
              options={[
                { value: "cut", label: "Cut" },
                { value: "maintain", label: "Maintain" },
                { value: "bulk", label: "Lean bulk" },
              ]}
            />
          </Field>
          {goal === "cut" ? (
            <Field label="Body fat range">
              <Select
                value={bfRange}
                onChange={setBfRange}
                options={[
                  { value: "low", label: "Lean (<=12% M / <=18% F)" },
                  { value: "mid", label: "Mid (12-25% M / 18-30% F)" },
                  { value: "high", label: "High (>25% M / >30% F)" },
                ]}
              />
            </Field>
          ) : null}
        </div>
      </Panel>

      {result ? (
        <>
          {result.inputWarnings.length > 0 ? (
            <Card>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-warn">Check inputs</div>
              <ul className="mt-1 space-y-1 text-sm text-fg-dim">
                {result.inputWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-fg-muted">BMR (Mifflin-St Jeor)</div>
                <div className="font-display tabular-nums tracking-display text-fg">{result.bmr.toLocaleString()} kcal</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-fg-muted">Activity</div>
                <div className="text-fg">
                  {result.actLabel} (x{result.actMult})
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-fg-muted">TDEE</div>
                <div className="font-display tabular-nums tracking-display text-fg">{result.tdee.toLocaleString()} kcal</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-fg-muted">Phase</div>
                <div className="text-fg">{result.goalDescription}</div>
              </div>
            </div>
            {result.calorieFloorHit ? (
              <p className="mt-3 text-sm text-warn">
                Calorie floor applied: house standard never programs below {result.floorMin.toLocaleString()} kcal for this
                client profile.
              </p>
            ) : null}
          </Card>

          <div className="flex flex-col gap-4 md:flex-row">
            <MacroCard title="Training day" data={result.trainingDay} />
            <MacroCard title="Rest day" data={result.restDay} />
          </div>
        </>
      ) : null}
    </div>
  );
}
