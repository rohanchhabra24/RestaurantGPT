import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../components/Icon.jsx";
import CountUp from "../components/CountUp.jsx";
import { api } from "../api.js";
import { useStats } from "../statsContext.jsx";

const DEFAULT_COMPARE_QUESTION = "Which of yesterday's cancelled orders in Zone 3 are eligible for compensation under our current SLA?";

export default function EvalPage() {
  const { stats, setStats } = useStats();
  const [running, setRunning] = useState(false);
  const [compareQuestion, setCompareQuestion] = useState(DEFAULT_COMPARE_QUESTION);
  const [compareResult, setCompareResult] = useState(null);
  const [comparing, setComparing] = useState(false);

  async function runEval() {
    setRunning(true);
    try {
      const report = await api.runEval();
      setStats(report);
    } finally {
      setRunning(false);
    }
  }

  async function runCompare() {
    if (!compareQuestion.trim()) return;
    setComparing(true);
    setCompareResult(null);
    try {
      const result = await api.compareNaiveVsGrounded(compareQuestion);
      setCompareResult(result);
    } finally {
      setComparing(false);
    }
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "32px 40px", display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <h2 style={{ margin: 0 }}>Trust &amp; Eval</h2>
        <p className="dim" style={{ margin: "4px 0 0", fontSize: 13, maxWidth: 620 }}>
          "Zero-hallucination" is a claim you can check, not a slogan — this page is the proof. Every answer's
          citations are verified against the data actually retrieved that turn, and the golden set below
          catches regressions before they reach an operator.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button type="button" className="btn btn-primary" onClick={runEval} disabled={running}>
          {running ? "Running golden set…" : "Run golden-set eval"}
        </button>
        {stats && <span className="dim" style={{ fontSize: 12 }}>{stats.total} cases</span>}
      </div>

      {stats && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", gap: 40 }}>
          <StatBlock label="Grounded / passed" value={stats.pass_rate * 100} suffix="%" accent />
          <StatBlock label="Avg citation coverage" value={stats.avg_citation_coverage * 100} suffix="%" />
          <StatBlock label="Passed" value={stats.passed} decimals={0} suffix={` / ${stats.total}`} />
        </motion.div>
      )}

      {stats && (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr><th></th><th>Case</th><th>Route</th><th>Grounding</th><th>Coverage</th></tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {stats.results.map((r, i) => (
                  <motion.tr key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <td>
                      {r.passed ? (
                        <span className="tag tag-accent" style={{ gap: 4 }}><Icon name="check" size={10} /></span>
                      ) : (
                        <span className="tag tag-danger" style={{ gap: 4 }}><Icon name="x" size={10} /></span>
                      )}
                    </td>
                    <td style={{ maxWidth: 360 }}>{r.question}</td>
                    <td className="mono">{r.actual_route ?? "—"}</td>
                    <td className="mono">{r.grounding_verdict}</td>
                    <td className="mono">{(r.citation_coverage * 100).toFixed(0)}%</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 24 }}>
        <h3 style={{ margin: "0 0 4px" }}>Naive LLM vs. grounded pipeline</h3>
        <p className="dim" style={{ margin: "0 0 16px", fontSize: 13, maxWidth: 620 }}>
          Same question, same underlying data, live. The naive column is roughly what "paste your CSV into a
          chatbot" looks like — a single call with a raw data dump and no citation requirement.
        </p>
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <input className="input" style={{ flex: 1 }} value={compareQuestion} onChange={(e) => setCompareQuestion(e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={runCompare} disabled={comparing}>
            {comparing ? "Running both…" : "Compare"}
          </button>
        </div>

        {compareResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card" style={{ borderColor: "var(--color-danger)" }}>
              <div className="card-kicker" style={{ color: "var(--color-danger)" }}>Naive (no grounding)</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{compareResult.naive.answer}</p>
              <div style={{ marginTop: 10 }}><span className="tag tag-danger" style={{ gap: 5 }}><Icon name="x" size={10} />No citation verification performed</span></div>
            </div>
            <div className="card" style={{ borderColor: "var(--color-accent)" }}>
              <div className="card-kicker" style={{ color: "var(--color-accent)" }}>RestaurantGPT (grounded)</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
                {compareResult.grounded.answer.replace(/\[(ORDER|POLICY):[^\]]+\]/g, "")}
              </p>
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="tag tag-accent" style={{ gap: 5 }}><Icon name="check" size={10} />{compareResult.grounded.grounding_verdict}</span>
                <span className="tag tag-neutral mono">{compareResult.grounded.citations.length} citations verified</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function StatBlock({ label, value, suffix, decimals = 1, accent = false }) {
  return (
    <div>
      <div style={{ fontSize: 32, fontWeight: 700, color: accent ? "var(--color-accent)" : "var(--color-text)" }}>
        <CountUp value={value} suffix={suffix} decimals={decimals} />
      </div>
      <div className="dim" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}
