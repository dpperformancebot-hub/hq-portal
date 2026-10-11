import quizzesJson from "./quizzes.json";
import type { Quiz } from "./types";
import { IS_DP } from "@/lib/brand";

// DP-authored coach quizzes (Daniel-specific): DP brand only; empty elsewhere.
export const QUIZZES: Quiz[] = IS_DP ? (quizzesJson as Quiz[]) : [];
export type { Quiz, QuizQuestion } from "./types";
