# Model research spike: Hindi/Hinglish numeric reasoning (Stage 1C)

Research task, not a code change — informs what `SYNTHESIS_MODEL`/
`ROUTER_MODEL` should be for the Hindi/Hinglish feature (`synthesis.py`),
and what Stage 2F's eval harness should specifically test for.

## What's actually configured today

`backend/.env.example` / `app/config.py`:
- `ROUTER_MODEL=claude-haiku-4-5` — classifies intent + extracts slots from
  the user's raw question.
- `SQL_MODEL=claude-sonnet-5` — generates SQL.
- `SYNTHESIS_MODEL=claude-sonnet-5` — writes the final answer, including
  the Hindi/Hinglish output this spike is about.

## Findings

**Sonnet's numeric robustness under multilingual translation is the best
available signal, and it's a positive one.** MGSM-Pro (Lin et al., 2026 —
an extension of MGSM that re-tests the same math word problems with 5
different digit sets per question, specifically to catch models that get
a benchmark's exact numbers right by pattern-matching rather than actually
computing) found that **Claude Sonnet 4 was the single most robust model
across nine languages to digit changes — it moved from 2nd place on the
original MGSM to 1st place on MGSM-Pro**, ahead of Gemini 2.5 Flash and
GPT-4.1 specifically on *not* letting translated/localized number
formatting corrupt the actual arithmetic. That is precisely the failure
mode this app's whole "reason in English, answer in the target language"
guardrail (`synthesis.py`) is designed to prevent, so this is a real
point in favor of staying on the Sonnet line rather than switching.
[MGSM-Pro paper](https://arxiv.org/html/2601.21225)

**Caveat on that finding: it's Sonnet 4, not Sonnet 5.** No
Sonnet-5-specific Indic/multilingual-math benchmark was found as of this
search (Sept 2026) — Sonnet 5 is newer than most published Indic
benchmark runs. Treat this as "the Sonnet line has a strong track record
on exactly this failure mode," not "Sonnet 5 specifically has been
measured." Re-check when Sonnet-5-specific numbers exist — this is also
just a restatement of the roadmap's own cross-cutting item ("revisit
model choice periodically as new Indic-benchmark results become
available").

**A separate, real risk this search surfaced: the router, not the
synthesis model.** A Hindi-numeric-reasoning comparison found Claude
Haiku 4.5 at **42.7%** accuracy, behind Gemini 2.5 Flash (58.0%) and
GPT-5 (45.0%). [Source](https://arxiv.org/pdf/2508.19831) (the
"Benchmarking Hindi LLMs" suite). This app's `ROUTER_MODEL` is Haiku
4.5 — and the router doesn't just pick a route, it also extracts slots
(time windows, zones) from the user's *raw input text*. If a user types
their question in Hindi/Hinglish (not just receives Hindi output),
Haiku-tier Hindi comprehension is the weaker link, not Sonnet's Hindi
*generation*. This is a genuinely separate concern from what the roadmap
text focuses on (output quality for "numeric/financial questions") and
is worth testing explicitly.

## Recommendation

1. **Keep `SYNTHESIS_MODEL=claude-sonnet-5`** for Hindi/Hinglish output —
   no swap indicated; the Sonnet line's demonstrated numeric-robustness
   strength is the relevant property here, and downgrading to save cost
   would trade away exactly the property that matters most for a
   zero-hallucination product.
2. **Stage 2F's eval harness should test two things, not one**: (a) does
   the synthesized *answer* preserve numbers/citations correctly in
   Hindi/Hinglish (the roadmap's stated focus), and (b) does the
   *router* correctly classify intent/extract slots when the incoming
   *question itself* is written in Hindi/Hinglish, not just when the
   requested output language is Hindi/Hinglish. These are different
   models (Sonnet 5 vs. Haiku 4.5) and different failure surfaces.
3. **If (b) turns out to be the weak point in eval results**, the
   cheapest fix is not switching `ROUTER_MODEL` globally — it's routing
   through `SQL_MODEL`/a Sonnet-tier model specifically when the
   incoming question is detected as non-English, since that only adds
   cost for the (currently small) non-English-input traffic rather than
   raising the cost of every English request this app serves today.
   This is a candidate, not a decision — it should be validated against
   the eval harness's actual numbers once that exists (Stage 2F), not
   pre-emptively implemented here.

## What this spike did NOT do

No new model was run against RestaurantGPT's own data — this is
third-party published benchmark research, not a first-party eval. The
first-party version of this is exactly Stage 2F's harness, which tests
the app's actual prompts against its actual grounding-verification logic,
not a generic published benchmark. This spike's job was to decide
*whether a model swap is worth investigating before* building that
harness — the answer is no, stay on the current models and let the
harness (which tests something this generic research can't: whether
citation markers and ₹ amounts survive *this app's specific* prompts) be
the actual gate.
