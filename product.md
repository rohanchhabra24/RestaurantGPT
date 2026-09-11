# RestaurantGPT — Product & Systems Architecture

## 0. Document Purpose

This document is the engineering source of truth for RestaurantGPT: what it does, why the architecture is shaped the way it is, and the order in which it gets built. It assumes the reader has read the problem statement (restaurant operators on aggregator platforms losing 30+ minutes per incident to manual CSV/PDF cross-referencing) and is deciding how to build the solution, not whether to.

---

## 1. Core Intent & Scope

### 1.1 Problem Being Solved

Restaurant operators need to answer two structurally different classes of question through one interface:

1. **Quantitative questions** — answerable only by deterministic computation over structured operational data (order logs, delivery timestamps, cancellation records). Example: *"What was my average delivery time in Zone 3 last week?"*
2. **Policy/qualitative questions** — answerable only by retrieving and correctly interpreting unstructured text (SLA contracts, compensation policy JSON, customer reviews). Example: *"Is a weather-delayed order eligible for compensation under the current SLA?"*

Most questions operators actually ask are **compound**: they require both (*"which of yesterday's cancellations are compensation-eligible?"* needs order data AND policy interpretation). A single retrieval-only RAG system hallucinates on the arithmetic; a single Text-to-SQL system can't interpret policy prose. Neither dashboards nor generic LLMs solve the compound case. This is the specific technical gap RestaurantGPT closes.

### 1.2 Non-Goals (Scope Boundaries)

- Not a general-purpose BI tool — no ad-hoc dashboard building.
- Not a policy-authoring tool — it reads and interprets existing policy documents, it does not generate or negotiate them.
- Not a real-time streaming analytics system in v1 — freshness is "as of last ingestion run," not sub-second.
- Not a replacement for the aggregator's own merchant portal — it's a reasoning layer on top of exported/ingested data from that portal.

### 1.3 Non-Functional Goals

| Dimension | Target | Rationale |
|---|---|---|
| **Latency** | P50 < 5s, P95 < 12s end-to-end for a chat query | The value prop is explicitly "30 min → 30 sec"; anything that feels like a dashboard load kills the pitch. |
| **Accuracy / Groundedness** | ≥ 95% of factual claims in an answer must be traceable to a cited source (order ID, doc section) on the golden eval set, gated in CI | This is the product's entire differentiation claim vs. generic LLMs — it must be measured, not asserted. |
| **Security / Multi-tenancy** | Hard tenant isolation at the query-execution layer, not just the application layer | One restaurant's data must be structurally unreachable from another tenant's session, even under a prompt-injection or bug scenario. |
| **Auditability** | Every answer has a persisted, replayable trace (route taken, SQL executed, chunks retrieved, verification result) | Answers can influence real compensation claims — this needs to be defensible after the fact, not just correct in the moment. |
| **Scalability** | Horizontally scalable ingestion and retrieval; stateless query-serving layer | Multi-restaurant SaaS shape from day one, even if v1 runs single-tenant-per-deployment. |
| **Cost** | Sub-$0.02 average cost per query at steady state | Achieved via model cascading (cheap model for routing/extraction, frontier model only for synthesis) and caching, not by cutting the verification step. |

---

## 2. System Architecture

### 2.1 High-Level Shape

