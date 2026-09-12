/** @type {import('tailwindcss').Config} */
export default {
  // Scoped to the landing page trial only — content paths still cover the
  // whole src tree (Tailwind only emits classes it finds used), but the
  // real scoping mechanism is corePlugins.preflight below: with it off,
  // Tailwind never touches global element defaults (body/button/input/h1
  // margins, borders, etc.), so nothing here can visually affect the rest
  // of the app, which still runs entirely on styles/theme.css.
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      // Reuse the existing dark-theme tokens from styles/theme.css instead
      // of redefining the palette — one source of truth for color values,
      // shadcn's className conventions (bg-background, text-foreground,
      // bg-primary, ...) just point at the same CSS custom properties.
      colors: {
        background: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-raised": "var(--color-surface-raised)",
        foreground: "var(--color-text)",
        "muted-foreground": "var(--color-neutral-400)",
        border: "var(--color-divider)",
        primary: {
          DEFAULT: "var(--color-accent)",
          foreground: "#05171c",
        },
        accent: {
          DEFAULT: "var(--color-accent-800)",
          foreground: "var(--color-accent-200)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      fontFamily: {
        sans: "var(--font-body)",
        heading: "var(--font-heading)",
        mono: "var(--font-mono)",
      },
      boxShadow: {
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
    },
  },
  plugins: [],
};
