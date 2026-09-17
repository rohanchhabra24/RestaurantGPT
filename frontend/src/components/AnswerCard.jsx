import { motion } from "framer-motion";
import Icon from "./Icon.jsx";
import CitationTag from "./CitationTag.jsx";

const MARKER_RE = /\[(ORDER|POLICY):([^\]]+)\]/g;

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

// Plain-language stand-ins for the internal route the question took — a
// restaurant owner has no reason to see "text_to_sql_agent" or
// "intent_router → HYBRID"; they want to know where the answer came from.
const ROUTE_SOURCE = {
  SQL: { icon: "db", label: "From your order data" },
  RETRIEVAL: { icon: "file", label: "From your policy documents" },
  HYBRID: { icon: "layers", label: "From your orders + policy documents" },
  DIAGNOSTIC: { icon: "search", label: "Investigated across your data" },
  CLARIFY: null,
};

// Stage 2E: every grounding_verdict gets its own honest label — "grounded"
// and "no_claims" both used to render as the same green "Verified" tag,
// which overstates certainty for an answer that made no checkable claims
// at all, and lumped a fully-checked answer in with a partially-checked
// one. "ungrounded" isn't here — it's the pipeline's abstention path (see
// pipeline.py's _ABSTENTION_MESSAGES) and gets its own early-return render
// below, not this badge-on-a-normal-answer treatment.
const VERDICT_META = {
  grounded: { tag: "tag-accent", icon: "check", label: "Verified" },
  no_claims: { tag: "tag-neutral", icon: "check", label: "No sourcing needed" },
  partial: { tag: "tag-warn", icon: "alert", label: "Partially verified" },
};

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

export default function AnswerCard({ message, onCiteClick, onFeedback }) {
  const source = ROUTE_SOURCE[message.route_taken];
  const uniqueCitations = Array.from(new Map(message.citations.map((c) => [`${c.type}:${c.ref_id}`, c])).values());
  const abstained = message.grounding_verdict === "ungrounded";

  if (abstained) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="card elev-sm"
        style={{
          maxWidth: 920, padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start",
          border: "1px solid var(--color-warning-bg)", background: "var(--color-warning-bg)",
        }}
      >
        <Icon name="alert" size={17} style={{ color: "var(--color-warning)", flex: "none", marginTop: 2 }} />
        <div>
          <div style={{ font: "600 13.5px var(--font-body)", color: "var(--color-warning)", marginBottom: 4 }}>
            I don't have a confident answer to that
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: "var(--color-text)" }}>
            {message.content}
          </p>
        </div>
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
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } } }}
          style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}
        >
          {message.investigation_steps.map((step, i) => (
            <motion.div
              key={i}
              variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
              className="dim mono"
              style={{ display: "flex", gap: 8 }}
            >
              <span style={{ color: "var(--color-accent)" }}>{i + 1}.</span>{step}
            </motion.div>
          ))}
        </motion.div>
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
              : "Nothing in this answer needed a source"}
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
              title={c.type === "order" ? "Tap to see the order details" : "Tap to see the policy clause"}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
