import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import NotificationsMenu from "./NotificationsMenu.jsx";
import UploadDialog from "./UploadDialog.jsx";
import { api } from "../api.js";

// The app's persistent chrome — brand identity plus page-level utilities
// (notifications, upload) that should always be reachable regardless of
// whether the nav sidebar is open, collapsed, or (on mobile) off-canvas.
// The sidebar owns its own collapse/expand toggle and the account menu
// now (Sidebar.jsx) — this bar's left corner is the logo alone, not the
// logo competing with a toggle button for the same spot. The one
// exception is the mobile-only drawer trigger below: below 760px the
// sidebar is fully off-canvas when closed, so its own internal toggle is
// unreachable — something outside the drawer has to be able to open it.
// It's deliberately small and ghost-styled so it still reads as secondary
// to the logo, not a rival to it.
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
        className="btn btn-ghost btn-icon topbar-nav-toggle"
        aria-label={navOpen ? "Close menu" : "Open menu"}
        onClick={onToggleNav}
      >
        <Icon name={navOpen ? "x" : "menu"} size={15} />
      </button>

      {/* Plain <img> straight on the bar's own background — no card, pill,
          or button wrapper around it. The PNG itself is fully transparent
          (verified: corner/background alpha is 0), so anything that reads
          as "a background behind the logo" would be a wrapper we added,
          not the asset — so this deliberately has none. Sized up slightly
          from its old 24px now that it's the corner's only occupant on
          desktop, so it actually reads as the leading element rather than
          competing with (and losing to) a bordered, hover-stated button. */}
      <img src="/logo.png" alt="RestaurantGPT" style={{ height: 26, objectFit: "contain", flex: "none" }} />
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
      </div>

      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} />}
    </div>
  );
}
