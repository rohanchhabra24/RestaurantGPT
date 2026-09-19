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
        <div style={{ marginTop: 6, position: "relative" }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            style={{ width: "100%", height: size === "lg" ? 48 : 36, display: "block", cursor: "crosshair" }}
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <path
              d={`${pathFor(vals, xFor, yFor)} L ${xFor(points.length - 1)} ${HEIGHT} L ${xFor(0)} ${HEIGHT} Z`}
              fill={chartHoverColor}
              opacity="0.1"
              stroke="none"
            />
            <path d={pathFor(vals, xFor, yFor)} fill="none" stroke={chartBaseColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {hoverIdx != null && (
              <line x1={xFor(hoverIdx)} x2={xFor(hoverIdx)} y1={0} y2={HEIGHT} stroke="var(--color-divider)" strokeWidth="1" />
            )}
            <circle
              cx={xFor(points.length - 1)}
              cy={yFor(vals[vals.length - 1])}
              r="4.5"
              fill={chartHoverColor}
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
            {hoverIdx != null && hoverIdx !== points.length - 1 && (
              <circle cx={xFor(hoverIdx)} cy={yFor(vals[hoverIdx])} r="4.5" fill={chartHoverColor} stroke="var(--color-surface)" strokeWidth="2" />
            )}
          </svg>
          {hovered && (
            <div
              className="card elev-lg mono"
              style={{
                position: "absolute", top: -6, pointerEvents: "none", padding: "5px 9px", fontSize: 11,
                left: `${(xFor(hoverIdx) / WIDTH) * 100}%`,
                transform: `translate(${hoverIdx < points.length / 2 ? "4px" : "calc(-100% - 4px)"}, -100%)`,
                whiteSpace: "nowrap", gap: 2, zIndex: 5,
              }}
            >
              <div className="dim" style={{ fontSize: 10 }}>{formatBucket(hovered.bucket, granularity)}</div>
              <div style={{ fontWeight: 600 }}>{formatValue(hovered.value, format)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
