// Shared types for the coach toolset content (extracted from the prototype).
// Data lives in sibling modules SPLIT BY CONSUMER so client components never
// pull the heavy academy JSON (~330KB) into the browser bundle:
//   recipes.ts / quizzes.ts / calculators.ts -> client-safe (small)
//   academy.ts -> server components only

export type Recipe = {
  title: string;
  tags: string[];
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
  rating: number;
  /** Full recipe body (2026-07-02): the original portal only ever had macro
   *  cards, so these were authored for the HQ, portioned to approximate the
   *  listed macros. Editable in recipes.json. Optional so extra recipes
   *  without bodies still render as cards. */
  serves?: number;
  ingredients?: string[];
  method?: string[];
};

export type QuizQuestion = { q: string; options: string[]; correct: number };

export type Quiz = {
  id: string;
  title: string;
  description: string;
  expect: string[];
  questions: QuizQuestion[];
};

export type AcademyLesson = {
  id: string;
  number: string;
  title: string;
  summary: string;
  loomUrl: string;
  body: string;
};

export type AcademyModule = {
  id: string;
  number: number;
  title: string;
  summary: string;
  introLoomUrl: string;
  lessons: AcademyLesson[];
  quiz: { title: string; passMark: number; questions: QuizQuestion[] };
};

export type CalculatorMeta = { id: string; title: string; summary: string };
