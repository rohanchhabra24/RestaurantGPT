import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import DataSourcesPage from "./pages/DataSourcesPage.jsx";
import EvalPage from "./pages/EvalPage.jsx";
import TracesPage from "./pages/TracesPage.jsx";
import DiagnosesPage from "./pages/DiagnosesPage.jsx";
import InsightsPage from "./pages/InsightsPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import { StatsProvider } from "./statsContext.jsx";
import { AuthProvider, useAuth } from "./authContext.jsx";
import { onboardingApi } from "./api.js";

function AuthedApp() {
  return (
    <StatsProvider>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <NavBar />
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/sources" element={<DataSourcesPage />} />
          <Route path="/traces" element={<TracesPage />} />
          <Route path="/diagnoses" element={<DiagnosesPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/eval" element={<EvalPage />} />
        </Routes>
      </div>
    </StatsProvider>
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
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
