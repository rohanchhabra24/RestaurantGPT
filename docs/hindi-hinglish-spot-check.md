# Hindi/Hinglish output spot-check

Manual pre-rollout sanity check of `synthesis.py`'s language steering
(product.md's Hindi/Hinglish-via-prompting phase), per the roadmap's
"spot-check before wider rollout" step.

**Method and its limitation, stated plainly:** this sandbox has no
`ANTHROPIC_API_KEY` for the RestaurantGPT project (it's the user's own
secret, kept out of this environment) and no reachable copy of their
Supabase database, so `run_pipeline()` cannot actually be executed
end-to-end here. What follows instead is a manual walk-through of the
exact system prompt (`synthesis.SYSTEM` + `_LANGUAGE_STEERING["hindi"]` /
`["hinglish"]`) against a realistic sample payload, reasoning through what
`claude-sonnet-5` would produce from it — the same model class doing the
reasoning here. This is a real check of the *prompt design*, not a
substitute for actually running it against the live model once a key is
available; that step still needs doing before this ships to real users
(see below).

## Sample input

Question: *"Which of yesterday's cancellations in Zone 3 are compensation-eligible?"*

```
Order data: aggregator_order_id=4021, zone=Zone 3, platform=swiggy,
status=cancelled, cancellation_reason=weather_delay, total_amount=560,
delivery_time_seconds=4680, sla_target_seconds=2400

Policy text: chunk_id=abc123, section=§4.2 Weather & Force Majeure —
"If a delivery is delayed more than 15 minutes past the SLA target due to
weather, compensation is ₹40 plus 50% of the order value."
```

## English (unchanged baseline)

> Order [ORDER:4021] was cancelled due to a weather delay — it arrived 38
> min past the 40-min SLA target. That's eligible under [POLICY:abc123]:
> ₹40 + 50% of ₹560 = **₹320**.

## Hindi (Devanagari)

> ऑर्डर [ORDER:4021] कल कैंसिल हुआ था — मौसम की वजह से देरी हुई, जो SLA के
> 40 मिनट के तय समय से 38 मिनट ज़्यादा थी। यह [POLICY:abc123] के तहत
> मुआवज़े के लिए योग्य है — कुल राशि ₹40 + ₹560 का 50% = **₹320** बनती है।

## Hinglish (Roman script, code-mixed)

> Order [ORDER:4021] kal cancel hua tha — weather ki wajah se delivery
> mein 38 min ki delay hui, jo SLA ke 40-min target se zyada hai. Ye
> [POLICY:abc123] ke hisaab se compensation ke liye eligible hai — total
> ₹40 + ₹560 ka 50% = **₹320** banta hai.

## Assessment

- **Coherence/tone**: both read as natural, ordinary spoken register — the
  Hindi isn't stiffly formal/textbook, the Hinglish isn't over-anglicized.
  Reasonable for a restaurant owner texting register.
- **Number/citation fidelity**: `[ORDER:4021]`, `[POLICY:abc123]`, `₹560`,
  `₹320`, `38 min`, `40 min` all survive character-for-character in both
  languages, as required — this is the part that actually matters for the
  zero-hallucination claim.
- **Real issue found and fixed**: the first draft of the Hindi steering
  prompt didn't explicitly rule out Devanagari numerals (५६०, ३८ instead
  of 560, 38). A model asked to "write in Hindi" can reasonably interpret
  that as including digits — and a citation's `ref_id` is matched
  byte-for-byte against the SQL data in `grounding.py`, so a Devanagari-
  digit order ID inside a marker would silently fail verification (falls
  back to "ungrounded" — caught, not silently wrong, but a wasted retry
  and a visibly broken-looking answer either way). Added an explicit
  "Arabic/Western digits only" instruction with examples —
  `synthesis.py`'s `_LANGUAGE_STEERING["hindi"]`.

## Still needed before real rollout

1. **Run this against the actual live model** once a real API key is
   available — this write-up is a design review, not a substitute for
   that.
2. **Stage 2F's eval harness** (Hindi/Hinglish test cases with a pass/fail
   threshold) is the actual release gate per the roadmap's own rule —
   this spot-check is a sanity check before investing in that harness,
   not a replacement for it.
