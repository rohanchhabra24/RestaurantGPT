import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import UserMenu from "./UserMenu.jsx";
import NotificationsMenu from "./NotificationsMenu.jsx";
import UploadDialog from "./UploadDialog.jsx";
import { api } from "../api.js";

function isItemActive(item, pathname) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

// The app's primary nav, as a left-hand panel rather than a top bar — same
// role NavBar used to play, just reoriented. Desktop shows it as a fixed
// static column (see .app-sidebar in theme.css); below 760px it becomes an
// off-canvas drawer that slides in over content, toggled from the slim
// .app-mobile-topbar App.jsx renders in its place there.
export default function Sidebar({ open }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [groundedRate, setGroundedRate] = useState(null);

  const navItems = [
    { to: "/dashboard", label: t("nav.dashboard"), icon: "gauge" },
    { to: "/", label: t("nav.chat"), icon: "chat", end: true },
    { to: "/sources", label: t("nav.sources"), icon: "db" },
    { to: "/diagnoses", label: t("nav.diagnoses"), icon: "alert" },
  ];

  useEffect(() => {
    api.getInsightsSummary().then((d) => setGroundedRate(d.total_queries > 0 ? d.grounded_rate : null)).catch(() => {});
  }, []);

  return (
    <div className="app-sidebar" data-open={open} style={{ borderRight: "1px solid var(--color-divider)", background: "var(--color-surface)", display: "flex", flexDirection: "column", padding: "20px 14px" }}>
      <div style={{ padding: "0 8px", marginBottom: 22 }}>
        <img src="/logo.png" alt="RestaurantGPT" style={{ height: 30, objectFit: "contain", display: "block" }} />
        <div className="app-sidebar-tagline" style={{ marginTop: 6 }}>{t("nav.tagline")}</div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="Primary">
        {navItems.map((item) => {
          const active = isItemActive(item, pathname);
          return (
            <NavLink key={item.to} to={item.to} end={item.end} aria-current={active ? "page" : undefined} className="app-sidebar-link">
              {active && <motion.span className="app-sidebar-active-pill" layoutId="sidebarActivePill" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <Icon name={item.icon} size={15} style={{ position: "relative", zIndex: 1, flex: "none" }} />
              <span style={{ position: "relative", zIndex: 1 }}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="hr" />
        {groundedRate != null && (
          <span className="tag tag-accent mono" style={{ gap: 5, justifyContent: "center" }} title={t("nav.groundedTooltip")}>
            <motion.span
              animate={{ opacity: [1, 0.55, 1], scale: [1, 0.85, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ display: "inline-flex" }}
            >
              <Icon name="check" size={11} />
            </motion.span>
            {t("nav.groundedSuffix", { percent: (groundedRate * 100).toFixed(0) })}
          </span>
        )}
        <button type="button" className="btn btn-primary btn-block" onClick={() => setUploadOpen(true)}>
          <Icon name="upload" size={14} />{t("nav.uploadData")}
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
          <NotificationsMenu />
          <UserMenu />
        </div>
      </div>

      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} />}
    </div>
  );
}
