import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import useClickOutside from "../hooks/useClickOutside.js";
import { api } from "../api.js";

export default function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [newCards, setNewCards] = useState([]);
  const [costAlert, setCostAlert] = useState(null);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);

  useEffect(() => {
    api.listDiagnosisCards("new").then(setNewCards).catch(() => {});
    api.getInsightsSummary().then((d) => setCostAlert(d.cost?.over_threshold ? d.cost : null)).catch(() => {});
  }, []);

  const hasUnread = newCards.length > 0 || costAlert;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Notifications" onClick={() => setOpen((v) => !v)}>
        <Icon name="bell" size={16} />
        {hasUnread && <span className="badge-dot" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="menu-popover"
            style={{ minWidth: 300 }}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
          >
            <div className="menu-popover-header">Notifications</div>

            {costAlert && (
              <div className="menu-item" style={{ cursor: "default", alignItems: "flex-start", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-danger)" }}>
                  <Icon name="bolt" size={12} />
                  <strong style={{ fontWeight: 600 }}>Cost alert</strong>
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  Month-to-date spend ${costAlert.month_to_date_usd.toFixed(2)}, over your ${costAlert.threshold_usd.toFixed(0)} threshold.
                </div>
              </div>
            )}

            {newCards.slice(0, 5).map((c) => (
              <Link key={c.id} to="/diagnoses" className="menu-item" onClick={() => setOpen(false)} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <div>{c.zone}: avg delivery time {c.delta_pct >= 0 ? "+" : ""}{c.delta_pct}%</div>
                <div className="dim" style={{ fontSize: 11.5 }}>{c.likely_driver || "no dominant cause"}</div>
              </Link>
            ))}

            {!hasUnread && <div className="menu-empty">Nothing new — you're all caught up.</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
