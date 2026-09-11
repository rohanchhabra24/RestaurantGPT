import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import Icon from "./Icon.jsx";
import { useStats } from "../statsContext.jsx";
import UploadDialog from "./UploadDialog.jsx";
import { useState } from "react";
import { useAuth } from "../authContext.jsx";

export default function NavBar() {
  const { stats } = useStats();
  const { user, signOut } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="nav" style={{ borderBottom: "1px solid var(--color-divider)", background: "var(--color-surface)", flex: "none" }}>
      <span className="nav-brand" style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 24 }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--color-accent-800)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <Icon name="route" size={13} style={{ color: "var(--color-accent-200)" }} />
        </span>
        RestaurantGPT
      </span>

      <NavLink to="/" end>Chat</NavLink>
      <NavLink to="/sources">Data Sources</NavLink>
      <NavLink to="/diagnoses">Diagnoses</NavLink>
      <NavLink to="/traces">Traces</NavLink>
      <NavLink to="/insights">Insights</NavLink>
      <NavLink to="/eval">Trust &amp; Eval</NavLink>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
        {stats ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="tag tag-accent mono" style={{ gap: 5 }}>
              <motion.span
                animate={{ opacity: [1, 0.55, 1], scale: [1, 0.85, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                style={{ display: "inline-flex" }}
              >
                <Icon name="check" size={11} />
              </motion.span>
              Grounded {(stats.pass_rate * 100).toFixed(1)}%
            </span>
            <span className="tag tag-neutral mono">Coverage {(stats.avg_citation_coverage * 100).toFixed(0)}%</span>
          </div>
        ) : (
          <NavLink to="/eval" className="tag tag-outline" style={{ textDecoration: "none" }}>
            Run eval for live accuracy →
          </NavLink>
        )}
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Notifications">
          <Icon name="bell" size={16} />
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setUploadOpen(true)}>
          <Icon name="upload" size={14} />
          Upload data
        </button>
        <button type="button" className="btn btn-ghost" title={user?.email} onClick={signOut}>
          Sign out
        </button>
      </div>

      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} />}
    </div>
  );
}
