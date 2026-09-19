import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";

function isItemActive(item, pathname) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

// Pure navigation — just the primary links. Brand mark lives in
// Topbar.jsx instead (it needs to stay visible whether this panel is open
// or collapsed — putting it inside a panel that can disappear defeats the
// point of a logo). Identity/utility controls (notifications, account,
// upload) live there too. Desktop collapses this panel to width 0 in
// place (content reflows to fill the freed space); below 760px there's
// no useful width to reflow into, so it becomes an off-canvas overlay
// drawer with a scrim instead — see .app-sidebar's two separate
// media-query blocks in theme.css.
export default function Sidebar({ open }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const navItems = [
    { to: "/dashboard", label: t("nav.dashboard"), icon: "gauge" },
    { to: "/", label: t("nav.chat"), icon: "chat", end: true },
    { to: "/sources", label: t("nav.sources"), icon: "db" },
    { to: "/diagnoses", label: t("nav.diagnoses"), icon: "alert" },
  ];

  return (
    <div className="app-sidebar" data-open={open}>
      <div className="app-sidebar-inner">
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
      </div>
    </div>
  );
}
