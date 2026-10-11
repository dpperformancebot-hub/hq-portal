// Types-only barrel. Data exports intentionally live in per-consumer modules
// (recipes.ts, quizzes.ts, academy.ts, calculators.ts) so client components
// never pull the ~330KB academy JSON into the browser bundle. Import data
// from those modules directly, never from here.

export type {
  AcademyLesson,
  AcademyModule,
  CalculatorMeta,
  Quiz,
  QuizQuestion,
  Recipe,
} from "./types";
