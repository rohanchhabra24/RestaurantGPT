import { useEffect, useState } from "react";
import CitationTag from "../components/CitationTag.jsx";
import SourceDrawer from "../components/SourceDrawer.jsx";
import Icon from "../components/Icon.jsx";
import { api } from "../api.js";

// Same verdict vocabulary as AnswerCard.jsx — this page is the "show your
// work" counterpart to that one: AnswerCard is what the operator sees in
// the moment, this is where anyone (support, the restaurant owner, an
// engineer debugging a wrong answer) can go back and check exactly what
// the pipeline did for any past question — the generated SQL, which
// citations it claimed, how long each stage took, and what it cost.
const VERDICT_META = {
  grounded: { tag: "tag-accent", icon: "check", label: "Verified" },
  no_claims: { tag: "tag-neutral", icon: "check", label: "No sourcing needed" },
  partial: { tag: "tag-warn", icon: "alert", label: "Partially verified" },
  ungrounded: { tag: "tag-danger", icon: "x", label: "Abstained" },
};

const ROUTE_LABEL = {
  SQL: "SQL lookup",
  RETRIEVAL: "Policy lookup",
  HYBRID: "SQL + policy",
  DIAGNOSTIC: "Multi-step investigation",
  CLARIFY: "Clarify",
  GREETING: "Greeting",
};

function TraceRow({ trace, selected, onClick }) {
  const verdict = VERDICT_META[trace.grounding_verdict];
  return (
    <div
      className="row-hover"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        borderBottom: "1px solid var(--color-divider)", cursor: "pointer",
        background: selected ? "var(--color-accent-900)" : "transparent",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trace.question}</div>
        <div className="dim" style={{ fontSize: 11.5 }}>
          {ROUTE_LABEL[trace.route_taken] || trace.route_taken || "—"} · {trace.created_at ? new Date(trace.created_at).toLocaleString() : "—"}
        </div>
      </div>
      {verdict && (
        <span className={`tag ${verdict.tag}`} style={{ gap: 4, flex: "none" }}>
          <Icon name={verdict.icon} size={10} />
          {verdict.label}
        </span>
      )}
    </div>
  );
}

function StageLatencyBars({ stages }) {
  const entries = Object.entries(stages || {});
  if (entries.length === 0) return <div className="dim" style={{ fontSize: 12 }}>No stage timing recorded.</div>;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {entries.map(([stage, ms]) => (
        <div key={stage} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dim" style={{ fontSize: 11.5, width: 92, flex: "none", textTransform: "capitalize" }}>{stage}</span>
          <div style={{ flex: 1, height: 6, background: "var(--color-divider)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${(ms / max) * 100}%`, height: "100%", background: "var(--color-accent)" }} />
          </div>
          <span className="mono" style={{ fontSize: 11, width: 52, textAlign: "right", flex: "none" }}>{ms}ms</span>
        </div>
      ))}
    </div>
  );
}

function TraceDetail({ trace, loading, onCiteClick, onBack }) {
  if (loading) {
    return (
      <div className="card elev-sm" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <div className="dim" style={{ fontSize: 13 }}>Loading…</div>
      </div>
    );
  }
  if (!trace) {
    return (
      <div className="card elev-sm" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <div className="dim" style={{ fontSize: 13 }}>Select a question to see its trace.</div>
      </div>
    );
  }

  const verdict = VERDICT_META[trace.grounding_verdict];
  const totalMs = Object.values(trace.latency_ms_by_stage || {}).reduce((s, v) => s + v, 0);
  const uniqueCitations = Array.from(new Map((trace.claimed_citations || []).map((c) => [`${c.type}:${c.ref_id}`, c])).values());

  return (
    <div className="card elev-sm" style={{ flex: 1, minWidth: 0, padding: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-divider)", flex: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button type="button" className="btn btn-ghost btn-icon dashboard-back-btn" aria-label="Back to list" onClick={onBack} style={{ width: 26, height: 26, margin: "-3px 0" }}>
            <Icon name="arrow-left" size={14} />
          </button>
          <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>Question</div>
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.5 }}>{trace.question}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {verdict && (
            <span className={`tag ${verdict.tag}`} style={{ gap: 4 }}>
              <Icon name={verdict.icon} size={10} />
              {verdict.label}
            </span>
          )}
          <span className="tag tag-neutral">{ROUTE_LABEL[trace.route_taken] || trace.route_taken}</span>
          {trace.served_from_cache && <span className="tag tag-outline">Cached answer</span>}
          <span className="dim mono" style={{ fontSize: 11.5 }}>{totalMs}ms total</span>
          {trace.estimated_cost_usd != null && <span className="dim mono" style={{ fontSize: 11.5 }}>${Number(trace.estimated_cost_usd).toFixed(4)}</span>}
        </div>
      </div>

      {trace.generated_sql && (
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--color-divider)", flex: "none" }}>
          <div className="card-kicker" style={{ marginBottom: 8 }}>Generated SQL</div>
          <pre className="mono" style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, background: "var(--color-bg)", padding: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-divider)" }}>
            {trace.generated_sql}
          </pre>
          {trace.sql_result_row_count != null && (
            <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>{trace.sql_result_row_count} row{trace.sql_result_row_count === 1 ? "" : "s"} returned</div>
          )}
        </div>
      )}

      {trace.investigation_steps?.length > 0 && (
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--color-divider)", flex: "none" }}>
          <div className="card-kicker" style={{ marginBottom: 8 }}>Investigation steps</div>
          <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
            {trace.investigation_steps.map((s, i) => <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5 }}>{s}</li>)}
          </ol>
        </div>
      )}

      {uniqueCitations.length > 0 && (
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--color-divider)", flex: "none" }}>
          <div className="card-kicker" style={{ marginBottom: 8 }}>Citations claimed in the answer</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {uniqueCitations.map((c) => <CitationTag key={`${c.type}:${c.ref_id}`} citation={c} onClick={onCiteClick} />)}
          </div>
        </div>
      )}

      <div style={{ padding: "16px 24px", flex: 1 }}>
        <div className="card-kicker" style={{ marginBottom: 10 }}>Latency by stage</div>
        <StageLatencyBars stages={trace.latency_ms_by_stage} />
        {(trace.input_tokens != null || trace.output_tokens != null) && (
          <div className="dim" style={{ fontSize: 11.5, marginTop: 14 }}>
            {trace.input_tokens ?? 0} input tokens · {trace.output_tokens ?? 0} output tokens
          </div>
        )}
      </div>
    </div>
  );
}

