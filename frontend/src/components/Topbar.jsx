import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import UserMenu from "./UserMenu.jsx";
import NotificationsMenu from "./NotificationsMenu.jsx";
import UploadDialog from "./UploadDialog.jsx";
import { api } from "../api.js";

// The app's persistent chrome — identity and utilities (notifications,
// account, upload) that should always be reachable regardless of whether
// the nav sidebar is open or collapsed, plus the toggle that controls it.
// Nav itself (logo, links) lives in Sidebar.jsx; this bar spans full width
// above both the sidebar and the page content.
export default function Topbar({ navOpen, onToggleNav }) {
  const { t } = useTranslation();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [groundedRate, setGroundedRate] = useState(null);

  useEffect(() => {
    api.getInsightsSummary().then((d) => setGroundedRate(d.total_queries > 0 ? d.grounded_rate : null)).catch(() => {});
  }, []);

  return (
    <div className="app-topbar">
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label={navOpen ? "Close menu" : "Open menu"}
        onClick={onToggleNav}
      >
        <Icon name={navOpen ? "x" : "menu"} size={16} />
      </button>

      {/* Plain <img> straight on the bar's own background — no card, pill,
          or button wrapper around it. The PNG itself is fully transparent
          (verified: corner/background alpha is 0), so anything that reads
          as "a background behind the logo" would be a wrapper we added,
          not the asset — so this deliberately has none. */}
      <img src="/logo.png" alt="RestaurantGPT" style={{ height: 24, objectFit: "contain", flex: "none" }} />
      <span className="app-topbar-tagline">{t("nav.tagline")}</span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {groundedRate != null && (
          <span className="tag tag-accent mono app-topbar-grounded-tag" style={{ gap: 5 }} title={t("nav.groundedTooltip")}>
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
        <button type="button" className="btn btn-primary app-topbar-upload-btn" onClick={() => setUploadOpen(true)}>
          <Icon name="upload" size={14} />
          <span className="app-topbar-upload-btn-label">{t("nav.uploadData")}</span>
        </button>
        <NotificationsMenu />
        <UserMenu />
      </div>

      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} />}
    </div>
  );
}
