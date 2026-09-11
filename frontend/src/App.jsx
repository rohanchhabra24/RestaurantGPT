import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import DataSourcesPage from "./pages/DataSourcesPage.jsx";
import EvalPage from "./pages/EvalPage.jsx";
import { StatsProvider } from "./statsContext.jsx";

export default function App() {
  return (
    <StatsProvider>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <NavBar />
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/sources" element={<DataSourcesPage />} />
          <Route path="/eval" element={<EvalPage />} />
        </Routes>
      </div>
    </StatsProvider>
  );
}
