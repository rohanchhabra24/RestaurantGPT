import { motion, AnimatePresence } from "framer-motion";
import Icon from "./Icon.jsx";

// Same proven "small, collapsed-by-default, opens on demand" pattern
// NotificationsMenu already uses for the bell — reused here instead of
// reviving the removed Insights page (see tasks #49/#50: a full nav tab
// of pipeline telemetry was explicitly cut for cluttering the nav with
// numbers a restaurant owner never checked).
//
// Ties together the three signals that only make sense read side by
// side: grounded_rate (the AI's own confidence check) paired with the
// human thumbs-up rate that should track it; how fast answers come back;
// and how much the assistant is actually being used this week.
const STAGE_LABELS = {
  routing: "Understanding the question",
  sql: "Looking up order data",
  retrieval: "Searching policy documents",
  investigation: "Investigating the issue",
  synthesis: "Writing the answer",
  grounding: "Double-checking the answer",
  cache_lookup: "Checking for a cached answer",
};

function last7(trend) {
  return (trend || []).slice(-7);
}

export default function AiPerformancePopover({ open, summary }) {
  if (!open) return null;

  const accuracyPct = summary ? Math.round(summary.grounded_rate * 1000) / 10 : null;
  const feedback = summary?.feedback;
  const week = last7(summary?.groundedness_trend);
  const queriesThisWeek = week.reduce((sum, d) => sum + d.total, 0);
  const activeDaysThisWeek = week.filter((d) => d.total > 0).length;

  return (
    <AnimatePresence>
      {/* Two elements, not one: framer-motion writes its own `transform`
          (the scale animation) onto whichever element carries
          initial/animate — if that were the same element as the
          position:fixed centering translate(-50%,-50%), framer-motion's
          value clobbers ours (they're the same CSS property), which is
          exactly what silently shifted this off-center. Positioning lives
          on this plain outer div; the animation lives on the motion.div
          inside it. */}
      <div
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(340px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 32px)",
          zIndex: 60,
        }}
      >
      <motion.div
        className="menu-popover"
        // The triggering tile can sit anywhere in the KPI grid (any column,
        // any row) — anchoring position:absolute to that one narrow grid
        // cell caused this to overflow past the viewport edge on a 2-column
        // mobile layout and get visually tangled with the neighboring
        // tile's own stacking context. position:fixed + centered (on the
        // wrapping div above) sidesteps that: it escapes the grid's
        // containing block entirely instead of trying to out-rank a
        // sibling grid cell's z-order.
        style={{ position: "static", width: "100%", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.12 }}
      >
        <div className="menu-popover-header">AI performance</div>

        <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div className="dim" style={{ fontSize: 11.5, marginBottom: 2 }}>Answer accuracy vs. owner feedback</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ font: "600 18px var(--font-body)" }}>{accuracyPct != null ? `${accuracyPct}%` : "—"}</span>
              <span className="dim" style={{ fontSize: 11 }}>self-checked</span>
              {feedback?.rated_count > 0 ? (
                <>
                  <span style={{ font: "600 18px var(--font-body)", marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                    <Icon name="thumbsup" size={13} />{feedback.up_rate_pct}%
                  </span>
                  <span className="dim" style={{ fontSize: 11 }}>{feedback.rated_count} rated</span>
                </>
              ) : (
                <span className="dim" style={{ fontSize: 11, marginLeft: "auto" }}>no owner ratings yet</span>
              )}
            </div>
          </div>

          <div className="hr" />

          <div>
            <div className="dim" style={{ fontSize: 11.5, marginBottom: 4 }}>Response speed (typical / slow)</div>
            {summary?.latency_by_stage?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {summary.latency_by_stage.map((s) => (
                  <div key={s.stage} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span>{STAGE_LABELS[s.stage] || s.stage}</span>
                    <span className="mono dim">{(s.p50_ms / 1000).toFixed(1)}s / {(s.p95_ms / 1000).toFixed(1)}s</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dim" style={{ fontSize: 12 }}>Not enough data yet.</div>
            )}
          </div>

          <div className="hr" />

          <div>
            <div className="dim" style={{ fontSize: 11.5, marginBottom: 2 }}>Usage this week</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="bolt" size={11} />
              <span style={{ fontSize: 13 }}>
                {queriesThisWeek} question{queriesThisWeek === 1 ? "" : "s"} asked, {activeDaysThisWeek}/7 days active
              </span>
            </div>
          </div>
        </div>
      </motion.div>
      </div>
    </AnimatePresence>
  );
}
