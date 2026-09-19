import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import UserMenu from "./UserMenu.jsx";

function isItemActive(item, pathname) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

// Navigation plus the identity chrome that belongs to it: a collapse
// toggle pinned at the top and the account menu pinned at the bottom —
// the same shape most sidebar-first apps use (collapse/expand control up
// top, profile anchored at the very bottom, separated from primary nav so
// the two never compete for attention). Brand mark stays in Topbar.jsx
// (it needs to stay visible regardless of this panel's state, and a logo
// living inside a panel that can disappear defeats the point of a logo).
//
// Desktop collapses this panel to a narrow icon-only rail rather than
// width 0 — the rail keeps its own toggle and the profile avatar reachable
// while collapsed, which a width:0 panel could never do (its toggle would
// vanish along with everything else, with no way back in). Below 760px
// there's no useful width for a rail, so it becomes an off-canvas overlay
// drawer instead — see .app-sidebar's two separate media-query blocks in
// theme.css. Opening it there still uses this same toggle, plus a mirror
// of it in Topbar.jsx (hidden on desktop) since the drawer's own toggle is
// unreachable while off-canvas.
export default function Sidebar({ open, onToggleNav }) {
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
        <div className="app-sidebar-header">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label={open ? "Collapse navigation" : "Expand navigation"}
            title={open ? "Collapse navigation" : "Expand navigation"}
            onClick={onToggleNav}
          >
            <Icon name="panel-left" size={16} />
          </button>
        </div>
        <nav className="app-sidebar-nav" aria-label="Primary">
          {navItems.map((item) => {
            const active = isItemActive(item, pathname);
            return (
              <NavLink key={item.to} to={item.to} end={item.end} aria-current={active ? "page" : undefined} className="app-sidebar-link" title={open ? undefined : item.label}>
                {active && <motion.span className="app-sidebar-active-pill" layoutId="sidebarActivePill" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <Icon name={item.icon} size={15} style={{ position: "relative", zIndex: 1, flex: "none" }} />
                <span className="app-sidebar-link-label" style={{ position: "relative", zIndex: 1 }}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="app-sidebar-footer">
          <UserMenu collapsed={!open} />
        </div>
      </div>
    </div>
  );
}
