# Stage 3J — regional language expansion: status

**Not built, on purpose.** The roadmap marks Stage 3J ("regional language
expansion" — languages beyond Hindi/Hinglish) as explicitly data-gated:
build it once there's real evidence of demand, not ahead of it. This
document exists so that absence is a recorded decision, not something a
future reader has to rediscover or wonder whether it was simply missed.

## Why gating matters here specifically

Every regional language added is real, ongoing cost, not a one-time
toggle: a golden set for the eval harness (`backend/eval/golden_set_*.json`
— 2F's Hindi/Hinglish sets took real translation and adversarial-case
design work, not machine translation of the English set), a
language-steering block in `synthesis.py` someone has to keep correct as
prompts evolve, and — if UI coverage extends to it — a full locale
catalog (`frontend/src/locales/`) that needs the same QA pass documented
in `docs/i18n-workflow.md` (Devanagari-class script-rendering and layout
checks, translated by someone who can actually judge tone and
correctness). Pre-building any of that for a language with zero
confirmed operators is pure sunk cost with no way to validate it's even
correct, since there's no real usage to catch mistakes.

## What already exists (confirmed this pass, not newly added)

Nothing in the signup flow captures a real geography/region signal today.
`OnboardingPage.jsx` only collects a restaurant name;
`restaurants.aggregator_platform` and `restaurants.timezone`
(migration 001) are set to hardcoded defaults (`"multi"`,
`"Asia/Kolkata"`) server-side in `onboarding.py`, never surfaced to or
chosen by the operator — so they're not a real signal of where a
restaurant operates, just a fixed default. There was nothing to "confirm
and keep" beyond noting that this is the current state.

## What was deliberately NOT added in this pass

- No new state/city/region field on the onboarding form or the
  `restaurants` table. Adding one now, with no plan yet for what it would
  gate, would itself be pre-building ahead of a decision — the same
  mistake this document exists to avoid, just moved one step earlier in
  the pipeline.
- No additional locale catalog beyond `en`/`hi` (Stage 3I).
- No additional eval golden set beyond `en`/`hi`/`hinglish` (Stage 2F).

## The actual gating signal, once it exists

Stage 88's `app_events` table already gives this a real, queryable
trigger instead of a guess: `answer_language_changed` events
(`GET /api/events/summary`) show adoption of the existing Hindi/Hinglish
Answer language option. If that data — or a future real geography signal,
should one get added deliberately for its own reason rather than for this
— shows material demand for a specific language RestaurantGPT doesn't yet
support, that's the trigger to revisit this document and scope 3J for
real, following the same pattern Stage 1B/2F/3I already established
(golden set → language steering → eval gate → UI catalog, in that order).
