import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth, SESSION_EXPIRED_KEY } from "../authContext.jsx";

// Google's standard 4-color "G" mark — a brand logo, not a generic UI
// glyph, so it lives here as its own inline SVG rather than joining
// Icon.jsx's single-color stroke-path icon set.
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18A13.97 13.97 0 0 1 10.94 24c0-1.45.25-2.86.7-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle, resetPasswordForEmail } = useAuth();
  const [searchParams] = useSearchParams();
  // Landing page's "Get started" links here with ?mode=signup so the
  // form opens on the right tab instead of making people click twice.
  // "forgot" is a third mode, reachable only from the link below — not a
  // URL param, since there's no case where someone should land on it
  // directly from outside the app the way signup's link does.
  const [mode, setMode] = useState(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [signupMessage, setSignupMessage] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleGoogle() {
    setError(null);
    setGoogleBusy(true);
    const { error } = await signInWithGoogle();
    // Only reached on immediate failure (e.g. Google not yet enabled in
    // Supabase) — a successful call navigates the page away before this
    // line would run, so there's no "success" branch to handle here.
    if (error) {
      setError(error.message || String(error));
      setGoogleBusy(false);
    }
  }

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
      } else if (mode === "signup") {
        const { data, error } = await signUp(email, password);
        if (error) throw error;
        if (!data.session) {
          setSignupMessage("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await resetPasswordForEmail(email);
        if (error) throw error;
        // Always the same message whether or not the address has an
        // account — a different one here would let this form be used to
        // check which emails are registered.
        setResetSent(true);
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

        <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create an account" : "Reset your password"}
        </h2>
        <p className="dim" style={{ margin: "0 0 18px", fontSize: 13 }}>
          {mode === "signin" ? "Welcome back." : mode === "signup" ? "You'll set up your restaurant next." : "We'll email you a link to set a new one."}
        </p>

        {sessionExpired && (
          <div className="tag tag-danger" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px", marginBottom: 10 }}>
            Your session expired — please sign in again.
          </div>
        )}

        {mode === "forgot" && resetSent ? (
          <>
            <div className="tag tag-accent" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px", marginBottom: 10 }}>
              If an account exists for {email}, a reset link is on its way — check your email.
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => { setMode("signin"); setResetSent(false); }}
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            {mode !== "forgot" && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}
                  onClick={handleGoogle}
                  disabled={googleBusy || busy}
                >
                  <GoogleIcon />
                  {googleBusy ? "Redirecting…" : "Continue with Google"}
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 14px", fontSize: 11.5 }} className="dim">
                  <div style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
                  or
                  <div style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
                </div>
              </>
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
              {mode !== "forgot" && (
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
              )}
              {mode === "signin" && (
                <button
                  type="button"
                  style={{ alignSelf: "flex-end", fontSize: 12.5, background: "none", border: "none", padding: 0, color: "var(--color-accent)", cursor: "pointer" }}
                  onClick={() => { setMode("forgot"); setError(null); setSignupMessage(null); }}
                >
                  Forgot password?
                </button>
              )}
              {error && <div className="tag tag-danger" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px" }}>{error}</div>}
              {signupMessage && <div className="tag tag-accent" style={{ whiteSpace: "normal", height: "auto", padding: "6px 10px" }}>{signupMessage}</div>}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? "…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset link"}
              </button>
            </form>

            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: 10 }}
              onClick={() => {
                setMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup");
                setError(null);
              }}
            >
              {mode === "signin" ? "Need an account? Sign up" : mode === "signup" ? "Already have an account? Sign in" : "Back to sign in"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
