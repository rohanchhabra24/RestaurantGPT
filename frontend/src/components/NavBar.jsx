import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import Icon from "./Icon.jsx";
import UserMenu from "./UserMenu.jsx";
import NotificationsMenu from "./NotificationsMenu.jsx";
import UploadDialog from "./UploadDialog.jsx";
import OrderSearch from "./OrderSearch.jsx";
import { api } from "../api.js";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/", label: "Chat", end: true },
  { to: "/sources", label: "Data Sources" },
  { to: "/diagnoses", label: "Issues" },
];

function isItemActive(item, pathname) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function NavBar() {
  const { pathname } = useLocation();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [groundedRate, setGroundedRate] = useState(null);

  useEffect(() => {
    api.getInsightsSummary().then((d) => setGroundedRate(d.total_queries > 0 ? d.grounded_rate : null)).catch(() => {});
  }, []);

  return (
    <div className="nav" style={{ borderBottom: "1px solid var(--color-divider)", background: "var(--color-surface)", flex: "none" }}>
      <span className="nav-brand" style={{ display: "flex", alignItems: "center", gap: 9, marginRight: 20 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--color-accent-800)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <Icon name="route" size={14} style={{ color: "var(--color-accent-200)" }} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          RestaurantGPT
          <span className="nav-brand-tagline">Your restaurant, answered</span>
        </span>
      </span>

      <nav className="nav-pill" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = isItemActive(item, pathname);
          return (
            <NavLink key={item.to} to={item.to} end={item.end} aria-current={active ? "page" : undefined}>
              {active && <motion.span className="nav-active-pill" layoutId="navActivePill" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <span style={{ position: "relative", zIndex: 1 }}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {groundedRate != null && (
          <span className="tag tag-accent mono nav-grounded-tag" style={{ gap: 5 }} title="Share of answers backed by a real order or policy you can check yourself, last 30 days">
            <motion.span
              animate={{ opacity: [1, 0.55, 1], scale: [1, 0.85, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ display: "inline-flex" }}
            >
              <Icon name="check" size={11} />
            </motion.span>
            {(groundedRate * 100).toFixed(0)}% verified answers
          </span>
        )}
        <OrderSearch />
        <button type="button" className="btn btn-primary nav-upload-btn" onClick={() => setUploadOpen(true)}>
          <Icon name="upload" size={14} />
          <span className="nav-upload-btn-label">Upload data</span>
        </button>
        <NotificationsMenu />
        <UserMenu />
      </div>

      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} />}
    </div>
  );
}
