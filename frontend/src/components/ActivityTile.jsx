import Icon from "./Icon.jsx";
import CountUp from "./CountUp.jsx";

/* A stat tile for a plain count metric that can change during a shift
   (orders today, breaches today) — a small pulsing dot marks it as "live
   as of now", using this app's existing live-indicator language (the same
   rgpt-pulse animation as the Landing page's "Live" badge) rather than an
   equalizer/loading-spinner look, which reads as "still fetching" instead
   of "this number updates." */
export default function ActivityTile({ label, value, icon }) {
  return (
    <div className="activity-tile">
      <div className="activity-tile-head">
        <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {icon && <Icon name={icon} size={11} />}
          {label}
        </div>
        <span className="activity-live-dot" aria-hidden="true" title="Updates through the day" />
      </div>
      <div style={{ font: "600 24px var(--font-body)", color: "var(--color-accent-100)" }}>
        <CountUp value={value ?? 0} decimals={0} />
      </div>
    </div>
  );
}
