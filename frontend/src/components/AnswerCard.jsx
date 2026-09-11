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

const ROUTE_BADGES = {
  SQL: [{ icon: "db", label: "text_to_sql_agent" }],
  RETRIEVAL: [{ icon: "file", label: "policy_retrieval_agent" }],
  HYBRID: [{ icon: "db", label: "text_to_sql_agent" }, { icon: "file", label: "policy_retrieval_agent" }],
  DIAGNOSTIC: [
    { icon: "clock", label: "trend_agent" },
    { icon: "search", label: "correlation_agent" },
    { icon: "file", label: "policy_agent" },
  ],
  CLARIFY: [],
};

export default function AnswerCard({ message, onCiteClick }) {
  const badges = ROUTE_BADGES[message.route_taken] || [];
  const uniqueCitations = Array.from(new Map(message.citations.map((c) => [`${c.type}:${c.ref_id}`, c])).values());

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{ maxWidth: 920, display: "flex", flexDirection: "column", gap: 14 }}
    >
      {(message.route_taken || badges.length > 0) && (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.08 } } }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          {message.route_taken && (
            <motion.span variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }} className="tag tag-outline mono" style={{ gap: 5 }}>
              <Icon name="route" size={11} />intent_router → {message.route_taken}
            </motion.span>
          )}
          {badges.map((b) => (
            <motion.span key={b.label} variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }} className="tag tag-outline mono" style={{ gap: 5 }}>
              <Icon name={b.icon} size={11} />{b.label}
            </motion.span>
          ))}
        </motion.div>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        style={{ fontSize: 15, lineHeight: 1.65, margin: 0 }}
      >
        {renderAnswerBody(message.content, message.citations, onCiteClick)}
      </motion.p>

      {message.investigation_steps?.length > 0 && (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.1, delayChildren: 0.3 } } }}
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
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} style={{ overflowX: "auto" }}>
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

      {message.grounding_verdict && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.45 }} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {message.grounding_verdict === "ungrounded" ? (
            <span className="tag tag-danger" style={{ gap: 5 }}><Icon name="x" size={10} />Unverified</span>
          ) : (
            <span className="tag tag-accent" style={{ gap: 5 }}><Icon name="check" size={10} />Verified</span>
          )}
          <span className="dim" style={{ fontSize: 12 }}>
            {uniqueCitations.length > 0
              ? `${uniqueCitations.filter((c) => c.verified).length} of ${uniqueCitations.length} citations traced to an order ID or policy section`
              : "No sourced claims in this answer"}
          </span>
        </motion.div>
      )}

      {uniqueCitations.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }} className="dim">Sources</span>
          {uniqueCitations.map((c) => (
            <span key={`${c.type}:${c.ref_id}`} className="tag tag-outline clickable mono" onClick={() => onCiteClick(c)}>{c.label}</span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
