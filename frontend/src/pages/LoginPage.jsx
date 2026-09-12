import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../authContext.jsx";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [searchParams] = useSearchParams();
  // Landing page's "Get started" links here with ?mode=signup so the
  // form opens on the right tab instead of making people click twice.
  const [mode, setMode] = useState(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [signupMessage, setSignupMessage] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSignupMessage(null);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) throw error;
      } else {
        const { data, error } = await signUp(email, password);
        if (error) throw error;
        if (!data.session) {
          setSignupMessage("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card elev-lg" style={{ width: 360, padding: 28 }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, textDecoration: "none", color: "inherit", width: "fit-content" }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--color-accent-800)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="route" size={14} style={{ color: "var(--color-accent-200)" }} />
          </span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>RestaurantGPT</span>
        </Link>

        <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>{mode === "signin" ? "Sign in" : "Create an account"}</h2>
        <p className="dim" style={{ margin: "0 0 18px", fontSize: 13 }}>
          {mode === "signin" ? "Welcome back." : "You'll set up your restaurant next."}
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="input"
            type="email"
            placeholder="you@restaurant.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
          />
          {error && <div className="tag tag-danger" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px" }}>{error}</div>}
          {signupMessage && <div className="tag tag-accent" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px" }}>{signupMessage}</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: 10 }}
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
