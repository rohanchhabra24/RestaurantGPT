import { useState } from "react";
import { motion } from "framer-motion";
import Icon from "../components/Icon.jsx";
import { onboardingApi } from "../api.js";
import { useAuth } from "../authContext.jsx";

const PLATFORMS = [
  { value: "swiggy", label: "Swiggy", badgeClass: "platform-badge-swiggy" },
  { value: "zomato", label: "Zomato", badgeClass: "platform-badge-zomato" },
  { value: "multi", label: "Both / multiple", badgeClass: "platform-badge-other" },
];

// The live preview on the right — same platform-badge-* classes the
// Dashboard already uses for real order rows, so a restaurant sees its
// own badge exactly as it'll actually appear once it has real orders,
// not a different decorative treatment invented just for this screen.
function PreviewCard({ name, platform }) {
  const selected = PLATFORMS.find((p) => p.value === platform) ?? PLATFORMS[2];
  return (
    <motion.div
      className="card elev-lg"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{ width: 300, maxWidth: "100%", padding: 22, gap: 14 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--color-accent-800)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="route" size={14} style={{ color: "var(--color-accent-200)" }} />
        </span>
        <span className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>Workspace preview</span>
      </div>

      <div>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", wordBreak: "break-word" }}>
          {name.trim() || "Your restaurant"}
        </div>
        <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>Asia/Kolkata · 1 owner</div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className={`platform-badge ${selected.badgeClass}`}>{selected.label}</span>
        <span className="tag tag-outline">Not set up yet</span>
      </div>

      <div className="hr" />

      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }} className="dim">
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="upload" size={13} />Upload your order history next
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="file" size={13} />Add your compensation policy
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="chat" size={13} />Ask RestaurantGPT what's going on
        </div>
      </div>
    </motion.div>
  );
}

export default function OnboardingPage({ onDone }) {
  const { refreshSession, signOut } = useAuth();
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("multi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onboardingApi.createRestaurant(name, platform);
      // The restaurant_id claim is minted by the Postgres hook at
      // token-issuance time — refresh so the next API call carries it.
      await refreshSession();
      onDone();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: 24,
        flexWrap: "wrap",
        background:
          "radial-gradient(1100px 640px at 84% -140px, color-mix(in srgb, var(--color-accent-900) 70%, transparent), transparent 60%), " +
          "radial-gradient(1000px 700px at -8% 100%, var(--color-vignette), transparent 55%), var(--color-bg)",
      }}
    >
      <div className="card elev-lg" style={{ width: 400, maxWidth: "100%", padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--color-accent-800)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="route" size={14} style={{ color: "var(--color-accent-200)" }} />
          </span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>RestaurantGPT</span>
        </div>

        <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Set up your restaurant</h2>
        <p className="dim" style={{ margin: "0 0 18px", fontSize: 13 }}>
          One restaurant per account for now — you can invite staff later.
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="dim" style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Restaurant name
            </label>
            <input className="input" placeholder="e.g. Punjab Da Dhaba" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="dim" style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Which platform(s) do you take orders on?
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`platform-badge ${p.badgeClass} clickable`}
                  style={{
                    cursor: "pointer",
                    border: platform === p.value ? "1.5px solid currentColor" : undefined,
                    padding: "6px 12px",
                    fontSize: 12.5,
                  }}
                  onClick={() => setPlatform(p.value)}
                  aria-pressed={platform === p.value}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="tag tag-danger" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px" }}>{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
            {busy ? "Setting up…" : "Continue"}
          </button>
        </form>

        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={signOut}>
          Sign out
        </button>
      </div>

      {/* Hidden on narrow screens — there's no room for a second panel
          once the form card alone takes the full width, and the preview
          is a nice-to-have, not information the user needs to complete
          onboarding. */}
      <div className="onboarding-preview-panel">
        <PreviewCard name={name} platform={platform} />
      </div>
    </div>
  );
}
