import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon.jsx";

const INTEGRATIONS = ["Swiggy", "Zomato", "Petpooja", "Dunzo"];

export default function LandingPage() {
  const navigate = useNavigate();

  function getStarted() {
    navigate("/login?mode=signup");
  }

  function scrollToCta() {
    document.getElementById("get-started")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1100px 640px at 84% -140px, color-mix(in srgb, var(--color-accent-900) 70%, transparent), transparent 60%), " +
          "radial-gradient(1000px 700px at -8% 100%, color-mix(in srgb, black 28%, transparent), transparent 55%), var(--color-bg)",
        color: "var(--color-text)",
        fontFamily: "var(--font-body)",
      }}
    >
      <nav style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px clamp(20px, 5vw, 72px)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, marginRight: "auto", font: "500 18px var(--font-heading)" }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--color-accent-800)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <Icon name="route" size={14} style={{ color: "var(--color-accent-200)" }} />
          </span>
          RestaurantGPT
        </span>
        <button type="button" className="btn btn-primary" onClick={getStarted}>Get started</button>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(20px, 5vw, 72px) 56px" }}>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 52, alignItems: "center", padding: "48px 0 60px" }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 560 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <span style={{ width: 32, height: 1, background: "var(--color-accent)", flex: "none" }} />
              <span style={{ font: "600 12px var(--font-heading)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                Operations intelligence for restaurants
              </span>
            </div>
            <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: "clamp(34px, 4.4vw, 54px)", lineHeight: 1.12, letterSpacing: "-0.015em", margin: 0 }}>
              <span style={{ display: "block" }}>Every late order has a reason.</span>
              <span style={{ display: "block" }}>Now you can prove it.</span>
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: "20px 0 0", maxWidth: "52ch" }}>
              RestaurantGPT reads your order data and delivery policies together. Ask what happened, and get an answer
              that cites the order ID or policy clause behind it — not a guess.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
              <button type="button" className="btn btn-primary" onClick={getStarted}>Get started</button>
              <button type="button" className="btn btn-ghost" onClick={scrollToCta}>Book a demo</button>
            </div>
          </div>

          <div style={{ position: "relative", minWidth: 340 }}>
            <div
              style={{
                position: "absolute", inset: -36, borderRadius: 24,
                background: "radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 30%, transparent), transparent 70%)",
                filter: "blur(28px)", opacity: 0.55, animation: "rgpt-glow 6s ease-in-out infinite", pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative", background: "var(--color-surface)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: "20px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, background: "var(--color-accent-800)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <Icon name="route" size={11} style={{ color: "var(--color-accent-200)" }} />
                </span>
                <span style={{ font: "500 13px var(--font-heading)" }}>RestaurantGPT</span>
                <span className="tag tag-accent" style={{ gap: 5, marginLeft: "auto" }}>
                  <Icon name="check" size={10} style={{ animation: "rgpt-pulse 2.4s ease-in-out infinite" }} />
                  Live
                </span>
              </div>
              <div className="hr" style={{ margin: 0 }} />
              <div style={{ alignSelf: "flex-end", maxWidth: "96%", background: "var(--color-neutral-800)", borderRadius: "12px 12px 2px 12px", padding: "10px 14px", animation: "rgpt-bubble 9s ease-in-out infinite" }}>
                <span style={{ display: "inline-block", overflow: "hidden", whiteSpace: "nowrap", verticalAlign: "bottom", fontSize: 14, animation: "rgpt-type 9s steps(47) infinite" }}>
                  Which Zone 3 cancellations qualify for refunds?
                </span>
                <span style={{ display: "inline-block", width: 2, height: 14, background: "var(--color-text)", marginLeft: 2, verticalAlign: "middle", animation: "rgpt-caret .8s steps(1) infinite" }} />
              </div>
              <div className="card elev-sm" style={{ alignSelf: "flex-start", maxWidth: "96%", animation: "rgpt-answer 9s ease-in-out infinite" }}>
                <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="check" size={11} />Verified
                </div>
                <p className="card-body" style={{ margin: 0 }}>6 orders qualify — ₹2,730 total, delayed past SLA due to rain.</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                  <span className="tag tag-neutral mono">Order #4021</span>
                  <span className="tag tag-neutral mono">Policy §4.2</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 20, padding: "8px 0 36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 32, height: 1, background: "var(--color-accent)", flex: "none" }} />
            <span style={{ font: "600 12px var(--font-heading)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>
              Plugs into what you already run
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "center" }}>
            {INTEGRATIONS.map((name, i) => (
              <span
                key={name}
                style={{
                  font: "600 20px var(--font-heading)", color: "var(--color-neutral-300)",
                  animation: "rgpt-fadeup .6s ease-out both", animationDelay: `${0.05 + i * 0.07}s`,
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </section>
        <div className="hr" style={{ margin: "0 0 36px" }} />

        <section id="get-started" style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 640, paddingBottom: 8, scrollMarginTop: 40 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 30, letterSpacing: "-0.01em", margin: 0 }}>
            Stop guessing why orders go wrong.
          </h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: 0 }}>
            Connect your order exports and start asking questions today.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={getStarted}>Get started</button>
          </div>
        </section>

        <div style={{ padding: "32px 0 0", fontSize: 12.5, color: "var(--color-neutral-600)" }}>
          RestaurantGPT — built on the Nocturne design system.
        </div>
      </div>
    </div>
  );
}
