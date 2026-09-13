import Icon from "./Icon.jsx";
import CountUp from "./CountUp.jsx";

/* A stat tile for a plain count metric, with a small equalizer-style
   "activity" indicator (four bars pulsing out of phase) standing in for
   a static icon — inspired by amicro.vercel.app's mono-activity-purple,
   rebuilt in our own theme/animation stack rather than pulled in as a
   dependency. Meant for counts that plausibly change during a shift
   (orders today, breaches today), not static totals. */
export default function ActivityTile({ label, value, icon }) {
  return (
    <div className="activity-tile">
      <div className="activity-tile-head">
        <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {icon && <Icon name={icon} size={11} />}
          {label}
        </div>
        <span className="activity-bars" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ animationDelay: `${i * 0.14}s` }} />
          ))}
        </span>
      </div>
      <div style={{ font: "600 24px var(--font-body)", color: "var(--color-accent-100)" }}>
        <CountUp value={value ?? 0} decimals={0} />
      </div>
    </div>
  );
}
