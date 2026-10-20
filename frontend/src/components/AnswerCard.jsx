import { useState } from "react";
import { motion } from "framer-motion";
import Icon from "./Icon.jsx";
import CitationTag from "./CitationTag.jsx";

const MARKER_RE = /\[(ORDER|POLICY|WEATHER):([^\]]+)\]/g;

function renderAnswerBody(text, citations, onCiteClick) {
  const nodes = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  MARKER_RE.lastIndex = 0;
  while ((match = MARKER_RE.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    const [, type, refId] = match;
    const citation = citations.find((c) => c.type === type.toLowerCase() && c.ref_id === refId);
    if (citation) {
      nodes.push(<CitationTag key={key++} citation={citation} onClick={onCiteClick} />);
    }
    lastIndex = MARKER_RE.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return nodes;
}

// Plain-language stand-ins for the internal route the question took
const ROUTE_SOURCE = {
  SQL: { icon: "db", label: "From your order data" },
  RETRIEVAL: { icon: "file", label: "From your policy documents" },
  HYBRID: { icon: "layers", label: "From your orders + policy documents" },
  DIAGNOSTIC: { icon: "search", label: "Investigated across your data" },
  CLARIFY: null,
};

const VERDICT_META = {
  grounded: { tag: "tag-accent", icon: "check", label: "Verified against data" },
  no_claims: { tag: "tag-neutral", icon: "check", label: "Verified answer" },
  partial: { tag: "tag-warn", icon: "alert", label: "Partially verified" },
};

function InvestigationTrace({ steps }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;

  return (
    <div
      style={{
        borderRadius: 8,
        // var(--lum-border)/--lum-bg (theme.css) instead of the flat
        // rgba(255,255,255,...) border this used to have — that hardcoded
        // white-on-transparent combination only ever made sense in dark
        // mode; these vars are theme-aware, so light mode now gets a real
        // visible panel too instead of a near-invisible one.
        border: "var(--lum-border)",
        background: "var(--lum-bg)",
        overflow: "hidden",
        fontSize: 13,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          color: "var(--color-text-dim, #94a3b8)",
          cursor: "pointer",
          font: "500 12.5px var(--font-body)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="status-dot-green" />
          <span style={{ color: "var(--color-text, #f8fafc)", fontWeight: 500 }}>Multi-Agent Investigation</span>
          <span className="dim">({steps.length} operational steps verified)</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5 }}>
          {open ? "Hide trace" : "View trace"}
          <Icon name="chevron-down" size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
        </span>
      </button>

      {open && (
        <div style={{ padding: "8px 12px 12px", borderTop: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 8 }}>
          {steps.map((rawStep, i) => {
            let title = `Step ${i + 1}`;
            let desc = rawStep;
            const bracketMatch = rawStep.match(/^\[([^\]]+)\]\s*(.*)$/);
            if (bracketMatch) {
              const rawAgent = bracketMatch[1];
              title = rawAgent.replace(/_agent$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              desc = bracketMatch[2];
            } else if (rawStep.includes(": ")) {
              const colonIdx = rawStep.indexOf(": ");
              title = rawStep.slice(0, colonIdx);
              desc = rawStep.slice(colonIdx + 2);
            }

            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, lineHeight: 1.5 }}>
                <span
                  style={{
                    width: 20, height: 20, borderRadius: "50%", flex: "none",
                    background: "rgba(59, 130, 246, 0.12)", border: "1px solid rgba(59, 130, 246, 0.25)",
                    color: "#60a5fa", display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 600, marginTop: 1,
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: "var(--color-text)", marginRight: 6 }}>{title}:</span>
                  <span className="dim" style={{ color: "var(--color-text-dim, #cbd5e1)" }}>{desc}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Thumbs up/down — the human quality signal that pairs with the grounding
// verdict's machine-computed one. Sits in the same small-icon, tap-to-act
// register as the citation chips just below, not a new UI paradigm.
function FeedbackButtons({ feedback, onFeedback }) {
  return (
    <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label="Good answer"
        aria-pressed={feedback === "up"}
        onClick={() => onFeedback("up")}
        style={{ width: 26, height: 26, color: feedback === "up" ? "var(--color-accent)" : "var(--color-neutral-500)" }}
      >
        <Icon name="thumbsup" size={13} />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label="Bad answer"
        aria-pressed={feedback === "down"}
        onClick={() => onFeedback("down")}
        style={{ width: 26, height: 26, color: feedback === "down" ? "var(--color-danger)" : "var(--color-neutral-500)" }}
      >
        <Icon name="thumbsdown" size={13} />
      </button>
    </div>
  );
}

export default function AnswerCard({ message, onCiteClick, onFeedback, onSuggestionClick }) {
  const source = ROUTE_SOURCE[message.route_taken];
  const uniqueCitations = Array.from(new Map(message.citations.map((c) => [`${c.type}:${c.ref_id}`, c])).values());
  const abstained = message.grounding_verdict === "ungrounded";

  if (abstained) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{ maxWidth: 920, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div
          className="card elev-sm"
          style={{
            padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start",
            border: "1px solid var(--color-warning-bg)", background: "var(--color-warning-bg)",
          }}
        >
          <Icon name="alert" size={17} style={{ color: "var(--color-warning)", flex: "none", marginTop: 2 }} />
          <div>
            <div style={{ font: "600 13.5px var(--font-body)", color: "var(--color-warning)", marginBottom: 4 }}>
              Operational Data Notice
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: "var(--color-text)" }}>
              {message.content}
            </p>
          </div>
        </div>
        {message.investigation_steps?.length > 0 && (
          <InvestigationTrace steps={message.investigation_steps} />
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{ maxWidth: 920, display: "flex", flexDirection: "column", gap: 14 }}
    >
      {(source || message.from_cache) && (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          {message.from_cache && (
            <motion.span variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }} className="tag tag-accent" style={{ gap: 5 }}>
              <Icon name="bolt" size={11} />Instant answer
            </motion.span>
          )}
          {source && (
            <motion.span variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }} className="tag tag-outline" style={{ gap: 5 }}>
              <Icon name={source.icon} size={11} />{source.label}
            </motion.span>
          )}
        </motion.div>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        style={{ fontSize: 15, lineHeight: 1.65, margin: 0 }}
      >
        {renderAnswerBody(message.content, message.citations, onCiteClick)}
      </motion.p>

      {message.investigation_steps?.length > 0 && (
        <InvestigationTrace steps={message.investigation_steps} />
      )}

      {message.data_table && message.data_table.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.2 }} style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                {Object.keys(message.data_table[0]).map((k) => <th key={k}>{k.replace(/_/g, " ")}</th>)}
              </tr>
            </thead>
            <tbody>
              {message.data_table.slice(0, 20).map((row, i) => (
                <tr key={i}>
                  {Object.entries(row).map(([k, v]) => <td key={k} className={k.includes("id") ? "mono" : ""}>{v === null || v === undefined ? "—" : String(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {message.grounding_verdict && VERDICT_META[message.grounding_verdict] && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12, duration: 0.2 }} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className={`tag ${VERDICT_META[message.grounding_verdict].tag}`} style={{ gap: 5 }}>
            <Icon name={VERDICT_META[message.grounding_verdict].icon} size={10} />
            {VERDICT_META[message.grounding_verdict].label}
          </span>
          <span className="dim" style={{ fontSize: 12 }}>
            {uniqueCitations.length > 0
              ? `${uniqueCitations.filter((c) => c.verified).length} of ${uniqueCitations.length} facts double-checked against your actual data`
              : "Direct operational guidance · Cross-referenced with restaurant context"}
          </span>
          {message.trace_id && onFeedback && (
            <FeedbackButtons feedback={message.feedback} onFeedback={onFeedback} />
          )}
        </motion.div>
      )}

      {uniqueCitations.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }} className="dim">Tap to check</span>
          {uniqueCitations.map((c) => (
            <span
              key={`${c.type}:${c.ref_id}`}
              className="tag tag-outline clickable mono"
              onClick={() => onCiteClick(c)}
              title={
                c.type === "order" ? "Tap to see the order details"
                : c.type === "weather" ? "Tap to see the verified weather"
                : "Tap to see the policy clause"
              }
            >
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* Clickable next-question suggestions — only present on the most
          recent answer (ChatPage only passes onSuggestionClick for that
          one), so these never show up stale on an older message once the
          conversation has moved past it. */}
      {onSuggestionClick && message.suggested_followups?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.2 }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          {message.suggested_followups.map((s) => (
            <button key={s} type="button" className="btn btn-secondary" style={{ fontSize: 12.5 }} onClick={() => onSuggestionClick(s)}>
              {s}
            </button>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
