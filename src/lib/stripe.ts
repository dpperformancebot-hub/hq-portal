// Public entry for the Stripe read layer (Financials: real cash, refunds,
// past-due). Implementation lives in src/lib/stripe/* — client.ts (the gated
// REST reader) and map.ts (Stripe -> HQ cash facts). INERT until the owner sets
// STRIPE_SECRET_KEY: stripeConfigured() is false, the Financials cash KPIs stay
// at zero, and the MRR run-rate estimate label remains. Server-side only.

export { stripeConfigured } from "@/lib/stripe/client";
export {
  getStripeFinancials,
  EMPTY_STRIPE_FINANCIALS,
  type StripeFinancials,
} from "@/lib/stripe/map";
