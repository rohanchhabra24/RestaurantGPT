import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { Button } from "../components/ui/button.jsx";
import { Card } from "../components/ui/card.jsx";
import { Badge } from "../components/ui/badge.jsx";
import Icon from "../components/Icon.jsx";
import BookDemoDialog from "../components/BookDemoDialog.jsx";
import ForensicCardStack from "../components/ForensicCardStack.jsx";
import { getTheme, setTheme } from "../theme.js";

// Trial: this page is rebuilt on Tailwind + shadcn-style components
// (src/components/ui/) instead of the hand-rolled theme.css classes the
// rest of the app uses — see tailwind.config.js for how the same color
// tokens get bridged in, and main.jsx/tailwind.config.js for why this is
// safe to load globally without affecting any other page (preflight off).

const INTEGRATIONS = ["Swiggy", "Zomato", "Petpooja", "Dunzo", "Your own POS"];

// The hero mockup's canned Q&A pairs — still purely decorative marketing
// content (no real backend call, same as before), but now picked by the
// visitor via the chips below it instead of only auto-looping through one
// hardcoded example. Each pair mirrors a real, shipped capability (weather
// cross-referencing, compensation drafting, policy citation) rather than
// inventing something the product doesn't actually do.
const DEMO_EXAMPLES = [
  {
    question: "Which Zone 3 cancellations qualify for refunds?",
    answer: "6 orders qualify — ₹2,730 total, delayed past SLA due to rain.",
    citations: ["Order #4021", "Policy §4.2"],
  },
  {
    question: "Why did deliveries slow down this week?",
    answer: "Zone 5 delivery times rose 18% vs. baseline — correlated with rain on 3 of the 5 slowest days.",
    citations: ["Order #3912", "Weather check"],
  },
  {
    question: "Do I owe any compensation right now?",
    answer: "3 claims drafted — ₹960 total, courier no-shows and late restaurant prep.",
    citations: ["Claim #19", "Policy §2.1"],
  },
];

// Deliberately statements, not fabricated outcome numbers — a landing
// page reaches people who haven't logged in and have no restaurant
// context, so there's no real metric to show here. These are promises
// the product can actually keep, not a claim that could be false.
const CAPABILITY_STRIP = [
  "Every answer traces back to an order ID or policy clause — never a guess.",
  "If it can't verify something, it says so — instead of making something up.",
  "Works with Swiggy, Zomato, Petpooja, Dunzo or your own POS — no fixed template.",
];

const FEATURE_GRID = [
  {
    icon: "db",
    title: "Multi-agent order investigation",
    body: "When something looks off, RestaurantGPT doesn't just restate your data — it independently cross-checks historical weather against the exact dates your slowest orders happened on, not just a self-reported flag.",
  },
  {
    icon: "bolt",
    title: "1-click compensation claims",
    body: "Sweep your recent orders against your own policy's thresholds and draft every eligible claim at once, with the clause and order ID behind each one — not a black-box number.",
  },
  {
    icon: "route",
    title: "Live feed + CSV import",
    body: "Pull yesterday's orders automatically from your aggregator's export API every day, or upload a CSV from Swiggy, Zomato, Petpooja, Dunzo or your own POS — same pipeline either way.",
  },
  {
    icon: "file",
    title: "Policy-grounded answers",
    body: "Every answer is checked against your actual uploaded policy documents and cites the specific clause — if it can't verify something, it says so instead of guessing.",
  },
];

// Inline (not a className) so it always wins over the shadcn Card's own
// Tailwind border/background utilities regardless of stylesheet load
// order — see theme.css's --lum-border/--lum-bg comment. The variables
// themselves flip to a flat border in light mode, so this one object
// works correctly in both themes without any conditional logic here.
const LUM_CARD_STYLE = { border: "var(--lum-border)", background: "var(--lum-bg)" };

