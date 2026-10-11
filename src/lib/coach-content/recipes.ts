import recipesJson from "./recipes.json";
import type { Recipe } from "./types";
import { IS_DP } from "@/lib/brand";

// DP's built-in recipe library: DP brand only. A rebranded deploy starts with
// an empty index and fills it via coach sheet uploads (recipes DB table).
export const RECIPES: Recipe[] = IS_DP ? (recipesJson as Recipe[]) : [];
export const RECIPE_TAGS = ["All", "Breakfast", "Lunch", "Dinner", "Snack", "High-protein", "Low-carb"];
export type { Recipe } from "./types";