```
                                 ┌─────────────────────┐
                                 │   Ingestion Layer    │
                                 │  (batch + on-demand) │
                                 └──────────┬───────────┘
                                            │
                  ┌─────────────────────────┼─────────────────────────┐
                  ▼                         ▼                         ▼
          ┌───────────────┐        ┌───────────────┐         ┌───────────────┐
          │  Structured    │        │  Unstructured  │         │   Reviews      │
          │  ETL → Postgres│        │  Chunk+Embed → │         │  (dual path:   │
          │  (orders, SLAs,│        │  Qdrant + BM25 │         │  structured +  │
          │  deliveries)   │        │  (policy docs) │         │  vector)       │
          └───────┬────────┘        └───────┬────────┘         └───────┬───────┘
                  │                         │                         │
                  └─────────────┬───────────┴─────────────┬───────────┘
                                ▼                         ▼
                        ┌──────────────────────────────────────┐
                        │           Query Serving API            │
                        │  (FastAPI, stateless, tenant-scoped)   │
                        └───────────────┬────────────────────────┘
                                        ▼
                        ┌──────────────────────────────────────┐
                        │            Intent Router               │
                        │  classify → SQL | RETRIEVAL | HYBRID   │
                        │           | CLARIFY                    │
                        └──────┬───────────────────┬─────────────┘
                               ▼                   ▼
                  ┌─────────────────────┐  ┌─────────────────────┐
                  │  Text-to-SQL Engine  │  │  Hybrid Retrieval    │
                  │  (schema-aware, read-│  │  Engine (BM25 +      │
                  │  only, self-correct) │  │  dense + rerank)     │
                  └──────────┬───────────┘  └───────────┬─────────┘
                             └──────────┬─────────────────┘
                                        ▼
                        ┌──────────────────────────────────────┐
                        │      Synthesis + Grounding Layer        │
                        │  generate answer → verify every claim   │
                        │  against source → cite or abstain       │
                        └───────────────┬────────────────────────┘
                                        ▼
                              Cited, verified answer
                                        │
                                        ▼
                        ┌──────────────────────────────────────┐
                        │   Trace Store (audit log, per query)   │
                        └──────────────────────────────────────┘
```

### 2.2 Data Models

All tables carry a `restaurant_id` (tenant key) with a row-level security policy in Postgres — this is the primary tenant-isolation mechanism, enforced at the database layer so an application-level bug or a prompt-injected SQL attempt cannot cross tenants.

**Structured operational schema (Postgres):**

```sql
restaurants(id, name, aggregator_platform, timezone, shares_anonymized_data, created_at)

orders(
  id, restaurant_id, aggregator_order_id, placed_at, zone,
  status, total_amount, prep_time_seconds, delivery_time_seconds,
  is_cancelled, cancellation_reason, is_refunded, refund_amount
)

order_items(id, order_id, item_name, quantity, price)

deliveries(
  id, order_id, courier_assigned_at, picked_up_at, delivered_at,
  distance_km, weather_flag, delay_reason
)

reviews(
  id, restaurant_id, order_id, rating, review_text,
  created_at, sentiment_label   -- derived at ingestion
)

policy_documents(
  id, restaurant_id, source_name, doc_type,     -- 'sla' | 'compensation' | 'other'
  effective_date, expiry_date, version, raw_uri
)

policy_chunks(
  id, policy_document_id, chunk_text, chunk_index,
  section_label, embedding_id       -- FK reference into Qdrant point ID
)

compensation_claims(
  id, restaurant_id, order_id, policy_chunk_id, computed_amount,
  status,             -- 'drafted' | 'submitted' | 'resolved'
  query_trace_id, created_at, resolved_at
)

policy_impact_reports(
  id, restaurant_id, old_policy_document_id, new_policy_document_id,
  window_start, window_end, orders_affected_count, financial_delta,
  created_at
)

conversations(id, restaurant_id, user_id, started_at)

messages(id, conversation_id, role, content, created_at)

query_traces(
  id, message_id, route_taken, generated_sql, sql_result_row_count,
  retrieved_chunk_ids, grounding_verdict, latency_ms_by_stage, created_at
)
```

`compensation_claims` and `policy_impact_reports` back the two capabilities that reuse the core engine's eligibility logic rather than adding new AI infrastructure: a scheduled sweep drafts a `compensation_claims` row whenever a cancelled/delayed order matches a compensation clause (each row carries its `query_trace_id` for auditability), and the same eligibility logic re-run against an old vs. new policy version produces a `policy_impact_reports` row — a quantified diff ("40% fewer delays now qualify, ~₹18,000/month impact") the moment a new SLA document is ingested. A nightly aggregation job also maintains a cross-tenant materialized view (never queried through the tenant-scoped path) over cohort dimensions — `cuisine_type`, `city_zone`, `order_volume_bucket` — sourced only from restaurants with `shares_anonymized_data = true`, powering percentile benchmarking ("your delivery time is in the 30th percentile for your cohort") without weakening row-level tenant isolation elsewhere.

