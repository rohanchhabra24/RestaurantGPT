import Icon from "./Icon.jsx";

// Stage 2D: the proactive counterpart to the Dashboard's manual "Check for
// recoverable compensation" button — surfaces the same kind of result
// (new claims + amount) unprompted, once a day, instead of requiring the
// operator to remember to click anything.
export default function CompensationDigestBanner({ digest, onReview, onDismiss }) {
  if (!digest || digest.status === "dismissed" || digest.new_claims_count === 0) return null;

  return (
    <div
      className="card elev-sm wrap-header-row"
      style={{
        padding: "14px 18px",
        border: "1px solid var(--color-accent-800)", background: "var(--color-accent-900)",
      }}
    >
      <div className="wrap-header-row-main">
        <span
          style={{
            width: 34, height: 34, borderRadius: "50%", flex: "none",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "var(--color-accent-800)",
          }}
        >
          <Icon name="bell" size={16} style={{ color: "var(--color-accent-200)" }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "600 14px var(--font-body)" }}>New compensation found</div>
          <div className="dim" style={{ fontSize: 12.5 }}>
            {digest.new_claims_count} new claim{digest.new_claims_count === 1 ? "" : "s"} drafted overnight,
            worth ₹{Number(digest.new_recoverable_amount).toFixed(0)} in total.
          </div>
        </div>
      </div>
      <div className="wrap-header-row-actions">
        <button type="button" className="btn btn-primary" onClick={onReview}>
          Review claims
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: 6, borderRadius: "50%", display: "inline-flex", color: "var(--color-neutral-500)",
          }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}
