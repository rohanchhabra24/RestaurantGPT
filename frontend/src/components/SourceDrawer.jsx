import { motion, AnimatePresence } from "framer-motion";
import Icon from "./Icon.jsx";

function OrderPanel({ d }) {
  const target = d.sla_target_seconds || 2400;
  const actual = d.delivery_time_seconds;
  const overBy = actual ? Math.max(0, actual - target) : null;
  const progressPct = actual ? Math.min(100, (actual / (target * 1.4)) * 100) : 0;

  return (
    <div className="mono" style={{ background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>ORDER #{d.aggregator_order_id}</div>
        <span className="tag tag-neutral">{d.platform}</span>
      </div>
      <div className="dim" style={{ fontSize: 11 }}>{d.zone} · {d.placed_at ? new Date(d.placed_at).toLocaleString() : "—"}</div>
      <div className="hr" />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span>Status</span><span>{d.status}</span>
      </div>
      {d.cancellation_reason && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>Reason</span><span>{d.cancellation_reason}</span>
        </div>
      )}
      {d.total_amount != null && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>Order value</span><span>₹{d.total_amount}</span>
        </div>
      )}
      <div className="hr" />
      {actual != null ? (
        <>
          <div style={{ position: "relative", height: 30, margin: "4px 0 0" }}>
            <div style={{ position: "absolute", left: 6, right: 6, top: 4, height: 2, background: "var(--color-divider)" }} />
            <motion.div
              initial={{ left: "8%" }}
              animate={{ left: `${Math.min(80, progressPct)}%` }}
              transition={{ duration: 1.1, ease: "easeOut" }}
              style={{ position: "absolute", top: -7, color: overBy ? "var(--color-danger)" : "var(--color-accent)" }}
            >
              <Icon name="scooter" size={16} />
            </motion.div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }} className="dim">
            <span>SLA target {(target / 60).toFixed(0)}m</span>
            <span>Actual {(actual / 60).toFixed(0)}m</span>
          </div>
        </>
      ) : (
        <div className="dim" style={{ fontSize: 12 }}>No delivery timing recorded — cancelled before dispatch.</div>
      )}
      {d.weather_flag && (
        <>
          <div className="hr" />
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <Icon name="rain" size={14} style={{ color: "var(--color-accent)" }} />
            Weather flagged{overBy ? ` — ${Math.round(overBy / 60)} min over SLA` : ""}
          </div>
        </>
      )}
    </div>
  );
}

function WeatherPanel({ d }) {
  return (
    <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="rain" size={16} style={{ color: d.is_rainy ? "var(--color-accent)" : "var(--color-neutral-400)" }} />
        <div style={{ fontSize: 15, fontWeight: 600, textTransform: "capitalize" }}>{d.condition}</div>
      </div>
      <div className="dim mono" style={{ fontSize: 11 }}>{d.date}</div>
      <div className="hr" />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span>Rain that day</span><span>{d.is_rainy ? "Yes" : "No"}</span>
      </div>
      {d.precipitation_mm != null && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span>Precipitation</span><span>{d.precipitation_mm} mm</span>
        </div>
      )}
      <div className="dim" style={{ fontSize: 11, lineHeight: 1.5, marginTop: 2 }}>
        Independently checked from historical weather records for your restaurant's location —
        not the same as an order's own self-reported weather flag.
      </div>
    </div>
  );
}

function PolicyPanel({ d }) {
  return (
    <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{d.section_label}</div>
      <div className="dim mono" style={{ fontSize: 11 }}>{d.source_name}</div>
      <div className="hr" />
      <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{d.chunk_text}</p>
    </div>
  );
}

export default function SourceDrawer({ citation, onClose }) {
  return (
    <AnimatePresence>
      {citation && (
        <div className="dialog-backdrop" style={{ justifyContent: "flex-end", padding: 0 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            style={{ width: "min(400px, 100vw)", height: "100%", background: "var(--color-surface)", boxShadow: "var(--shadow-lg)", borderLeft: "1px solid var(--color-divider)", padding: 22, display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }} className="dim">Behind this answer</div>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
                <Icon name="x" size={14} />
              </button>
            </div>

            {citation.detail ? (
              citation.type === "order" ? <OrderPanel d={citation.detail} />
              : citation.type === "weather" ? <WeatherPanel d={citation.detail} />
              : <PolicyPanel d={citation.detail} />
            ) : (
              <div className="dim" style={{ fontSize: 13 }}>No detail available for this citation.</div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {citation.verified ? (
                <span className="tag tag-accent" style={{ gap: 5 }}><Icon name="check" size={11} />Verified</span>
              ) : (
                <span className="tag tag-danger" style={{ gap: 5 }}><Icon name="x" size={11} />Could not verify</span>
              )}
              <span className="dim" style={{ fontSize: 12 }}>
                {citation.verified ? "This matches your actual data exactly" : "This couldn't be confirmed against your data — treat it with caution"}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
