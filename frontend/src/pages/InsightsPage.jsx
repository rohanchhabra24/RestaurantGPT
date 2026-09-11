import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import CountUp from "../components/CountUp.jsx";
import { api } from "../api.js";

// Categorical palette, fixed order (validated dark-mode set — see the
// dataviz skill's reference/palette.md). Assigned by route name, never
// cycled, so a route's color stays stable regardless of which others
// are present this window.
const ROUTE_COLOR = {
  SQL: "#3987e5",
  RETRIEVAL: "#d95926",
  HYBRID: "#199e70",
  DIAGNOSTIC: "#c98500",
  CLARIFY: "#d55181",
};

// Sequential single-hue ramp (blue), lightest→darkest, for magnitude
// comparison across pipeline stages — capped at dark-mode step 600 per
// the skill's ordinal-ramp rule.
const SEQUENTIAL_RAMP = ["#86b6ef", "#5598e7", "#3987e5", "#2a78d6", "#1c5cab", "#184f95"];

const STATUS_GOOD = "#0ca30c";

function StatTile({ label, value, suffix = "", decimals = 0, sub }) {
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>
        <CountUp value={value} suffix={suffix} decimals={decimals} />
      </div>
      <div className="dim" style={{ fontSize: 12 }}>{label}</div>
      {sub && <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, displayValue, color, maxValue }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }} title={`${label}: ${displayValue}`}>
      <div className="mono dim" style={{ width: 130, fontSize: 12, flex: "none" }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: "var(--color-divider)", borderRadius: 4, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ height: "100%", background: color, borderRadius: 4 }}
        />
      </div>
      <div className="mono" style={{ width: 60, fontSize: 12, textAlign: "right", flex: "none" }}>{displayValue}</div>
    </div>
  );
}

function GroundednessTrend({ trend }) {
  if (trend.length === 0) return <div className="dim" style={{ fontSize: 13 }}>Not enough history yet.</div>;

  const width = 560, height = 90, pad = 8;
  const points = trend.map((t, i) => {
    const x = pad + (i / Math.max(1, trend.length - 1)) * (width - pad * 2);
    const y = t.pct === null ? null : height - pad - (t.pct / 100) * (height - pad * 2);
    return { x, y, ...t };
  });
  const valid = points.filter((p) => p.y !== null);
  const path = valid.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  return (
    <svg width={width} height={height} style={{ maxWidth: "100%" }}>
      <line x1={pad} y1={pad} x2={width - pad} y2={pad} stroke="var(--color-divider)" strokeWidth="1" strokeDasharray="3 3" />
      <text x={width - pad} y={pad - 3} textAnchor="end" fontSize="9" fill="var(--color-neutral-500)">100%</text>
      <path d={path} fill="none" stroke={STATUS_GOOD} strokeWidth="2" strokeLinecap="round" />
      {valid.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={STATUS_GOOD}>
          <title>{`${p.date}: ${p.pct}% grounded (${p.grounded}/${p.total})`}</title>
        </circle>
      ))}
    </svg>
  );
}

export default function InsightsPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getInsightsSummary().then(setData).catch(() => {});
  }, []);

  if (!data) return <div style={{ flex: 1, padding: "32px 40px" }} className="dim">Loading…</div>;

  const maxRouteCount = Math.max(1, ...data.route_distribution.map((r) => r.count));
  const maxLatency = Math.max(1, ...data.avg_latency_by_stage.map((s) => s.avg_ms));

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "32px 40px", display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <h2 style={{ margin: 0 }}>Insights</h2>
        <p className="dim" style={{ margin: "4px 0 0", fontSize: 13 }}>
          Last {data.window_days} days of real production traffic — nothing here is synthetic.
        </p>
      </div>

      <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
        <StatTile label="Total queries" value={data.total_queries} />
        <StatTile label="Cache hit rate" value={data.cache_hit_rate * 100} decimals={1} suffix="%" sub="Warmstart semantic cache" />
        <StatTile label="Grounded rate" value={data.grounded_rate * 100} decimals={1} suffix="%" />
        {data.ungrounded_count > 0 && (
          <StatTile label="Ungrounded (needs attention)" value={data.ungrounded_count} decimals={0} />
        )}
      </div>

      <div>
        <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Route distribution</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 620 }}>
          {data.route_distribution.length === 0 && <div className="dim" style={{ fontSize: 13 }}>No queries yet.</div>}
          {data.route_distribution.map((r) => (
            <BarRow key={r.route} label={r.route} value={r.count} displayValue={r.count} color={ROUTE_COLOR[r.route] || "#898781"} maxValue={maxRouteCount} />
          ))}
        </div>
      </div>

      <div>
        <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Avg latency by stage</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 620 }}>
          {data.avg_latency_by_stage.length === 0 && <div className="dim" style={{ fontSize: 13 }}>No queries yet.</div>}
          {data.avg_latency_by_stage.map((s, i) => (
            <BarRow
              key={s.stage}
              label={s.stage}
              value={s.avg_ms}
              displayValue={`${s.avg_ms}ms`}
              color={SEQUENTIAL_RAMP[Math.min(i, SEQUENTIAL_RAMP.length - 1)]}
              maxValue={maxLatency}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
          Groundedness trend — last 14 days
        </div>
        <GroundednessTrend trend={data.groundedness_trend} />
      </div>
    </div>
  );
}
