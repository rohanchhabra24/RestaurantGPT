import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import NotificationsMenu from "./NotificationsMenu.jsx";
import UploadDialog from "./UploadDialog.jsx";
import CommandPalette from "./CommandPalette.jsx";
import { api } from "../api.js";

export default function Topbar({ navOpen, onToggleNav }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [groundedRate, setGroundedRate] = useState(null);
  const [digest, setDigest] = useState(null);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    api.getInsightsSummary().then((d) => setGroundedRate(d.total_queries > 0 ? d.grounded_rate : null)).catch(() => {});
  }, []);

  useEffect(() => {
    api.getCompensationDigest().then(setDigest).catch(() => {});
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

      <img src="/logo.png" alt="RestaurantGPT" style={{ height: 26, objectFit: "contain", flex: "none" }} />
      <span className="app-topbar-tagline">{t("nav.tagline")}</span>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {/* Command palette search trigger */}
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="btn btn-secondary"
          style={{
            padding: "5px 12px",
            fontSize: 12.5,
            gap: 8,
            color: "var(--color-text-dim)",
            borderRadius: "var(--radius-pill)",
          }}
          title="Open command palette (⌘K)"
        >
          <Icon name="search" size={13} />
          <span className="app-topbar-search-label" style={{ display: "inline" }}>Search...</span>
          <kbd style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(255, 255, 255, 0.08)", border: "1px solid var(--color-divider)", fontFamily: "var(--font-mono)" }}>⌘K</kbd>
        </button>

        {digest && digest.new_claims_count > 0 && (
          <button
            type="button"
            className="tag tag-danger mono app-topbar-digest-badge"
            style={{ gap: 5, cursor: "pointer", border: "none" }}
            onClick={() => navigate("/dashboard?reviewDigest=1")}
            title="New compensation found today — click to review"
          >
            <motion.span
              animate={{ opacity: [1, 0.55, 1], scale: [1, 0.85, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              style={{ display: "inline-flex" }}
            >
              <Icon name="bell" size={11} />
            </motion.span>
            ₹{Number(digest.new_recoverable_amount).toFixed(0)} owed
          </button>
        )}
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
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} onOpenUpload={() => setUploadOpen(true)} />
    </div>
  );
}
