import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import useClickOutside from "../hooks/useClickOutside.js";
import { api, getAccessToken } from "../api.js";

const PUSH_ENABLED_KEY = "rgpt_push_alerts_enabled";
const NOTIFIED_KEY_PREFIX = "rgpt_push_alert_notified_";

function alreadyNotified(key) {
  try { return sessionStorage.getItem(NOTIFIED_KEY_PREFIX + key) === "1"; } catch { return false; }
}
function markNotified(key) {
  try { sessionStorage.setItem(NOTIFIED_KEY_PREFIX + key, "1"); } catch {}
}

export default function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [newCards, setNewCards] = useState([]);
  const [costAlert, setCostAlert] = useState(null);
  const [ungroundedAlert, setUngroundedAlert] = useState(null);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);

  // Stage 4 of the Dashboard plan: shift the proactive findings this menu
  // already tracks (and the compensation digest / SLA breach count) from
  // "pull" — you have to open this dropdown to see them — to "push": a
  // native desktop notification mid-rush, when the operator isn't looking
  // at the app at all. Opt-in (never auto-prompts for permission; that's
  // a real click on the toggle below, a genuine user gesture) and off by
  // default on a fresh browser.
  const [pushEnabled, setPushEnabled] = useState(() => {
    try {
      return localStorage.getItem(PUSH_ENABLED_KEY) === "1"
        && typeof Notification !== "undefined" && Notification.permission === "granted";
    } catch {
      return false;
    }
  });
  const pushSupported = typeof window !== "undefined" && "Notification" in window && "EventSource" in window;

  useEffect(() => {
    api.listDiagnosisCards("new").then(setNewCards).catch(() => {});
    api.getInsightsSummary().then((d) => {
      setCostAlert(d.cost?.over_threshold ? d.cost : null);
      setUngroundedAlert(d.ungrounded_alert?.over_threshold ? d.ungrounded_alert : null);
    }).catch(() => {});
  }, []);

  async function togglePush() {
    if (pushEnabled) {
      setPushEnabled(false);
      try { localStorage.setItem(PUSH_ENABLED_KEY, "0"); } catch {}
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return;
    setPushEnabled(true);
    try { localStorage.setItem(PUSH_ENABLED_KEY, "1"); } catch {}
  }

  useEffect(() => {
    if (!pushEnabled) return;
    const token = getAccessToken();
    if (!token) return;

    const source = new EventSource(`/api/events/stream?token=${encodeURIComponent(token)}`);

    source.addEventListener("compensation_found", (e) => {
      const data = JSON.parse(e.data);
      const key = `comp_${data.digest_id}`;
      if (alreadyNotified(key)) return;
      markNotified(key);
      new Notification("New compensation found", {
        body: `${data.new_claims_count} new claim${data.new_claims_count === 1 ? "" : "s"} — ₹${Number(data.new_recoverable_amount).toFixed(0)} recoverable.`,
        tag: key,
      });
    });

    source.addEventListener("sla_breach_spike", (e) => {
      const data = JSON.parse(e.data);
      const key = `sla_${new Date().toISOString().slice(0, 10)}`;
      if (alreadyNotified(key)) return;
      markNotified(key);
      new Notification("SLA breaches climbing", {
        body: `${data.breaches_today} breaches today — worth a look before the next rush.`,
        tag: key,
      });
    });

    // EventSource reconnects on its own after a drop; nothing else to do
    // here beyond not letting a transient network blip surface as an error.
    source.onerror = () => {};

    return () => source.close();
  }, [pushEnabled]);

  const hasUnread = newCards.length > 0 || costAlert || ungroundedAlert;

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

            {pushSupported && (
              <div
                className="menu-item"
                style={{ cursor: "default", justifyContent: "space-between" }}
                title="Get a desktop notification for new compensation finds and SLA breach spikes, even when this tab isn't open"
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="bell" size={12} />
                  Desktop alerts
                </span>
                <button
                  type="button"
                  className={`tag clickable ${pushEnabled ? "tag-accent" : "tag-neutral"}`}
                  onClick={togglePush}
                >
                  {pushEnabled ? "On" : "Off"}
                </button>
              </div>
            )}

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

            {ungroundedAlert && (
              <Link to="/diagnoses" className="menu-item" onClick={() => setOpen(false)} style={{ alignItems: "flex-start", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-danger)" }}>
                  <Icon name="alert" size={12} />
                  <strong style={{ fontWeight: 600 }}>Answer confidence dropped</strong>
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  {ungroundedAlert.ungrounded_rate_pct}% of questions in the last {ungroundedAlert.window_hours}h couldn't be
                  confidently answered — see what's missing.
                </div>
              </Link>
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