**Vector store (Qdrant):** one collection per document type (`policy_chunks`, `review_chunks`), payload includes `restaurant_id`, `effective_date`, `section_label` for metadata filtering — filtering happens *before* the ANN search, not after, so tenant isolation and date-validity are enforced at the retrieval layer itself.

**BM25 index:** maintained alongside the vector index (either OpenSearch/Elasticsearch, or an in-process `rank_bm25`-style index for v1 scale) over the same chunk text, keyed identically so results can be fused.

### 2.3 API Pattern

**REST, not GraphQL or gRPC.** The access pattern is a synchronous chat turn with a handful of well-defined resources (conversations, messages, traces) — GraphQL's flexible-querying value doesn't apply to a single-client chat UI, and gRPC's value (typed internal service-to-service calls) doesn't apply until there's a second internal service consuming this API. Revisit gRPC if the router/retrieval/synthesis stages are split into independently-scaled services in Phase 4.

```
POST   /v1/conversations                    create a session
POST   /v1/conversations/{id}/messages      submit a query (SSE stream response)
GET    /v1/conversations/{id}/messages      history
GET    /v1/traces/{trace_id}                full audit trace for a given answer
POST   /v1/ingest/orders                    trigger/report structured ingestion
POST   /v1/ingest/documents                 upload + trigger policy doc ingestion
```

- Auth: JWT per restaurant user, `restaurant_id` embedded in the token claim and re-validated against every DB/vector query — never trusted from a request body param.
- Response streaming via Server-Sent Events for the synthesis token stream, so the UI can render progressively rather than waiting the full 5–12s.

### 2.4 Core Workflow — Step-by-Step Business Logic

Walking a compound query end to end: *"Which of yesterday's cancelled orders in Zone 3 are eligible for compensation under our current SLA?"*

1. **Ingress & auth** — API receives the message, resolves `restaurant_id` from the JWT, creates a `messages` row.
2. **Intent routing** — a cascaded small model (see §2.5) classifies the query. This one is `HYBRID`: it needs a data lookup (cancelled orders, Zone 3, yesterday) *and* a policy interpretation (compensation eligibility clause). A fifth class, `BENCHMARK`, is added in Phase 4 once cross-tenant cohort data exists — it routes to the aggregated materialized view described in §2.2 instead of the tenant's own tables.
3. **Slot extraction** — the router also extracts structured filters: `date_range=yesterday`, `zone=Zone 3`, `status=cancelled`. These are passed as typed parameters, not free text, into the SQL generation step — this reduces the SQL model's job to "join and format," which is far less error-prone than free-form NL-to-SQL.
4. **Text-to-SQL generation** — schema-aware prompt (only the `orders`/`deliveries` table schemas relevant to the slots are injected, not the full schema) generates a parameterized, read-only query.
5. **SQL validation** — before execution: AST-parsed to confirm `SELECT`-only, mandatory `WHERE restaurant_id = :tenant_id` injected/verified, row-limit cap enforced, no sub-queries touching unrelated tables. Reject and re-prompt with the validator's error if it fails.
6. **SQL execution** — runs against a read-replica, never the primary write connection.
7. **Retrieval (parallel to steps 4–6)** — the compensation-policy sub-query runs hybrid retrieval: BM25 + dense search over `policy_chunks` filtered to `doc_type='compensation'` and `effective_date <= today <= expiry_date` (so an outdated policy version is structurally excluded, not just deprioritized), fused via reciprocal rank fusion, top candidates reranked with a cross-encoder.
8. **Synthesis** — both result sets (SQL rows + top retrieved chunks) are passed to the synthesis LLM call with an explicit instruction to cite every factual claim to either an order ID or a policy section label, and to state "insufficient data" rather than infer when the two sources don't clearly connect.
9. **Grounding verification** — a post-hoc pass checks the generated answer against its sources: every number/order ID mentioned is checked programmatically against the actual SQL result set (exact match, not LLM re-judgment); every policy claim is checked via an entailment pass against the specific cited chunk. If verification fails, either regenerate once with the failure fed back into the prompt, or fall back to a partial/abstaining answer — never silently ship an unverified claim.
10. **Response + trace** — the verified answer streams to the client; a full `query_traces` row is persisted (route, SQL, chunk IDs, verification verdict, per-stage latency) for audit and for eval-harness regression comparison.

