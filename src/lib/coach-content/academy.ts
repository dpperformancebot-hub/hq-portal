// SERVER COMPONENTS ONLY: ~330KB of course content. Importing this from a
// "use client" module would ship the whole course to the browser.
import modulesJson from "./modules.json";
import type { AcademyModule } from "./types";
import { IS_DP } from "@/lib/brand";

// DP-authored curriculum: served only on the DP brand. A rebranded deploy
// (e.g. TJD) gets an empty course to fill with its own, DP keeps everything.
export const ACADEMY_MODULES: AcademyModule[] = IS_DP ? (modulesJson as AcademyModule[]) : [];
export type { AcademyLesson, AcademyModule } from "./types";
