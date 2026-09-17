# RestaurantGPT — Launch Video Brief

**Length:** ~45 seconds
**Tone:** Confident, calm, product-demo. Not hype-y — the product's whole pitch is
"we don't guess," so the video shouldn't either.
**Music:** Minimal, modern, slight tension release at the "Verified" beat (0:24).

---

## Voiceover Script

| Time | VO | On-screen |
|---|---|---|
| 0:00–0:04 | "Every late order has a reason." | Black screen, text fades in line by line |
| 0:04–0:07 | "Now you can prove it." | Same, second line |
| 0:07–0:13 | "RestaurantGPT reads your order data and your delivery policies — together." | Cut to app: chat screen, typing animation |
| 0:13–0:20 | "Ask what happened. Get an answer that cites the order ID or policy clause behind it — not a guess." | Zoom into the answer: "6 orders qualify — ₹2,730 total, delayed past SLA due to rain." with citation chips `Order #4021` `Policy §4.2` |
| 0:20–0:24 | "Every claim, checked against your real data before you see it." | "Verified" badge pulses green; quick citation-tap interaction |
| 0:24–0:30 | "Upload from Swiggy, Zomato, Petpooja, Dunzo — or your own POS. No template, no manual cleanup." | Fast cuts: CSV upload → auto column-mapping UI → confirm |
| 0:30–0:36 | "See revenue, order trends, and compensation claims — all in one dashboard." | Dashboard page pan: KPI tiles, revenue chart, claims list |
| 0:36–0:41 | "When something looks wrong, it investigates — and tells you what it found." | Diagnoses page: investigation steps appearing one by one |
| 0:41–0:45 | "RestaurantGPT. Answers you can check." | Logo lockup on brand gradient background, "Get started" button |

---

## Shot List (for Hyperframes / brag to compose)

1. **Cold open** — pure typographic, two-line hook, black background, brand accent color on second line.
2. **Chat demo** — recreate the landing page's animated chat bubble: user question typing in, AI answer revealing with citation badges. This exact interaction already exists in `LandingPage.jsx` (the `.rgpt-type` / `.rgpt-answer` CSS animations) — reuse it as a screen capture rather than re-animating from scratch.
3. **Citation zoom** — macro shot on the "Verified" tag + citation chips (`AnswerCard.jsx` grounding-verdict badge).
4. **Upload flow** — CSV drag-in → column auto-mapping review step (`UploadDialog.jsx`) → confirm.
5. **Dashboard sweep** — KPI tiles, revenue/orders chart with time-range filter, compensation claims list.
6. **Diagnoses reveal** — investigation steps appearing in sequence (multi-agent investigator output), ending on a root-cause answer.
7. **Outro** — RestaurantGPT wordmark + route icon, tagline, CTA button matching the real landing page's `Get started` button styling.

## Promotional Copy (short forms for description / captions)

- **One-liner:** "RestaurantGPT answers your restaurant's toughest ops questions — and shows its work."
- **Tagline:** "Every late order has a reason. Now you can prove it."
- **Elevator pitch:** "RestaurantGPT is an AI assistant for restaurant owners on Swiggy, Zomato, and beyond. It reads your order data and delivery policies together, and every answer cites the exact order or policy clause behind it — so you never have to take an AI's word for it."
- **Feature bullets:**
  - Ask questions in plain English (or Hindi/Hinglish) about orders, refunds, and SLAs
  - Every claim verified against your real data before it's shown — abstains rather than guessing
  - Upload from any platform — AI auto-matches your columns, no fixed template
  - Automatic anomaly investigation with a visible reasoning trail
  - Compensation claim tracking built in

## Notes for whoever runs `/brag`

- Point it at the repo root so it can read `README.md`, `product.md`, and the frontend for real screenshots — the demo data in `backend/seed/seed.py` gives it realistic numbers to show (₹ amounts, order IDs, SLA breaches) instead of placeholder Lorem Ipsum.
- If it asks for a tone flag: `--tone "calm, evidence-first product demo — not hypey"` matches the brand voice best (the landing page explicitly avoids overclaiming).
- Brand color: the accent gradient used on the landing hero (`--color-accent-900` radial gradient) — pull from `theme.css` if it wants exact hex values.
