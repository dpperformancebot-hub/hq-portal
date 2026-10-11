import calculatorsJson from "./calculators.json";
import type { CalculatorMeta } from "./types";

export const CALCULATORS = calculatorsJson as CalculatorMeta[];
export type { CalculatorMeta } from "./types";
