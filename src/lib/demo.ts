/** Demo mode: seed data + "Demo data" badge. Default ON; flip live by setting
 *  NEXT_PUBLIC_DEMO_MODE=false in .env.local / Vercel (plus GHL_API_TOKEN,
 *  see src/lib/data.ts). NEXT_PUBLIC_ so the badge (client component) and the
 *  server facade resolve the same value. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
