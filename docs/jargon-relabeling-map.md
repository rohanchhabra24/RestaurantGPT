# Jargon relabeling map

Internal/engineering terms and their plain-language replacements in the
user-facing UI. Kept as a reference so new copy stays consistent and this
doesn't quietly regress as features are added — check new UI strings
against this list, and add to it when a new internal term needs a
user-facing label.

Verified clean as of this pass: grepped `frontend/src/pages/*.jsx` and
`frontend/src/components/*.jsx` for SQL, RAG, grounding/grounded,
embedding, retrieval, chunk, intent_router, hybrid, agent — no hits in
rendered JSX text, `title`/`placeholder`/`aria-label` attributes, or
template literals. The only remaining internal names live in code-only
locations (variable/prop names, CSS class names, code comments), which
are fine — this map only covers what a user actually sees or hears.

| Internal term / concept | Where it used to show | Now reads as |
|---|---|---|
| `text_to_sql_agent`, `policy_retrieval_agent`, `intent_router → HYBRID` | Route badge on every AI answer (`AnswerCard.jsx`) | "From your order data" / "From your policy documents" / "From your orders + policy documents" / "Investigated across your data" |
| `grounding_verdict` / "grounded" | Nav badge (`NavBar.jsx`), answer footer (`AnswerCard.jsx`) | "X% verified answers"; "Verified" / "Unverified" tag + "N of M facts double-checked against your actual data" |
| "served from cache" + cache similarity % | Answer badge (`AnswerCard.jsx`) | "Instant answer" (no raw similarity score shown) |
| "citations traced to an order ID or policy section" | Answer footer (`AnswerCard.jsx`) | "facts double-checked against your actual data" |
| "Matches this turn's retrieved data exactly" / "wasn't in the actual result set" | Source drawer (`SourceDrawer.jsx`) | "This matches your actual data exactly" / "This couldn't be confirmed against your data — treat it with caution" |
| "Source inspection" | Source drawer title | "Behind this answer" |
| "Structured" / "Unstructured" / "Postgres" / "pgvector + FTS" | Data flow widget (`DataSourcesPage.jsx`) | "Your orders" / "Your policies", both labeled "Ready to answer questions" |
| "order_exports" (raw table-like name) | Data Sources page | "Uploaded order history" |
| "N chunks indexed" | Data Sources page | "N sections indexed" |
| "Needs review — possible prompt injection" | Data Sources page | "Needs your review — flagged as suspicious" |
| "These chunks were quarantined at ingestion and are excluded from retrieval..." | Data Sources page | "This text was automatically held back when it was uploaded and won't be used to answer questions until you review it..." |
| "Approve — not injection" / "Remove chunk" | Data Sources page buttons | "Approve — this is fine" / "Remove this text" |
| "Run anomaly scan" / "Scanning zones…" | Diagnoses page | "Check for problems" / "Checking your zones…" |
| "Scans every zone for a meaningful delivery-time deviation and... runs the same trend → correlation → policy investigation..." | Diagnoses page subtitle | "Checks every zone for unusual delivery delays and investigates what's causing each one — the digging a manager would do, done automatically." |
| "Diagnoses" (nav label) | Nav | "Issues" |
| "Routing → retrieving → verifying…" | Chat sending indicator | "Checking your orders and policies…" |
| "Grounded ops copilot" (tagline) | Nav brand | "Your restaurant, answered" |
| Raw citation `ref_id`/label with no affordance hint | Inline citation chips, answer "Sources" row | Same specific label kept (needed to tell citations apart), but now carries a `title`/`aria-label` of "Tap to see the order details" / "Tap to see the policy clause"; the section header above the chips reads "Tap to check" instead of "Sources" |
| "-8.5 min" (bare signed delivery-delay number) | Dashboard KPI tile | "8.5 min" + "ahead of target, on average" / "behind target, on average", colored accordingly |
| "Eligible" / raw compensation math with no context | Dashboard status tags | "Compensation owed" |

## Still intentionally technical (not jargon in context)

A few terms stay because they're the restaurant's own real-world
vocabulary, not engineering internals — "SLA", "cancellation reason",
"Zone 3" etc. come from the operator's own policy documents and order
data, so simplifying them would make the app *less* accurate to what the
user already calls these things in their own paperwork.
