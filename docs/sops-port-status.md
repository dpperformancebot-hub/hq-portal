# SOPs port status (2026-06-30)

Status of the coach SOP library in the HQ, and exactly what is still needed.

## Ported in-repo (3 of ~22) — full written body + Loom(s)

These live in `src/lib/coach-content/sops.ts`, server-rendered at `/sops` for the coach role:

| SOP | Category | Looms |
|---|---|---|
| Welcome Videos | Programming & Systems | 1 |
| Admin, Logs, Follow-Ups & Client Management | Programming & Systems | 3 |
| Kahunas System & Plan Setup | Programming & Systems | 1 |

These are the only SOPs with full content available anywhere in this repo (verified against `reference/prototype.html`, whose `SOPS` array contains exactly these three).

## Not ported (~19) — content not in-repo, OWNER ACTION REQUIRED

The remaining SOPs exist only on the external site **sop-library-six.vercel.app** (referenced via the `googleDocUrl` links). Their full text is not in this repository, so they cannot be ported here without the source content. We deliberately do not scrape the external site.

By category (from the external library / Academy structure; exact per-SOP titles come with the export):

- **Communication & Coaching Fundamentals** — DPperformance philosophy, coaching language & rapport, the coach-client relationship, what we don't do.
- **Nutrition** — energy needs & starting calories, macronutrient targets, deficit pacing by body fat, the 3+2 meal model, multi-system fluency, off-plan meals / alcohol / social events.
- **Training** — hypertrophy fundamentals, effort (0-1 RIR with capped volume), and the rest of the programming SOPs.
- **Decision Making & Check-in Mastery** — running the system, check-in decision SOPs.

> **Owner action:** export the full text of each remaining SOP from sop-library-six.vercel.app (or share that site's repo). Once supplied, each is a verbatim paste into the `COACH_SOPS` array in `src/lib/coach-content/sops.ts` (same `**Heading**` / `- bullet` markdown-lite, with `category`, `summary`, `looms`, and `googleDocUrl`), with no further code changes — the `/sops` view renders any number of entries grouped by category.

## In-app

The coach SOPs screen now shows an honest "More SOPs" card: it states how many are ported, that the rest of the library is external, that the owner must export it, and links out to the full library in the meantime.