### 2.5 Model Cascading Strategy

| Stage | Model tier | Why |
|---|---|---|
| Intent routing + slot extraction | Small/fast model (or fine-tuned classifier once volume justifies it) | High volume, low complexity, latency-sensitive — this runs on every single query. |
| Text-to-SQL generation | Mid-tier model, schema-scoped prompt | Needs real reasoning but a narrow, well-specified task. |
| Synthesis | Frontier model | This is the user-facing output; correctness and tone matter most here. |
| Grounding verification | Deterministic checks where possible (exact-match on numbers), small model only for the NLI-style textual entailment check | Verification should be as close to deterministic as the claim type allows — don't spend a frontier model verifying itself. |

### 2.6 Guardrails & Security

- **SQL execution sandbox**: read-only DB role, AST allow-list validation, mandatory tenant filter, statement timeout, row cap.
- **Prompt injection defense**: ingested unstructured content (reviews, uploaded policy docs) is *data*, never concatenated as instructions — enforced via structural prompt templates (XML/delimited data blocks) plus a lightweight injection-pattern classifier on ingestion that flags suspicious content for review rather than silently ingesting it.
- **Tenant isolation**: enforced at the database layer (Postgres row-level security) and at the vector-store layer (mandatory metadata filter), not only in application code — defense in depth against a bug in the app layer.
- **PII handling**: customer names/contact info in order/review data are never included in LLM prompts beyond what's needed for the specific cited claim; full PII fields are excluded from the embedding pipeline entirely.

### 2.7 Caching Layer

- **Semantic response cache** (Redis, Phase 4): keyed on `(restaurant_id, normalized_query_embedding)`, invalidated automatically whenever underlying data for that restaurant/date-range is re-ingested — correctness of invalidation matters more than hit rate here, since a stale cached answer about "yesterday's cancellations" is worse than a cache miss.
- **Embedding cache**: unchanged policy chunks are never re-embedded on subsequent ingestion runs (content-hash keyed).

### 2.8 Messaging / Async Ingestion

Ingestion (structured ETL + document chunk/embed) is decoupled from the synchronous query path via a lightweight queue (Redis Streams is sufficient at v1 scale; revisit Kafka only if multi-restaurant ingestion volume demands independent consumer scaling). Query serving never blocks on ingestion — it always reads the latest *committed* ingestion snapshot.

---

## 3. Implementation Roadmap

### Phase 0 — Foundations (pre-MVP)
- Postgres schema + row-level security policies
- Structured ETL for order/delivery CSV ingestion
- Policy document chunking + embedding pipeline into Qdrant, BM25 index
- Bare FastAPI skeleton with auth/tenant scoping

### Phase 1 — MVP: The Core Loop
- Intent router (SQL / RETRIEVAL / HYBRID / CLARIFY)
- Text-to-SQL engine with schema-scoped prompting and SQL validation
- Hybrid retrieval engine (BM25 + dense + RRF fusion + rerank)
- Synthesis with mandatory inline citations
- Minimal chat UI, SSE streaming
- **Exit criterion**: a compound question end-to-end, answered with at least one order-ID and one policy-section citation.