export default function TracesPage() {
  const [traces, setTraces] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Same single-pane-on-narrow-screens pattern as DashboardPage's order
  // list/detail (reuses its .dashboard-split CSS, which already handles
  // the tablet/phone drill-down — no reason to duplicate that layout).
  const [mobileView, setMobileView] = useState("list");
  const [drawerCitation, setDrawerCitation] = useState(null);

  useEffect(() => {
    api.listTraces(50).then((rows) => {
      setTraces(rows);
      if (rows[0]) setSelectedId(rows[0].id);
    }).catch(() => setTraces([]));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setDetailLoading(true);
    api.getTrace(selectedId).then(setDetail).catch(() => setDetail(null)).finally(() => setDetailLoading(false));
  }, [selectedId]);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px clamp(16px, 5vw, 32px) 28px", display: "flex", flexDirection: "column", gap: 18, minHeight: 0 }}>
      <div>
        <h2 style={{ margin: "0 0 2px" }}>Answer Log</h2>
        <p className="dim" style={{ margin: 0, fontSize: 13 }}>
          Every question the assistant has answered, with the exact SQL, citations, and timing behind each one.
        </p>
      </div>

      <div className="dashboard-split" data-mobile-view={mobileView} style={{ flex: 1, minHeight: 420, display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
        <div className="card elev-sm dashboard-list-pane" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, overflow: "auto" }}>
            {traces === null && <div className="dim" style={{ padding: 16, fontSize: 13 }}>Loading…</div>}
            {traces && traces.length === 0 && <div className="dim" style={{ padding: 16, fontSize: 13 }}>No questions answered yet.</div>}
            {traces && traces.map((t) => (
              <TraceRow
                key={t.id}
                trace={t}
                selected={t.id === selectedId}
                onClick={() => { setSelectedId(t.id); setMobileView("detail"); }}
              />
            ))}
          </div>
        </div>

        <div className="dashboard-detail-pane" style={{ display: "flex", minHeight: 0 }}>
          <TraceDetail trace={detail} loading={detailLoading} onCiteClick={setDrawerCitation} onBack={() => setMobileView("list")} />
        </div>
      </div>

      <SourceDrawer citation={drawerCitation} onClose={() => setDrawerCitation(null)} />
    </div>
  );
}
