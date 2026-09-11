# RestaurantGPT

A dual-engine operator assistant: Text-to-SQL for structured order data,
hybrid retrieval (pgvector + Postgres full-text search) for policy
documents, and a grounding/eval layer that makes the "zero-hallucination"
claim checkable instead of asserted. See `product.md` for the full
architecture writeup.

```
backend/   FastAPI + Supabase (Postgres/pgvector) + Anthropic Claude
frontend/  React + Vite
```

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `backend/migrations/001_init.sql`.
3. Grab your project's connection string (Settings → Database) and
   service-role key (Settings → API).

## 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in SUPABASE_DB_URL and ANTHROPIC_API_KEY
```

Seed demo data (a relative-dated order set matching the UI's example
scenario, plus the SLA policy document):

```bash
python -m seed.seed
```

Run the API:

```bash
uvicorn app.main:app --reload --port 8000
```

The first request that touches retrieval or ingestion downloads the local
embedding model (`all-MiniLM-L6-v2`, ~90MB) — this happens once.

### Run the eval harness standalone (CI-gate usage)

```bash
python -m eval.run_eval
```

Exits non-zero if the golden-set pass rate drops below 85%.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `localhost:8000`.

## 4. Demo path

1. **Chat** — click one of the example prompts (or ask the compound
   question: *"Which of yesterday's cancellations in Zone 3 are
   compensation-eligible?"*). Click any citation chip to open the source
   drawer and verify it against the underlying order or policy text.
2. **Data Sources** — see what's actually indexed; upload a CSV or policy
   doc to watch it get chunked and embedded live.
3. **Trust & Eval** — run the golden-set eval to get a live grounding
   score, then run the naive-vs-grounded comparison on the same question
   to see the actual contrast between an ungrounded single-shot answer and
   the verified pipeline.

## Notes on scope

This build intentionally does not include: a scheduled compensation-claim
worker (the sweep endpoint demonstrates the mechanism on demand instead),
cross-encoder reranking, multi-agent multi-hop diagnosis, or cross-tenant
benchmarking — all are documented in `product.md`'s later roadmap phases
and were deliberately deferred rather than half-built.
