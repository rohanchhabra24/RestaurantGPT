import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth, SESSION_EXPIRED_KEY } from "../authContext.jsx";

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
  const [sessionExpired, setSessionExpired] = useState(false);

  // Set by api.js's unauthorized handler (authContext.jsx) right before
  // forcing a sign-out on a 401 — read once and cleared immediately so it
  // doesn't reappear on a later, unrelated visit to this page. This has
  // to be an effect, not a lazy useState initializer: React 18
  // StrictMode double-invokes initializers in dev to catch exactly this
  // kind of impurity, and a side effect (clearing sessionStorage) inside
  // one meant the second invocation read it as already-cleared and the
  // banner silently never showed.
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_EXPIRED_KEY) === "1") {
      sessionStorage.removeItem(SESSION_EXPIRED_KEY);
      setSessionExpired(true);
    }
  }, []);

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
        <Link to="/" style={{ display: "flex", alignItems: "center", marginBottom: 20, width: "fit-content" }}>
          <img src="/logo.png" alt="RestaurantGPT" style={{ height: 22, objectFit: "contain" }} />
        </Link>

        <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>{mode === "signin" ? "Sign in" : "Create an account"}</h2>
        <p className="dim" style={{ margin: "0 0 18px", fontSize: 13 }}>
          {mode === "signin" ? "Welcome back." : "You'll set up your restaurant next."}
        </p>

        {sessionExpired && (
          <div className="tag tag-danger" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px", marginBottom: 10 }}>
            Your session expired — please sign in again.
          </div>
        )}

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
