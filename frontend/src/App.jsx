import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import DataSourcesPage from "./pages/DataSourcesPage.jsx";
import DiagnosesPage from "./pages/DiagnosesPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import { AuthProvider, useAuth } from "./authContext.jsx";
import { onboardingApi } from "./api.js";
import { isSupabaseConfigured } from "./supabaseClient.js";

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
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/sources" element={<DataSourcesPage />} />
        <Route path="/diagnoses" element={<DiagnosesPage />} />
      </Routes>
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

  if (loading) return <div style={{ height: "100vh" }} />;
  if (!session) return <LoginPage />;
  if (onboarded === null) return <div style={{ height: "100vh" }} />;
  if (!onboarded) return <OnboardingPage onDone={() => setOnboarded(true)} />;
  return <AuthedApp />;
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigErrorScreen />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
