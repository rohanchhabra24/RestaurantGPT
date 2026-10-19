import { useRef, useState } from "react";
import Icon from "./Icon.jsx";

const WIDTH = 320;
const HEIGHT = 56;
const PAD = 4;

function pathFor(points, xFor, yFor) {
  return points.map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`).join(" ");
}

function formatBucket(bucket, granularity) {
  const d = new Date(bucket);
  return granularity === "hour"
    ? d.toLocaleTimeString([], { hour: "numeric" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatValue(v, format) {
  if (format === "currency") return `₹${Math.round(v).toLocaleString("en-IN")}`;
  return Math.round(v).toLocaleString("en-IN");
}

// Stat-tile-with-sparkline: a big current-period number, a delta against
// the equivalent prior period, and a 12-ish-point trend line — the
// dataviz pattern for "a single headline value plus its trend", not a
// full chart (no axes/legend needed for one series with a title).
export default function HeroStatTile({ label, icon, format = "number", value, deltaPct, points, granularity, size = "lg", color = "accent", chartBaseColor = "var(--color-accent)", chartHoverColor = "var(--color-accent)", obscured = false, onToggleObscure }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const vals = points.map((p) => p.value);
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const range = max - min || 1;
  const xFor = (i) => PAD + (i / Math.max(1, points.length - 1)) * (WIDTH - PAD * 2);
  const yFor = (v) => HEIGHT - PAD - ((v - min) / range) * (HEIGHT - PAD * 2);

  function handleMove(e) {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(xFor(i) - relX);
      if (d < best) { best = d; nearest = i; }
    }
    setHoverIdx(nearest);
  }

  const hovered = hoverIdx != null ? points[hoverIdx] : null;
  const deltaGood = deltaPct == null ? null : deltaPct >= 0;
  const prevVal = hoverIdx != null && hoverIdx > 0 ? points[hoverIdx - 1].value : null;
  const hoverDelta = (hovered && prevVal != null && prevVal > 0)
    ? Math.round(((hovered.value - prevVal) / prevVal) * 100)
    : null;

  return (
    <div className={`card elev-sm hero-stat-tile hero-stat-tile-${size}`} style={{ padding: 18, gap: 6, position: "relative" }}>
      <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {icon && <Icon name={icon} size={11} />}
          {label}
        </div>
        {onToggleObscure && (
          <button onClick={onToggleObscure} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", opacity: 0.6 }} aria-label="Toggle visibility">
            <Icon name={obscured ? "eye-off" : "eye"} size={14} />
          </button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ font: `600 ${size === "lg" ? 30 : 22}px var(--font-body)` }}>
          {value == null ? "—" : obscured ? "₹ ***,***" : formatValue(value, format)}
        </div>
        {deltaPct != null && (
          <span
            className={`tag ${deltaGood ? "tag-accent" : "tag-danger"}`}
            style={{ gap: 3, fontSize: 11 }}
            title="vs. the same length period immediately before this one"
          >
            <Icon name={deltaGood ? "check" : "x"} size={9} />
            {deltaGood ? "+" : ""}{deltaPct}%
          </span>
        )}
      </div>

      {points.length > 1 && (
        <div style={{ marginTop: 8, position: "relative" }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            style={{ width: "100%", height: size === "lg" ? 52 : 38, display: "block", cursor: "crosshair", overflow: "visible" }}
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              <linearGradient id={`grad-${label.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartBaseColor} stopOpacity="0.25" />
                <stop offset="100%" stopColor={chartBaseColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d={`${pathFor(vals, xFor, yFor)} L ${xFor(points.length - 1)} ${HEIGHT} L ${xFor(0)} ${HEIGHT} Z`}
              fill={`url(#grad-${label.replace(/\s+/g, "")})`}
              stroke="none"
            />
            <path d={pathFor(vals, xFor, yFor)} fill="none" stroke={chartBaseColor} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
            {hoverIdx != null && (
              <line x1={xFor(hoverIdx)} x2={xFor(hoverIdx)} y1={0} y2={HEIGHT} stroke="rgba(255,255,255,0.2)" strokeDasharray="2,2" strokeWidth="1.2" />
            )}
            <circle
              cx={xFor(points.length - 1)}
              cy={yFor(vals[vals.length - 1])}
              r="4.5"
              fill={chartHoverColor}
              stroke="var(--color-surface, #0f121d)"
              strokeWidth="2.5"
            />
            {hoverIdx != null && (
              <g>
                <circle cx={xFor(hoverIdx)} cy={yFor(vals[hoverIdx])} r="7" fill={chartHoverColor} opacity="0.3" />
                <circle cx={xFor(hoverIdx)} cy={yFor(vals[hoverIdx])} r="4.5" fill={chartHoverColor} stroke="var(--color-surface, #0f121d)" strokeWidth="2" />
              </g>
            )}
          </svg>
          {hovered && (
            <div
              className="elev-lg"
              style={{
                position: "absolute",
                top: -8,
                pointerEvents: "none",
                padding: "8px 12px",
                fontSize: 12,
                left: `${(xFor(hoverIdx) / WIDTH) * 100}%`,
                transform: `translate(${hoverIdx < points.length / 2 ? "8px" : "calc(-100% - 8px)"}, -100%)`,
                whiteSpace: "nowrap",
                zIndex: 10,
                background: "rgba(18, 21, 33, 0.94)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: 8,
                boxShadow: "0 12px 28px -6px rgba(0, 0, 0, 0.6)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span className="dim" style={{ fontSize: 11, fontWeight: 500 }}>
                  {formatBucket(hovered.bucket, granularity)}
                </span>
                {hoverDelta != null && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: hoverDelta >= 0 ? "#10b981" : "#f43f5e",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    {hoverDelta >= 0 ? "↑" : "↓"}{Math.abs(hoverDelta)}%
                  </span>
                )}
              </div>
              <div className="mono" style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text, #f8fafc)" }}>
                {formatValue(hovered.value, format)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
