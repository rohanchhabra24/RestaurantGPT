import { createContext, useContext, useState } from "react";

// Shared across the whole app so a golden-set run on the Eval page shows up
// as live header badges everywhere else too — the point is that grounding
// isn't a page you visit once, it's a number the whole app stands behind.
const StatsContext = createContext(null);

export function StatsProvider({ children }) {
  const [stats, setStats] = useState(null);
  return <StatsContext.Provider value={{ stats, setStats }}>{children}</StatsContext.Provider>;
}

export function useStats() {
  return useContext(StatsContext);
}
