// Starting Macro Calculator maths, ported VERBATIM from the prototype's
// StartingMacroCalculator (reference/prototype.html): Mifflin-St Jeor BMR,
// NEAT-based activity multipliers, training-day premium, BF-graduated cut
// deficits (Daniel's Q1 stance), DP calorie floors, and phase-aware protein
// and fat tables. Pure functions, no IO: do not "improve" the coefficients
// here, they encode DP coaching policy.

export type Gender = "M" | "F";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very";
export type Goal = "cut" | "maintain" | "bulk";
export type BfRange = "low" | "mid" | "high";

export type MacroInputs = {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number | null;
  trainingDays: number;
  activity: Activity;
  goal: Goal;
  bfRange: BfRange;
};

export type MacroSplit = {
  kcal: number;
  protein: { g: number; kcal: number; pct: number };
  fat: { g: number; kcal: number; pct: number };
  carbs: { g: number; kcal: number; pct: number };
};

export type MacroResult = {
  bmr: number;
  actMult: number;
  actLabel: string;
  trainingPremium: number;
  tdee: number;
  goalDescription: string;
  trainingDay: MacroSplit;
  restDay: MacroSplit;
  calorieFloorHit: boolean;
  floorMin: number;
  inputWarnings: string[];
};

const ACTIVITY_MULT: Record<Activity, number> = {
  sedentary: 1.2, // desk + minimal steps (<5k)
  light: 1.35, // some walking (5-7.5k steps)
  moderate: 1.5, // moderate activity (7.5-10k steps)
  active: 1.65, // very active (10-14k steps)
  very: 1.8, // highly active (14k+, manual job)
};

const ACTIVITY_LABEL: Record<Activity, string> = {
  sedentary: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  active: "Active",
  very: "Very active",
};

const CUT_DEFICIT: Record<BfRange, number> = {
  low: 0.15, // lean clients: conservative 15%
  mid: 0.2, // mid-range: standard 20%
  high: 0.28, // high BF: more aggressive 28%
};

const PROTEIN_PER_KG: Record<Goal, Record<Gender, number>> = {
  cut: { M: 2.2, F: 1.8 },
  maintain: { M: 2.5, F: 2.0 },
  bulk: { M: 3.0, F: 2.2 },
};

export function computeMacros(i: MacroInputs): MacroResult | null {
  const w = Number(i.weightKg) || 0;
  const h = Number(i.heightCm) || 0;
  const a = Number(i.age) || 0;
  const td = Number(i.trainingDays) || 0;
  const tw = Number(i.targetWeightKg) || w;
  if (!w || !h || !a) return null;

  const bmr =
    i.gender === "M" ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
  const actMult = ACTIVITY_MULT[i.activity];
  const trainingPremium = (td * 220) / 7;
  const tdee = Math.round(bmr * actMult + trainingPremium);

  const inputWarnings: string[] = [];
  if (w < 35 || w > 200)
    inputWarnings.push(`Weight ${w} kg looks off: re-check the number is in kilograms (typical adult range 35-200 kg).`);
  if (h < 130 || h > 220)
    inputWarnings.push(`Height ${h} cm looks off: re-check the number is in centimetres (typical adult range 130-220 cm).`);
  if (a < 13 || a > 90) inputWarnings.push(`Age ${a} looks off: coaching range typically 13-90.`);
  if (tw < 35 || tw > 200) inputWarnings.push(`Target weight ${tw} kg looks off: re-check kilograms.`);
  if (tdee < 1000 || tdee > 5000)
    inputWarnings.push(
      `Estimated TDEE of ${tdee.toLocaleString()} kcal/day is implausible: almost certainly an input units error. Cross-check height (cm) and weight (kg).`,
    );

  let trainingDayKcal = tdee;
  let restDayKcal = tdee;
  let goalDescription = "";
  if (i.goal === "cut") {
    const deficitPct = CUT_DEFICIT[i.bfRange];
    trainingDayKcal = Math.round(tdee * (1 - deficitPct));
    restDayKcal = trainingDayKcal - 250;
    goalDescription = `Cut: ${Math.round(deficitPct * 100)}% deficit (BF-graduated)`;
  } else if (i.goal === "maintain") {
    trainingDayKcal = tdee;
    restDayKcal = tdee - 200;
    goalDescription = "Maintain: neutral energy balance";
  } else {
    trainingDayKcal = tdee + 250;
    restDayKcal = tdee - 100; // controlled rest day per the lean bulk SOP
    goalDescription = "Lean bulk: slight surplus on training days, near-maintenance on rest days";
  }

  const minCal = i.gender === "M" ? 1400 : 1200;
  const flooredTD = Math.max(trainingDayKcal, minCal);
  const flooredRD = Math.max(restDayKcal, minCal);
  const calorieFloorHit = trainingDayKcal < minCal || restDayKcal < minCal;

  const proteinG = Math.round(PROTEIN_PER_KG[i.goal][i.gender] * tw);
  const proteinKcal = proteinG * 4;
  const fatG = Math.round((i.gender === "F" ? 1.0 : 0.8) * w);
  const fatKcal = fatG * 9;

  const macrosFor = (kcal: number): MacroSplit => {
    const carbsKcal = kcal - proteinKcal - fatKcal;
    const carbsG = Math.max(0, Math.round(carbsKcal / 4));
    return {
      kcal,
      protein: { g: proteinG, kcal: proteinKcal, pct: Math.round((proteinKcal / kcal) * 100) },
      fat: { g: fatG, kcal: fatKcal, pct: Math.round((fatKcal / kcal) * 100) },
      carbs: { g: carbsG, kcal: carbsKcal, pct: Math.round((carbsKcal / kcal) * 100) },
    };
  };

  return {
    bmr: Math.round(bmr),
    actMult,
    actLabel: ACTIVITY_LABEL[i.activity],
    trainingPremium: Math.round(trainingPremium),
    tdee,
    goalDescription,
    trainingDay: macrosFor(flooredTD),
    restDay: macrosFor(flooredRD),
    calorieFloorHit,
    floorMin: minCal,
    inputWarnings,
  };
}
