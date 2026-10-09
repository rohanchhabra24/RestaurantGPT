import { useState } from "react";
import { useAuth } from "../authContext.jsx";

// Shown by App.jsx's Gate whenever passwordRecovery is true — i.e. the
// current session came from clicking a password-reset email link, not a
// normal sign-in. See authContext.jsx's passwordRecovery comment for why
// that has to be tracked and intercepted before the usual session/
// onboarding routing runs.
export default function ResetPasswordPage() {
  const { updatePassword, clearPasswordRecovery, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error } = await updatePassword(password);
      if (error) throw error;
      setDone(true);
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
        padding: 24,
        background:
          "radial-gradient(1100px 640px at 84% -140px, color-mix(in srgb, var(--color-accent-900) 70%, transparent), transparent 60%), " +
          "radial-gradient(1000px 700px at -8% 100%, var(--color-vignette), transparent 55%), var(--color-bg)",
      }}
    >
      <div className="card elev-lg" style={{ width: 360, maxWidth: "100%", padding: 28 }}>
        <img src="/logo.png" alt="RestaurantGPT" style={{ height: 22, objectFit: "contain", marginBottom: 20 }} />

        {done ? (
          <>
            <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Password updated</h2>
            <p className="dim" style={{ margin: "0 0 18px", fontSize: 13 }}>
              You're all set — continue into your account.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={clearPasswordRecovery}>
              Continue
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Set a new password</h2>
            <p className="dim" style={{ margin: "0 0 18px", fontSize: 13 }}>
              Choose a new password for your account.
            </p>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                className="input"
                type="password"
                placeholder="New password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                autoFocus
              />
              <input
                className="input"
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
              {error && <div className="tag tag-danger" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px" }}>{error}</div>}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? "…" : "Set new password"}
              </button>
            </form>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: 10 }}
              onClick={() => { clearPasswordRecovery(); signOut(); }}
            >
              Cancel and sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
