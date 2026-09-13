import { motion } from "framer-motion";
import CountUp from "./CountUp.jsx";
import Icon from "./Icon.jsx";

/* A percentage metric as a ring rather than a bare number — inspired by
   amicro.vercel.app's mono-rounded-kpi, rebuilt in our own theme/SVG
   rather than pulled in as a dependency. A ring reads "how close to the
   whole" at a glance, which is what a rate/accuracy KPI actually is;
   plain digits make the reader do that division themselves. */
export default function RoundedKpiTile({ label, value, icon, size = 56, stroke = 6, danger = false }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="rounded-kpi-tile">
      <svg className="rounded-kpi-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-divider)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={danger ? "var(--color-danger)" : "var(--color-accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: [0.22, 0.9, 0.28, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="rounded-kpi-body">
        <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {icon && <Icon name={icon} size={11} />}
          {label}
        </div>
        <div style={{ font: "600 20px var(--font-body)" }}>
          <CountUp value={value ?? 0} decimals={1} suffix="%" />
        </div>
      </div>
    </div>
  );
}
