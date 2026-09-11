import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";

const VERDICT_TAG = {
  grounded: "tag-accent",
  no_claims: "tag-neutral",
  partial: "tag-outline",
  ungrounded: "tag-danger",
};

function TraceDetail({ trace }) {
  const stages = Object.entries(trace.latency_ms_by_stage || {});
  const totalMs = stages.reduce((sum, [, v]) => sum + v, 0);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      style={{ overflow: "hidden" }}
    >
      <div style={{ padding: "14px 16px", borderTop: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 14 }}>
        {stages.length > 0 && (
          <div>
            <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Stage latency ({totalMs}ms total)</div>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--color-bg)" }}>
              {stages.map(([stage, ms], i) => (
                <div
                  key={stage}
                  title={`${stage}: ${ms}ms`}
                  style={{ width: `${(ms / (totalMs || 1)) * 100}%`, background: `hsl(${190 + i * 35}, 70%, 55%)` }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              {stages.map(([stage, ms]) => (
                <span key={stage} className="dim mono" style={{ fontSize: 11 }}>{stage}: {ms}ms</span>
              ))}
            </div>
          </div>
        )}

        {trace.generated_sql && (
          <div>
            <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Generated SQL</div>
            <pre className="mono" style={{ fontSize: 12, background: "var(--color-bg)", padding: 10, borderRadius: "var(--radius-sm)", overflow: "auto", margin: 0 }}>{trace.generated_sql}</pre>
          </div>
        )}

        {trace.retrieved_chunk_ids?.length > 0 && (
          <div>
            <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Retrieved chunk ids</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {trace.retrieved_chunk_ids.map((id) => <span key={id} className="tag tag-outline mono">{id.slice(0, 8)}</span>)}
            </div>
          </div>
        )}

        {trace.claimed_citations?.length > 0 && (
          <div>
            <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Claimed citations</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {trace.claimed_citations.map((c, i) => (
                <span key={i} className={`tag mono ${c.verified ? "tag-accent" : "tag-danger"}`} style={{ gap: 4 }}>
                  <Icon name={c.verified ? "check" : "x"} size={9} />{c.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function TracesPage() {
  const [traces, setTraces] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({});

  useEffect(() => {
    api.listTraces().then(setTraces).catch(() => {});
  }, []);

  async function toggle(id) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!detail[id]) {
      const full = await api.getTrace(id);
      setDetail((prev) => ({ ...prev, [id]: full }));
    }
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "32px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ margin: 0 }}>Traces</h2>
        <p className="dim" style={{ margin: "4px 0 0", fontSize: 13 }}>
          Every answer's full audit trail — route taken, SQL executed, chunks retrieved, and what got verified.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {traces.map((t) => (
          <div key={t.id} className="card elev-sm" style={{ padding: 0, overflow: "hidden" }}>
            <div
              onClick={() => toggle(t.id)}
              style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
            >
              <span className={`tag ${VERDICT_TAG[t.grounding_verdict] || "tag-neutral"} mono`}>{t.grounding_verdict}</span>
              <span style={{ flex: 1, fontSize: 13.5 }}>{t.question}</span>
              <span className="tag tag-outline mono">{t.route_taken}</span>
              <span className="dim mono" style={{ fontSize: 11 }}>{new Date(t.created_at).toLocaleString()}</span>
              <Icon name={expanded === t.id ? "x" : "search"} size={13} />
            </div>
            <AnimatePresence>
              {expanded === t.id && detail[t.id] && <TraceDetail trace={detail[t.id]} />}
            </AnimatePresence>
          </div>
        ))}
        {traces.length === 0 && <div className="dim" style={{ fontSize: 13 }}>No queries traced yet — ask something in Chat.</div>}
      </div>
    </div>
  );
}
