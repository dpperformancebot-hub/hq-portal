import type { Config } from "tailwindcss";

// All color tokens resolve to CSS variables defined in src/app/globals.css.
// Light values live under :root / .light, dark values under .dark, so flipping
// the .dark class on <html> repaints the whole app.
export default {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--panel)",
        "surface-2": "var(--panel-2)",
        "surface-3": "var(--panel-3)",
        border: "var(--border)",
        "border-soft": "var(--border-soft)",

        // Three-step text ladder. Hierarchy comes from this, not font weight.
        fg: "var(--text)",
        "fg-dim": "var(--text-dim)",
        "fg-muted": "var(--text-muted)",

        // Green is the only accent. Use sparingly.
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
          deep: "var(--accent-deep)",
          solid: "var(--accent-solid)",
        },
        positive: {
          DEFAULT: "var(--positive)",
          soft: "var(--positive-soft)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          soft: "var(--warn-soft)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)",
        },

        // Status pills. DEFAULT is the background; fg the text; dot the marker.
        status: {
          sent: { DEFAULT: "var(--status-sent-bg)", fg: "var(--status-sent-fg)", dot: "var(--status-sent-dot)" },
          submitted: { DEFAULT: "var(--status-submitted-bg)", fg: "var(--status-submitted-fg)", dot: "var(--status-submitted-dot)" },
          due: { DEFAULT: "var(--status-due-bg)", fg: "var(--status-due-fg)", dot: "var(--status-due-dot)" },
          missed: { DEFAULT: "var(--status-missed-bg)", fg: "var(--status-missed-fg)", dot: "var(--status-missed-dot)" },
          messaged: { DEFAULT: "var(--status-messaged-bg)", fg: "var(--status-messaged-fg)", dot: "var(--status-messaged-dot)" },
          "send-message": { DEFAULT: "var(--status-send-message-bg)", fg: "var(--status-send-message-fg)", dot: "var(--status-send-message-dot)" },
          "message-sent": { DEFAULT: "var(--status-message-sent-bg)", fg: "var(--status-message-sent-fg)", dot: "var(--status-message-sent-dot)" },
          "missed-check-in": { DEFAULT: "var(--status-missed-check-in-bg)", fg: "var(--status-missed-check-in-fg)", dot: "var(--status-missed-check-in-dot)" },
          "follow-up": { DEFAULT: "var(--status-follow-up-bg)", fg: "var(--status-follow-up-fg)", dot: "var(--status-follow-up-dot)" },
          paused: { DEFAULT: "var(--status-paused-bg)", fg: "var(--status-paused-fg)", dot: "var(--status-paused-dot)" },
          ghosted: { DEFAULT: "var(--status-ghosted-bg)", fg: "var(--status-ghosted-fg)", dot: "var(--status-ghosted-dot)" },
          cancelled: { DEFAULT: "var(--status-cancelled-bg)", fg: "var(--status-cancelled-fg)", dot: "var(--status-cancelled-dot)" },
        },

        // Plan pills.
        plan: {
          weekly: { DEFAULT: "var(--plan-weekly-bg)", fg: "var(--plan-weekly-fg)" },
          fortnightly: { DEFAULT: "var(--plan-fortnightly-bg)", fg: "var(--plan-fortnightly-fg)" },
        },

        // Resource-type pills.
        type: {
          sop: { DEFAULT: "var(--type-sop-bg)", fg: "var(--type-sop-fg)" },
          video: { DEFAULT: "var(--type-video-bg)", fg: "var(--type-video-fg)" },
          article: { DEFAULT: "var(--type-article-bg)", fg: "var(--type-article-fg)" },
          template: { DEFAULT: "var(--type-template-bg)", fg: "var(--type-template-fg)" },
          cpd: { DEFAULT: "var(--type-cpd-bg)", fg: "var(--type-cpd-fg)" },
          policy: { DEFAULT: "var(--type-policy-bg)", fg: "var(--type-policy-fg)" },
        },
      },

      // Depth via 1px hairline borders, not shadows. Default border color is the token.
      borderColor: {
        DEFAULT: "var(--border)",
      },

      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },

      letterSpacing: {
        display: "-0.018em",
      },

      // Radius scale. Replaces hand-typed per-component radii.
      borderRadius: {
        sm: "6px",
        control: "8px", // buttons, chips, inputs
        card: "14px", // cards, panels
        pill: "9999px",
      },
    },
  },
  plugins: [],
} satisfies Config;
