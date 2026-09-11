import { useState } from "react";
import Icon from "../components/Icon.jsx";
import { onboardingApi } from "../api.js";
import { useAuth } from "../authContext.jsx";

export default function OnboardingPage({ onDone }) {
  const { refreshSession, signOut } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onboardingApi.createRestaurant(name);
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
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card elev-lg" style={{ width: 400, padding: 28 }}>
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

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input className="input" placeholder="Restaurant name" value={name} onChange={(e) => setName(e.target.value)} required />
          {error && <div className="tag tag-danger" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px" }}>{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
            {busy ? "Setting up…" : "Continue"}
          </button>
        </form>

        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
