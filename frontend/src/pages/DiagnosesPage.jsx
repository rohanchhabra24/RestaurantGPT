import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../components/Icon.jsx";
import SourceDrawer from "../components/SourceDrawer.jsx";
import { api } from "../api.js";

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "just now";
}

// Surfaces the questions RestaurantGPT couldn't confidently answer — the
// gap between what owners ask and what the uploaded policy/order data
// actually covers. Every one of these is a real ungrounded query, grouped
// by near-identical phrasing (see insights.py's cluster_gaps) — not a
// suggestion the model invented.
function KnowledgeGapsPanel({ gaps, onAddContent }) {
  if (!gaps || gaps.gaps.length === 0) return null;
  return (
    <div className="card elev-sm" style={{ padding: 18, gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="card-title" style={{ flex: 1 }}>Questions I couldn't confidently answer</div>
        <span className="dim" style={{ fontSize: 11.5 }}>
          {gaps.ungrounded_count} of {gaps.total_queries} questions in the last {gaps.window_days} days
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {gaps.gaps.map((g, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
              borderRadius: 8, background: "var(--color-surface-raised)",
            }}
          >
            <span className="tag tag-outline mono" style={{ flex: "none" }}>
              ×{g.occurrences}
            </span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              {g.example_question}
              <div className="dim" style={{ fontSize: 11 }}>Last asked {timeAgo(g.last_seen)}</div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-ghost" style={{ fontSize: 12, alignSelf: "flex-start" }} onClick={onAddContent}>
        Add missing policy or menu info
      </button>
    </div>
  );
}

function DiagnosisCard({ card, onReviewed, onCiteClick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card elev-sm"
      style={{ borderColor: card.status === "new" ? "var(--color-accent)" : "var(--color-divider)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <motion.span
          animate={card.status === "new" ? { opacity: [1, 0.55, 1], scale: [1, 0.85, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
          style={{ color: "var(--color-accent)", display: "inline-flex" }}
        >
          <Icon name="bell" size={14} />
        </motion.span>
        <div className="card-title" style={{ flex: 1 }}>
          {card.zone}: avg delivery time {card.delta_pct >= 0 ? "+" : ""}{card.delta_pct}%
        </div>
        <span className="tag tag-outline mono">{card.likely_driver || "no dominant cause"}</span>
        {card.status === "reviewed" && <span className="tag tag-neutral">Reviewed</span>}
      </div>

      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "8px 0" }}>{card.narrative}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
        {(card.citations || []).map((c, i) => (
          <span key={i} className={`tag mono clickable ${c.verified ? "tag-accent" : "tag-danger"}`} onClick={() => onCiteClick(c)}>
            {c.label}
          </span>
        ))}
        {card.status === "new" && (
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, marginLeft: "auto" }} onClick={() => onReviewed(card.id)}>
            Mark reviewed
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function DiagnosesPage() {
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [drawerCitation, setDrawerCitation] = useState(null);
  const [lastScan, setLastScan] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [gaps, setGaps] = useState(null);

  function refresh() {
    api.listDiagnosisCards().then(setCards).catch(() => {});
  }

  useEffect(refresh, []);
  useEffect(() => {
    api.getKnowledgeGaps().then(setGaps).catch(() => {});
  }, []);

  async function runScan() {
    setScanning(true);
    setScanError(null);
    try {
      const result = await api.runAnomalyScan();
      setLastScan(result);
      refresh();
    } catch (e) {
      setScanError(`Couldn't complete the check: ${e.message || e}`);
    } finally {
      setScanning(false);
    }
  }

  async function markReviewed(id) {
    await api.markCardReviewed(id);
    refresh();
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "32px clamp(16px, 6vw, 40px)", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ margin: 0 }}>What's going wrong</h2>
        <p className="dim" style={{ margin: "4px 0 0", fontSize: 13, maxWidth: 620 }}>
          Checks every zone for unusual delivery delays and investigates what's causing
          each one — the digging a manager would do, done automatically.
        </p>
      </div>

      <KnowledgeGapsPanel gaps={gaps} onAddContent={() => navigate("/sources")} />

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={runScan} disabled={scanning}>
          {scanning ? "Checking your zones…" : "Check for problems"}
        </button>
        {scanError && <span className="tag tag-danger">{scanError}</span>}
        {lastScan && !scanError && (
          <span className="dim" style={{ fontSize: 12 }}>
            {lastScan.cards_created > 0
              ? `Found ${lastScan.cards_created} new issue${lastScan.cards_created === 1 ? "" : "s"}`
              : "Checked — nothing unusual found"}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <AnimatePresence>
          {cards.map((c) => (
            <DiagnosisCard key={c.id} card={c} onReviewed={markReviewed} onCiteClick={setDrawerCitation} />
          ))}
        </AnimatePresence>
        {cards.length === 0 && (
          <div className="dim" style={{ fontSize: 13 }}>
            No diagnoses yet — run a scan, or ask "why did delivery time spike in Zone 3" in Chat.
          </div>
        )}
      </div>

      <SourceDrawer citation={drawerCitation} onClose={() => setDrawerCitation(null)} />
    </div>
  );
}