### Phase 2 — Trust Layer (the actual differentiator)
- Grounding verification pass (numeric exact-match + textual entailment check)
- Golden eval dataset (30–50 hand-curated question/expected-source pairs) + scoring harness (faithfulness, citation precision/recall)
- CI gate: block merges that regress the eval score
- Prompt-injection classifier on ingestion path
- Full query trace persistence + a simple trace-inspection view
- **Compensation Recovery Autopilot** — a nightly job re-invokes the Phase 1 SQL + retrieval + grounding pipeline against `orders WHERE is_cancelled OR delivery_time_seconds > sla_threshold`, drafting `compensation_claims` rows with a cited policy clause and computed amount rather than waiting for the operator to ask. This flips the product from pull (answers questions) to push (finds money), and — because every claim carries its `query_trace_id` back to a verified answer — opens a defensible performance-based pricing model (a cut of recovered compensation) that a competitor without the grounding layer can't credibly offer.
- **Policy Change Impact Simulator** — reuses the same eligibility logic: on ingestion of a new `policy_documents` version, a job re-runs it against 30/60/90 days of order history under both the old and new policy and diffs the outcome into a `policy_impact_reports` row (e.g. "40% fewer delays would now qualify — ~₹18,000/month"). Effectively free on top of the Autopilot's logic, and a strong demo/upsell moment since the financial impact is immediate and concrete.
- **Exit criterion**: eval harness runs in CI and reports a faithfulness score; a deliberately adversarial or ambiguous test query correctly triggers an abstention rather than a hallucinated answer; a seeded cancelled order correctly produces a drafted, cited compensation claim.

### Phase 3 — Diagnostic Intelligence (stretch)
- Multi-agent orchestration for multi-hop diagnostic questions (e.g., delivery-time-spike root-causing: order data → weather/staffing signals → policy exceptions, chained rather than single-shot)
- **Anomaly-to-Root-Cause Investigator** — a scheduled worker computes windowed aggregates per `(restaurant_id, zone, metric)` and runs simple change-point detection; a detected deviation enqueues the multi-agent investigator above to chain through zone/staffing/weather/policy signals and writes a fully-cited `diagnosis_cards` row *before* the operator asks. This is what separates the feature from commodity threshold alerting — the citation/grounding infrastructure from Phase 2 is what makes an unprompted, autonomous diagnosis trustworthy enough to push.

### Phase 4 — Scale & Optimize
- Semantic response caching
- Model cascading tuned with a fine-tuned small router model (replacing few-shot LLM routing) once query volume justifies the training cost
- Multi-tenant load testing, read-replica scaling for the SQL engine
- Observability dashboard over `query_traces` (latency breakdown, groundedness trend, route distribution)
- Service split (router / retrieval / synthesis) behind internal gRPC if independent scaling is needed
- **Cross-Restaurant Benchmark Intelligence** — once tenant density exists, the nightly cross-tenant materialized view (§2.2) powers a `BENCHMARK` intent class so an operator can see cohort percentiles ("30th percentile on delivery time for your cuisine/zone"). This is a genuine data-network-effect moat — it compounds with every new restaurant onboarded — and opens a second revenue surface: anonymized aggregate insight sold back to the aggregator platforms themselves. Sequenced last deliberately: it is worthless without real multi-tenant density, so building it before Phase 1–3 land would be premature.

---

## 4. Why This Shape (Summary of Key Decisions)

- **Dual-engine over single-engine RAG**: forced by the problem — arithmetic over structured data and interpretation of policy prose are different computational tasks; conflating them into "stuff everything into a vector store" is exactly the failure mode that makes generic LLMs unreliable here.
- **Grounding + eval as Phase 2, not a stretch goal**: the product's entire pitch is "zero-hallucination." Shipping the core loop without provable groundedness ships an unverified claim, not a differentiated product.
- **Multi-agent orchestration deferred to Phase 3**: genuinely needed for multi-hop diagnostic questions, but the MVP's compound (not multi-hop) questions are answerable by the router + dual engine alone — building orchestration before the spine works is premature complexity.
- **Tenant isolation at the data layer, not just the app layer**: given answers can influence real compensation claims and touch customer PII, isolation needs to hold even under an application bug or injection attempt, not only under correct application code.
- **Proactive capabilities are scheduled re-invocations of the same engine, not new AI stacks**: the Compensation Recovery Autopilot and Policy Change Impact Simulator both reuse the Phase 1–2 SQL/retrieval/grounding pipeline on a timer rather than a chat trigger, and the Benchmark materialized view deliberately never touches the tenant-scoped query path. The architecture was chosen so the highest-leverage, most defensible features fall out of the schema and pipeline already being built for the core loop, instead of requiring a second system.
