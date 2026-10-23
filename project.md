# RestaurantGPT — Project & Brand Identity Blueprint

> **One Product. One Mission. Uncompromising Operational Truth.**
>
> *RestaurantGPT is the forensic operations intelligence and claim recovery engine for restaurant operators and cloud kitchens across India (Swiggy, Zomato, Petpooja, and POS systems).*

---

## 1. Executive Summary & Brand Identity

### 1.1 Who We Are
**RestaurantGPT** is not a generic analytics dashboard, nor is it a marketing toy. It is a **specialized AI copilot for restaurant operators, kitchen managers, and franchise owners** designed to stop margin erosion caused by food delivery aggregator penalties, rider delays, cancellations, and unfair SLA breaches.

### 1.2 The Problem We Solve
Indian restaurants and cloud kitchens operate on razor-thin net margins (6%–14%). Every month, **3% to 7% of GMV is silently lost** to:
1. **Unfair Cancellation Deductions**: Orders cancelled due to rider delays or sudden rain showers are routinely charged against the restaurant’s account.
2. **Untracked Rider Delays**: Food is prepared on time by the kitchen, but the delivery partner arrives 25+ minutes late. The food gets cold, the customer complains, and the aggregator penalizes the restaurant.
3. **Unclaimed Weather & SLA Compensation**: Delivery platform policies allow restaurants to claim compensation for rain delays, system outages, and courier no-shows — but cross-referencing 5,000+ CSV orders against dense 40-page legal contracts takes 20+ hours of manual labor per week.

### 1.3 The Core Brand Promise
> **"Every late order has a reason. Now you can prove it."**
>
> 1. **100% Deterministic Grounding**: Every number is backed by an actual SQL query on the order table; every legal statement is backed by an exact section in the aggregator's contract.
> 2. **Refusal to Hallucinate**: If an order cannot be definitively attributed or data is missing, RestaurantGPT explicitly states: *"Insufficient data to prove fault"* rather than inventing an answer.
> 3. **Actionable Financial Recovery**: We don't just show charts — we draft ready-to-file dispute claims with order IDs, timestamps, and contract citations ready for submission to merchant support.
> 4. **Operator-Native Language**: Seamless communication in **English, Hindi (हिंदी), and Hinglish**, mirroring how Indian restaurant managers actually converse on the kitchen floor.

---

## 2. Product Pillars & Anti-Creep Guardrails

To prevent the product from drifting into cosmetic UI gimmicks or aimless dashboard complexity, every engineering and design decision must strictly serve one of our **Four Core Pillars**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RESTAURANTGPT PILLARS                           │
├───────────────────┬───────────────────┬────────────────┬───────────────┤
│ 1. FORENSIC CHAT  │ 2. CLAIM RECOVERY │ 3. HYPERLOCAL  │ 4. MULTI-TENANT│
│    COPILOT        │    ENGINE         │    GROUNDING   │    SECURITY   │
│ Multi-agent order │ 1-click policy    │ Exact Lat/Long │ Hard Postgres │
│ audits & SQL +    │ sweep & dispute   │ weather vs.    │ RLS isolation │
│ policy synthesis  │ claim generator   │ rider delay    │ per brand     │
└───────────────────┴───────────────────┴────────────────┴───────────────┘
```

### Guardrails (What RestaurantGPT is NOT):
- **NOT a generic BI / dashboard tool**: We do not build drag-and-drop widget builders. The dashboard exists solely to highlight operational anomalies and claimable money.
- **NOT a marketing copy generator**: We do not write social media posts, menu descriptions, or customer review spam.
- **NOT an aggregator portal replacement**: We sit on top of exported data (CSV or daily API feed) as an adversarial auditor on behalf of the restaurant.

---

## 3. Core Architecture Overview

### 3.1 Multi-Agent Investigation Pipeline
When an operator asks a question in the chat (e.g., *"Which of yesterday's cancellations in Gurugram Sector 29 qualify for Swiggy refunds?"*), it flows through a sequential, gated multi-agent pipeline:

```
                      [Operator Query in Chat]
                                  │
                                  ▼
                        [1. Intent Classifier]
             Categorizes into: SQL | RETRIEVAL | HYBRID
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
  [2. SQL Agent]                                  [3. Policy Auditor]
  - Schema-constrained                            - Semantic search over
  - Read-only Postgres execution                    uploaded SLAs / PDFs
  - Exact order IDs, prep times,                  - Cites exact clauses (§4.2)
    rider delays, and GMV values                           │
         │                                                 │
         └────────────────────────┬────────────────────────┘
                                  ▼
                     [4. Environmental / Radar]
                     - Open-Meteo historical microclimate
                     - Precipitation & wind speed cross-referencing
                                  │
                                  ▼
                    [5. Verifier & Grounding Gate]
                    - Rejects any fact not present in SQL or SLA
                    - Enforces citation tags: [Order #4021] [Policy §3.1]
                                  │
                                  ▼
                    [6. Synthesis & Dispute Output]
                    - Formats executive summary + 1-click action
```

---

## 4. Current State & Immediate Focus

### Completed:
- Fast multi-tenant database schema with Row Level Security (RLS).
- Ingestion engine supporting Swiggy/Zomato/Petpooja order CSVs and live data feeds.
- Policy ingestion engine chunking PDF/JSON contracts into vector embeddings.
- Responsive Operator Dashboard with Concentric Radar LiveOps strip, order filters, and audit traces.
- Seamless Dark/Light Obsidian styling adhering to professional operator aesthetics.

### Active Shift — Core Focus:
We are deliberately halting cosmetic visual explorations to refocus 100% on **The Core Intelligence Engine**:
1. **Hyperlocal Address-Level Weather Grounding**: Upgrading from general city-level weather to exact delivery drop-off coordinates and kitchen cluster microclimates.
2. **Rider vs. Kitchen Fault Attribution**: Deepening time-delta calculations (KPT - Kitchen Preparation Time vs. Rider Arrival Time vs. Aggregator ETA).
3. **One-Click Dispute Generation from Chat**: Allowing operators to say *"Draft claims for these 7 orders"* and immediately generating formatted PDF/text dispute tickets with evidence.
4. **Conversational Parameters & Operator Controls**: Adding parameters like margin threshold, delivery radius, dispute tolerance, and platform-specific penalty policies into the chat bot's reasoning loop.