export default function LandingPage() {
  const navigate = useNavigate();
  const [demoDialog, setDemoDialog] = useState(null); // null | "message" | "call"
  const [activeExample, setActiveExample] = useState(0);
  const [userPicked, setUserPicked] = useState(false);
  const [theme, setThemeState] = useState(getTheme);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  function getStarted() {
    navigate("/login?mode=signup");
  }

  // Auto-rotates through the canned examples so a visitor who never
  // touches the chips still sees the "AI answering different questions"
  // effect the old single-example CSS loop gave — stops the moment
  // someone manually picks one, so a deliberate choice doesn't get
  // yanked away by the timer a few seconds later.
  useEffect(() => {
    if (userPicked) return;
    const id = setInterval(() => setActiveExample((i) => (i + 1) % DEMO_EXAMPLES.length), 4200);
    return () => clearInterval(id);
  }, [userPicked]);

  const demo = DEMO_EXAMPLES[activeExample];

  return (
    <div className="min-h-screen text-foreground font-sans">
      {/* Sticky nav lives outside the overflow-x-hidden content wrapper
          below on purpose — a non-"visible" overflow-x on an ancestor
          computes overflow-y to "auto" too (CSS overflow's same-axis
          promotion rule), which silently breaks position:sticky for any
          descendant, since sticky positions against the nearest scrolling
          ancestor rather than the viewport. Keeping nav a sibling instead
          of a child of that wrapper sidesteps the quirk entirely. */}
      <div className="sticky top-4 z-50 flex justify-center px-5">
        <nav
          className="flex w-full max-w-[1100px] items-center gap-4 rounded-pill px-5 py-2.5"
          style={{
            background: "color-mix(in srgb, var(--color-bg) 72%, transparent)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            border: "1px solid var(--color-divider)",
            boxShadow: "0 10px 34px -12px rgba(0, 0, 0, 0.55)",
          }}
        >
          <span className="mr-auto flex items-center gap-2 font-heading text-lg font-medium">
            <img src="/logo.png" alt="RestaurantGPT" className="h-6 w-auto flex-none object-contain" />
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="flex h-9 w-9 items-center justify-center rounded-pill border border-[var(--color-divider)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:border-[var(--color-neutral-400)] transition-colors cursor-pointer"
            style={{
              background: "color-mix(in srgb, var(--color-surface) 60%, transparent)",
            }}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <Button onClick={getStarted}>Get started</Button>
        </nav>
      </div>

      <div
        className="overflow-x-hidden"
        style={{
          background:
            "radial-gradient(1100px 640px at 84% -140px, color-mix(in srgb, var(--color-accent-900) 70%, transparent), transparent 60%), " +
            "radial-gradient(1000px 700px at -8% 100%, color-mix(in srgb, black 28%, transparent), transparent 55%), var(--color-bg)",
        }}
      >

      <div className="mx-auto max-w-[1200px] px-5 pb-14 sm:px-10 lg:px-[72px]">
        <section
          className="relative grid items-center gap-12 py-12 sm:py-16 [grid-template-columns:repeat(auto-fit,minmax(min(400px,100%),1fr))]"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-20"
            style={{
              background: "radial-gradient(640px circle at 50% 30%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 65%)",
            }}
          />
          <div className="relative flex max-w-[560px] flex-col">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="h-px w-8 flex-none bg-primary" />
              <span className="font-heading text-xs font-semibold uppercase tracking-[.08em] text-primary">
                Operations intelligence for restaurants
              </span>
            </div>
            <h1 className="m-0 font-heading text-[clamp(34px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.015em]">
              <span className="reveal-line"><span style={{ "--delay": "0.05s" }}>Every late order has a reason.</span></span>
              <span className="reveal-line"><span style={{ "--delay": "0.17s" }}>Now you can prove it.</span></span>
            </h1>
            <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
              RestaurantGPT reads your order data and delivery policies together. Ask what happened, and get an answer
              that cites the order ID or policy clause behind it — not a guess.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button onClick={getStarted}>Get started</Button>
              <Button variant="ghost" onClick={() => setDemoDialog("message")}>Book a demo</Button>
            </div>

            <div className="mt-7 flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--color-neutral-500)]">
                Try a sample question
              </span>
              <div className="flex flex-wrap gap-2">
                {DEMO_EXAMPLES.map((ex, i) => (
                  <button
                    key={ex.question}
                    type="button"
                    onClick={() => { setActiveExample(i); setUserPicked(true); }}
                    className="rounded-pill border px-3 py-1.5 text-left text-xs transition-colors"
                    style={{
                      borderColor: i === activeExample ? "var(--color-accent)" : "var(--color-divider)",
                      background: i === activeExample ? "color-mix(in srgb, var(--color-accent) 14%, transparent)" : "transparent",
                      color: i === activeExample ? "var(--color-accent-200)" : "var(--color-neutral-400)",
                    }}
                  >
                    {ex.question}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative w-full min-w-0 sm:min-w-[340px]">
            <ForensicCardStack
              examples={DEMO_EXAMPLES}
              activeIndex={activeExample}
              onSelect={(i) => {
                setActiveExample(i);
                setUserPicked(true);
              }}
            />
          </div>
        </section>

        {/* Capability statements, not outcome numbers — a visitor here
            hasn't logged in and has no restaurant context, so there's no
            real metric to compute yet. These three lines are promises the
            product can actually keep rather than a claim that could be
            false (see CAPABILITY_STRIP's own comment above). */}
        <section className="py-2 pb-9">
          <Card className="flex flex-wrap items-center justify-between gap-7 px-9 py-6" style={LUM_CARD_STYLE}>
            {CAPABILITY_STRIP.map((c) => (
              <div key={c} className="flex max-w-[300px] items-start gap-2.5">
                <Icon name="check" size={15} className="mt-0.5 flex-none" style={{ color: "var(--color-accent-200)" }} />
                <span className="text-sm leading-relaxed">{c}</span>
              </div>
            ))}
          </Card>
        </section>

        <section className="flex flex-col gap-6 py-9">
          <div className="flex items-center gap-2.5">
            <span className="h-px w-8 flex-none bg-primary" />
            <span className="font-heading text-xs font-semibold uppercase tracking-[.08em] text-[var(--color-neutral-500)]">
              What it actually does
            </span>
          </div>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
            {FEATURE_GRID.map((f) => (
              <Card key={f.title} className="flex flex-col gap-2.5 p-5" style={LUM_CARD_STYLE}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--color-accent-800)" }}>
                  <Icon name={f.icon} size={16} style={{ color: "var(--color-accent-200)" }} />
                </span>
                <div className="font-heading text-[14.5px] font-semibold tracking-[-0.015em]">{f.title}</div>
                <p className="m-0 text-[12.5px] leading-relaxed text-muted-foreground">{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-5 py-2 pb-9">
          <div className="flex items-center gap-2.5">
            <span className="h-px w-8 flex-none bg-primary" />
            <span className="font-heading text-xs font-semibold uppercase tracking-[.08em] text-[var(--color-neutral-500)]">
              Import your data from any source
            </span>
          </div>
          <p className="m-0 max-w-[560px] text-sm leading-relaxed text-muted-foreground">
            Every restaurant exports data differently. Upload a CSV from whatever you already
            use — Swiggy, Zomato, Petpooja, Dunzo, or your own POS — and our AI automatically
            matches your columns to a clean, consistent record. No manual reformatting, no
            fixed template to follow.
          </p>
          <div className="flex flex-wrap items-center gap-10">
            {INTEGRATIONS.map((name, i) => (
              <span
                key={name}
                className="font-heading text-xl font-semibold text-[var(--color-neutral-300)] [animation:rgpt-fadeup_.6s_ease-out_both]"
                style={{ animationDelay: `${0.05 + i * 0.07}s` }}
              >
                {name}
              </span>
            ))}
          </div>
        </section>
        <div className="mb-9 h-px bg-border" />

        <section id="get-started" className="flex max-w-[640px] scroll-mt-10 flex-col gap-2.5 pb-2">
          <h2 className="m-0 font-heading text-3xl font-medium tracking-[-0.01em]">
            Stop guessing why orders go wrong.
          </h2>
          <p className="m-0 text-[15.5px] leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
            Connect your order exports and start asking questions today.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setDemoDialog("call")}>
              <Icon name="clock" size={14} />
              Book a call
            </Button>
          </div>
        </section>
      </div>
      </div>

      <BookDemoDialog
        open={demoDialog !== null}
        onOpenChange={(next) => setDemoDialog(next ? (demoDialog ?? "message") : null)}
        defaultTab={demoDialog ?? "message"}
      />
    </div>
  );
}
