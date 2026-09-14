# Static UI i18n workflow (Stage 3I)

This covers the app's own **chrome** — nav labels, buttons, dialog copy —
via `react-i18next`. It's a distinct system from Stage 1B's "Answer
language" (Settings → Answer language), which controls the language the
AI writes its prose in (`synthesis.py`'s language steering). The two are
independent by design: an operator can read the app in English and get
answers in Hindi, or the reverse. See `UserMenu.jsx`'s Settings dialog,
which shows both controls side by side with that distinction spelled out
in the help text under each.

Only English and Hindi exist as UI locales — there's no "Hinglish UI".
Hinglish is a spoken/written register for AI answers, not something real
apps localize menus and buttons into; a Hinglish "App language" option
would mean guessing at code-mixed translations of "Dashboard" and "Sign
out" with no natural answer. If regional-language UI is ever built (see
Stage 3J in the roadmap — explicitly data-gated, not pre-built), it
extends this same infrastructure with another locale folder, not a
different system.

## Current coverage — and what's deliberately still English

Fully translated: the nav bar (`NavBar.jsx`), the chat page shell
(`ChatPage.jsx` — sidebar, empty-state hero, compensation banner, input
area, sending indicator), and the Settings dialog (`UserMenu.jsx`).

**Not yet translated, on purpose**: Dashboard, Data Sources, Diagnoses,
Landing, Login, and Onboarding pages, plus every AI-generated answer's
own supporting UI (`AnswerCard.jsx`, `SourceDrawer.jsx`, `CitationTag.jsx`)
still render their English strings regardless of the App language
setting. This wasn't an oversight — extending coverage to the rest of the
app is real, additional work (every string audited, translated, and
visually re-checked with Devanagari for overflow — see the QA section
below), and claiming it was done without actually doing it would be worse
than being explicit about what's covered today. Extend it page by page
following the pattern below; there's no infrastructure blocker to doing
that incrementally.

## How the pieces fit together

- **`frontend/src/i18n.js`** — `react-i18next` config. `fallbackLng: "en"`,
  language persisted to `localStorage` under `rgpt-ui-lang` via
  `i18next-browser-languagedetector`.
- **`frontend/src/locales/{en,hi}/common.json`** — one flat namespace
  (`common`) per locale, keys grouped by page/component (`nav.*`,
  `settings.*`, `chat.*`). Add a new top-level group per new page you
  cover, matching the component name loosely so it's easy to find.
- **`frontend/index.html`** — sets `document.documentElement.lang` from
  `localStorage` before first paint (same pattern as the dark/light theme
  toggle — no flash of the wrong language on reload), and loads the Noto
  Sans Devanagari webfont.
- **`frontend/src/styles/theme.css`** — `--font-body` has Noto Sans
  Devanagari appended as a fallback (not a swap): the browser only reaches
  for it per-glyph, for characters the earlier fonts in the stack don't
  cover, so English text is completely unaffected by this regardless of
  which language is active.
- **`UserMenu.jsx`'s "App language" control** — calls
  `i18n.changeLanguage("en" | "hi")` directly; the detector's
  `localStorage` cache persists it automatically, no extra code needed on
  the write side.

## Adding a translation key

1. Add the English string to `locales/en/common.json` under the
   appropriate group.
2. Add the Hindi translation to `locales/hi/common.json` at the same key
   path. Keep the register plain and business-facing, matching
   `docs/jargon-relabeling-map.md`'s tone — not formal/bureaucratic Hindi,
   not transliterated English.
3. In the component, `const { t } = useTranslation()` and replace the
   literal string with `t("group.key")`.
4. For strings with a variable, use `{{placeholder}}` interpolation
   (`t("chat.pressEnter", { key: "⏎" })`) rather than string-concatenating
   around a translated fragment — word order differs between English and
   Hindi, so half-translating a sentence around a fixed English fragment
   produces broken grammar in Hindi even when every individual word is
   correct.
5. For pluralized strings, use i18next's `_one`/`_other` key suffixes
   (see `chat.compFileClaims_one` / `_other`) rather than building the
   plural in JSX — Hindi's plural rules aren't "add an s", and i18next's
   plural resolution handles that per-locale automatically as long as the
   keys are named this way.
6. Never put a variable that carries meaning across languages (an order
   ID, a ₹ amount, a citation marker) inside a translated string as
   anything other than an interpolated `{{value}}` — same rule as
   `synthesis.py`'s language-steering guardrail for AI answers, just
   applied to static UI copy instead of model output.

## Extending coverage to a new page

Pick one page, translate everything render-visible on it (including
`aria-label`/`title` attributes — screen reader users need this exactly
as much as sighted users), then verify per the QA section below before
moving to the next page. Don't do a shallow partial pass across many
pages — a page that's half-translated is more confusing than one that's
entirely in English, since the reader can't tell whether the English text
they're seeing is intentional or a bug.

## QA-ing a newly translated page

The exact process used to verify NavBar/ChatPage/Settings in this pass —
repeat it for whatever page you add:

1. Build a temporary preview route rendering the page with
   `i18n.changeLanguage("hi")` forced, wrapped in whatever context
   providers it needs (`AuthProvider` at minimum — most pages also expect
   a live API, which will 404/500 harmlessly if you're not running the
   backend, as long as the component already handles a failed fetch).
2. Screenshot it at a desktop width and at ~390px (phone width) — Hindi
   strings run longer than their English source in translation, and a nav
   pill or button sized for the English label can overflow with the Hindi
   one. Check `document.documentElement.scrollWidth` against the viewport
   width to catch horizontal overflow directly rather than eyeballing it.
3. Delete the temporary preview route and revert any temporary routing
   changes before committing — it should never ship.

## What this doesn't cover

- **AI answer content** — that's Stage 1B/`synthesis.py`, a completely
  separate mechanism (prompting the model, not a translation catalog).
- **Regional languages beyond Hindi** — explicitly out of scope per the
  roadmap's Stage 3J (data-gated: don't build language support ahead of
  evidence real users in that region are on the platform).
- **RTL layout** — not needed for English/Hindi (both LTR); if a future
  language requires RTL, that's a real layout audit, not just new JSON
  files.
