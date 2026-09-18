import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import { AuthProvider, useAuth } from "./authContext.jsx";
import { onboardingApi } from "./api.js";
import { isSupabaseConfigured } from "./supabaseClient.js";
import SoundEffects from "./components/SoundEffects.jsx";

// Route-level code splitting — each page ships as its own chunk instead of
// one bundle everyone downloads regardless of which page (or whether
// they're even logged in) they actually land on. An unauthenticated
// visitor never pays for Dashboard/Chat/DataSources/Diagnoses JS at all;
// an authenticated one only pays for whichever single page they open.
const ChatPage = lazy(() => import("./pages/ChatPage.jsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const DataSourcesPage = lazy(() => import("./pages/DataSourcesPage.jsx"));
const DiagnosesPage = lazy(() => import("./pages/DiagnosesPage.jsx"));
const LandingPage = lazy(() => import("./pages/LandingPage.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage.jsx"));

// Same blank-while-resolving look the auth-loading states below already
// use (see Gate) — a lazy chunk on a fast connection resolves in well
// under a frame, so a spinner would just flash rather than help.
const PAGE_FALLBACK = <div style={{ height: "100vh" }} />;

function ConfigErrorScreen() {
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card elev-lg" style={{ maxWidth: 440, padding: 28, gap: 12 }}>
        <div className="card-title" style={{ fontSize: 16 }}>This app isn't configured yet</div>
        <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
          <code className="mono">VITE_SUPABASE_URL</code> and <code className="mono">VITE_SUPABASE_ANON_KEY</code> are
          missing from this deployment's environment. Sign-in can't work until those are set — see{" "}
          <code className="mono">frontend/.env.example</code>.
        </p>
      </div>
    </div>
  );
}

function AuthedApp() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <NavBar />
      <Suspense fallback={PAGE_FALLBACK}>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/sources" element={<DataSourcesPage />} />
          <Route path="/diagnoses" element={<DiagnosesPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function Gate() {
  const { loading, session } = useAuth();
  const [onboarded, setOnboarded] = useState(null); // null = checking

  useEffect(() => {
    if (!session) {
      setOnboarded(null);
      return;
    }
    onboardingApi.me().then((r) => setOnboarded(r.has_restaurant)).catch(() => setOnboarded(false));
  }, [session]);

  if (loading) return PAGE_FALLBACK;
  if (!session) {
    return (
      <Suspense fallback={PAGE_FALLBACK}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    );
  }
  if (onboarded === null) return PAGE_FALLBACK;
  if (!onboarded) return <Suspense fallback={PAGE_FALLBACK}><OnboardingPage onDone={() => setOnboarded(true)} /></Suspense>;
  return <AuthedApp />;
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigErrorScreen />;
  return (
    <AuthProvider>
      <SoundEffects />
      <Gate />
    </AuthProvider>
  );
}
