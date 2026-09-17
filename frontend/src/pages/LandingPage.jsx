import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button.jsx";
import { Card } from "../components/ui/card.jsx";
import { Badge } from "../components/ui/badge.jsx";
import Icon from "../components/Icon.jsx";
import BookDemoDialog from "../components/BookDemoDialog.jsx";

// Trial: this page is rebuilt on Tailwind + shadcn-style components
// (src/components/ui/) instead of the hand-rolled theme.css classes the
// rest of the app uses — see tailwind.config.js for how the same color
// tokens get bridged in, and main.jsx/tailwind.config.js for why this is
// safe to load globally without affecting any other page (preflight off).

const INTEGRATIONS = ["Swiggy", "Zomato", "Petpooja", "Dunzo", "Your own POS"];

export default function LandingPage() {
  const navigate = useNavigate();
  const [demoDialog, setDemoDialog] = useState(null); // null | "message" | "call"

  function getStarted() {
    navigate("/login?mode=signup");
  }

  return (
    <div
      className="min-h-screen overflow-x-hidden text-foreground font-sans"
      style={{
        background:
          "radial-gradient(1100px 640px at 84% -140px, color-mix(in srgb, var(--color-accent-900) 70%, transparent), transparent 60%), " +
          "radial-gradient(1000px 700px at -8% 100%, color-mix(in srgb, black 28%, transparent), transparent 55%), var(--color-bg)",
      }}
    >
      <nav className="flex items-center gap-4 px-5 py-5 sm:px-10 lg:px-[72px]">
        <span className="mr-auto flex items-center gap-2 font-heading text-lg font-medium">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-accent">
            <Icon name="route" size={14} className="text-accent-foreground" />
          </span>
          RestaurantGPT
        </span>
        <Button onClick={getStarted}>Get started</Button>
      </nav>

      <div className="mx-auto max-w-[1200px] px-5 pb-14 sm:px-10 lg:px-[72px]">
        <section className="grid items-center gap-12 py-12 sm:py-16 [grid-template-columns:repeat(auto-fit,minmax(min(400px,100%),1fr))]">
          <div className="flex max-w-[560px] flex-col">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="h-px w-8 flex-none bg-primary" />
              <span className="font-heading text-xs font-semibold uppercase tracking-[.08em] text-primary">
                Operations intelligence for restaurants
              </span>
            </div>
            <h1 className="m-0 font-heading text-[clamp(34px,4.4vw,54px)] font-medium leading-[1.12] tracking-[-0.015em]">
              <span className="block">Every late order has a reason.</span>
              <span className="block">Now you can prove it.</span>
            </h1>
            <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-[color-mix(in_srgb,var(--color-text)_78%,transparent)]">
              RestaurantGPT reads your order data and delivery policies together. Ask what happened, and get an answer
              that cites the order ID or policy clause behind it — not a guess.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button onClick={getStarted}>Get started</Button>
              <Button variant="ghost" onClick={() => setDemoDialog("message")}>Book a demo</Button>
            </div>
          </div>

          <div className="relative w-full min-w-0 sm:min-w-[340px]">
            <div
              className="pointer-events-none absolute -inset-9 rounded-3xl opacity-55 blur-[28px] [animation:rgpt-glow_6s_ease-in-out_infinite]"
              style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 30%, transparent), transparent 70%)" }}
            />
            <Card className="relative flex flex-col gap-3.5 p-5 pb-6">
              <div className="flex items-center gap-2">
                <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] bg-accent">
                  <Icon name="route" size={11} className="text-accent-foreground" />
                </span>
                <span className="font-heading text-sm font-medium">RestaurantGPT</span>
                <Badge className="ml-auto">
                  <Icon name="check" size={10} className="[animation:rgpt-pulse_2.4s_ease-in-out_infinite]" />
                  Live
                </Badge>
              </div>
              <div className="h-px bg-border" />
              <div className="self-end max-w-[96%] rounded-[12px_12px_2px_12px] bg-[var(--color-neutral-800)] px-3.5 py-2.5 [animation:rgpt-bubble_9s_ease-in-out_infinite]">
                <span className="inline-block overflow-hidden whitespace-nowrap align-bottom text-sm [animation:rgpt-type_9s_steps(47)_infinite]">
                  Which Zone 3 cancellations qualify for refunds?
                </span>
                <span className="ml-0.5 inline-block h-3.5 w-0.5 align-middle bg-foreground [animation:rgpt-caret_.8s_steps(1)_infinite]" />
              </div>
              <Card className="self-start max-w-[96%] p-4 shadow-md [animation:rgpt-answer_9s_ease-in-out_infinite]">
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-[.06em] text-muted-foreground">
                  <Icon name="check" size={11} />Verified
                </div>
                <p className="m-0 mt-1.5 text-[12.5px] text-muted-foreground">
                  6 orders qualify — ₹2,730 total, delayed past SLA due to rain.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="font-mono">Order #4021</Badge>
                  <Badge variant="outline" className="font-mono">Policy §4.2</Badge>
                </div>
              </Card>
            </Card>
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

        <div className="pt-8 text-[12.5px] text-[var(--color-neutral-600)]">
          RestaurantGPT — built on shadcn/ui (trial — the rest of the app uses the hand-rolled theme).
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
