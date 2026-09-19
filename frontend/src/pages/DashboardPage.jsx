import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CountUp from "../components/CountUp.jsx";
import Icon from "../components/Icon.jsx";
import ActivityTile from "../components/ActivityTile.jsx";
import RoundedKpiTile from "../components/RoundedKpiTile.jsx";
import HeroStatTile from "../components/HeroStatTile.jsx";
import TimeRangeFilter from "../components/TimeRangeFilter.jsx";
import CompensationDigestBanner from "../components/CompensationDigestBanner.jsx";
import OrderSearch from "../components/OrderSearch.jsx";
import AiPerformancePopover from "../components/AiPerformancePopover.jsx";
import useClickOutside from "../hooks/useClickOutside.js";
import { api } from "../api.js";

const TABS = [
  { key: "all", label: "All orders" },
  { key: "cancelled", label: "Cancelled" },
  { key: "eligible", label: "Owed compensation" },
];

// The 3 values this column is actually constrained to (see migration
// 001_init.sql) — not guessed, so a filter option can never claim a
// status that couldn't exist in the data.
const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "delivered", label: "Delivered" },
  { value: "in_progress", label: "In progress" },
  { value: "cancelled", label: "Cancelled" },
];

// A small popover filter control — button shows the active choice,
// clicking opens a list of options anchored to it. Reused for both
// Platform and Status rather than writing two near-identical dropdowns.
function FilterDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);
  const current = options.find((o) => o.value === value);
  const active = value !== "all";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={active ? "btn btn-secondary" : "btn btn-ghost"}
        style={{ fontSize: 12.5, borderColor: active ? "var(--color-accent)" : undefined, color: active ? "var(--color-accent)" : undefined }}
        onClick={() => setOpen((v) => !v)}
      >
        {label}{active ? `: ${current.label}` : ""}
        <Icon name="chevron-down" size={12} />
      </button>
      {open && (
        // left:0/right:auto overrides .menu-popover's shared right:0 anchor
        // (correct for the topbar's account/notification triggers, which
        // sit at the far right of a wide bar) — these triggers instead sit
        // at the LEFT of a narrow 460px card, so right-anchoring pushed the
        // popover's left edge past the card's own edge, where the card's
        // overflow:hidden silently clipped it.
        <div className="menu-popover" style={{ minWidth: 170, left: 0, right: "auto" }}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="menu-item"
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              <span style={{ width: 14, flex: "none", display: "inline-flex" }}>
                {value === o.value && <Icon name="check" size={12} />}
              </span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, prefix = "", suffix = "", decimals = 0, icon }) {
  return (
    <div className="card elev-sm" style={{ padding: 16, gap: 8, justifyContent: "space-between" }}>
      <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon && <Icon name={icon} size={11} />}
        {label}
      </div>
      <div style={{ font: "600 24px var(--font-body)" }}>
        {prefix}<CountUp value={value ?? 0} suffix={suffix} decimals={decimals} />
      </div>
    </div>
  );
}

// "-8.5 min" reads as ambiguous (is negative good?) to anyone who isn't
// already thinking in signed deltas. Words + color say the same thing
// unambiguously: green and "ahead" is good news, red and "behind" isn't.
function DeliveryPaceTile({ avgDelaySeconds }) {
  const known = avgDelaySeconds != null;
  const minutes = known ? Math.abs(avgDelaySeconds / 60) : 0;
  const ahead = known && avgDelaySeconds <= 0;
  return (
    <div className="card elev-sm tile-wide" style={{ padding: 16, gap: 6, justifyContent: "space-between" }}>
      <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="clock" size={11} />
        Delivery speed
      </div>
      <div style={{ font: "600 24px var(--font-body)", color: !known ? undefined : ahead ? "var(--color-accent)" : "var(--color-danger)" }}>
        {known ? <><CountUp value={minutes} decimals={1} suffix=" min" /></> : "—"}
      </div>
      {known && <div className="dim" style={{ fontSize: 11 }}>{ahead ? "ahead of target, on average" : "behind target, on average"}</div>}
    </div>
  );
}

function statusTag(order) {
  if (order.claim) {
    return (
      <span className={`tag ${order.claim.status === "submitted" || order.claim.status === "resolved" ? "tag-accent" : "tag-outline"}`} style={{ gap: 4 }}>
        <Icon name="check" size={10} />
        {order.claim.status === "drafted" ? "Claim drafted" : order.claim.status === "submitted" ? "Claim submitted" : "Claim resolved"}
      </span>
    );
  }
  if (order.eligible) {
    return (
      <span className="tag tag-accent" style={{ gap: 4 }}>
        <Icon name="check" size={10} />
        Compensation owed
      </span>
    );
  }
  if (order.is_cancelled) {
    return (
      <span className="tag tag-neutral" style={{ gap: 4, opacity: 0.75 }}>
        <Icon name="x" size={10} />
        Not eligible
      </span>
    );
  }
  return <span className="tag tag-neutral">{order.status}</span>;
}

function OrderRow({ order, selected, onClick }) {
  return (
    <div
      className="row-hover"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        borderBottom: "1px solid var(--color-divider)", cursor: "pointer",
        background: selected ? "var(--color-accent-900)" : "transparent",
      }}
    >
      <span
        style={{
          width: 30, height: 30, borderRadius: "50%", flex: "none",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: selected ? "var(--color-accent-800)" : "var(--color-surface-raised)",
        }}
      >
        <img src="/bell-icon.png" alt="Order" style={{ width: 14, height: 14, objectFit: "contain", opacity: selected ? 1 : 0.6 }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5 }}>
          <span className="mono" style={{ fontWeight: 600 }}>#{order.aggregator_order_id}</span>
        </div>
        <div className="dim" style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}>
          {order.zone} · {order.platform}
          {order.weather_flag && <Icon name="rain" size={11} />}
        </div>
      </div>
      {statusTag(order)}
      <div className="mono" style={{ fontSize: 13, width: 64, textAlign: "right", flex: "none" }}>
        {order.total_amount != null ? `₹${order.total_amount.toFixed(0)}` : "—"}
      </div>
    </div>
  );
}

function delayMinutes(order) {
  if (order.delivery_time_seconds == null || order.sla_target_seconds == null) return null;
  return Math.round((order.delivery_time_seconds - order.sla_target_seconds) / 60);
}

function OrderDetail({ order, onSweep, sweeping, sweepError, sweepResult, onBack }) {
  if (!order) {
    return (
      <div className="card elev-sm" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <div className="dim" style={{ fontSize: 13 }}>Select an order to see its detail.</div>
      </div>
    );
  }

  const delay = delayMinutes(order);

  return (
    <div className="card elev-sm" style={{ flex: 1, minWidth: 0, padding: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-divider)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flex: "none" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <button type="button" className="btn btn-ghost btn-icon dashboard-back-btn" aria-label="Back to order list" onClick={onBack} style={{ width: 26, height: 26, margin: "-3px 0" }}>
              <Icon name="arrow-left" size={14} />
            </button>
            <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>Order detail</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="mono" style={{ font: "600 20px var(--font-body)" }}>#{order.aggregator_order_id}</span>
            {statusTag(order)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>Platform</div>
          <span className="tag tag-neutral mono">{order.platform}</span>
        </div>
      </div>

      {/* One grouped card with divided rows, not 3 separate boxes — the
          rows all describe the same order, so they read as one fact
          sheet rather than three competing tiles fighting for attention. */}
      <div style={{ padding: "20px 24px 0", flex: "none" }}>
        <div className="card elev-sm" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
            <span className="dim" style={{ fontSize: 12.5 }}>Order value</span>
            <span className="mono" style={{ font: "600 14px var(--font-body)" }}>{order.total_amount != null ? `₹${order.total_amount.toFixed(0)}` : "—"}</span>
          </div>
          <div className="hr" style={{ margin: 0 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
            <span className="dim" style={{ fontSize: 12.5 }}>Delay vs. SLA</span>
            <span className="mono" style={{ font: "600 14px var(--font-body)" }}>{delay != null ? `${delay >= 0 ? "+" : ""}${delay} min` : "—"}</span>
          </div>
          <div className="hr" style={{ margin: 0 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
            <span className="dim" style={{ fontSize: 12.5 }}>{order.claim ? "Claim amount" : "Compensation owed"}</span>
            <span className="mono" style={{ font: "600 14px var(--font-body)", color: "var(--color-accent)" }}>
              {order.claim ? `₹${order.claim.computed_amount.toFixed(0)}` : order.eligible_amount != null ? `₹${order.eligible_amount.toFixed(0)}` : "—"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="dim" style={{ fontSize: 12.5 }}>
          <strong style={{ color: "var(--color-text)", fontWeight: 500 }}>Zone:</strong> {order.zone} &nbsp;·&nbsp;
          <strong style={{ color: "var(--color-text)", fontWeight: 500 }}>Placed:</strong>{" "}
          {order.placed_at ? new Date(order.placed_at).toLocaleString() : "—"}
        </div>
        {order.cancellation_reason && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            {order.weather_flag && <Icon name="rain" size={13} style={{ color: "var(--color-accent)", flex: "none" }} />}
            Cancellation reason: <span className="mono">{order.cancellation_reason}</span>
          </div>
        )}
        {order.is_cancelled && (
          <>
            <div className="hr" />
            <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{order.eligibility_reason}</div>
          </>
        )}
      </div>

      {order.eligible && !order.claim && (
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--color-divider)", flex: "none" }}>
          {sweepError && (
            <div className="tag tag-danger" style={{ marginBottom: 10, display: "flex" }}>{sweepError}</div>
          )}
          {sweepResult && !sweepError && (
            <div className="tag tag-accent" style={{ marginBottom: 10, display: "flex", gap: 5 }}>
              <Icon name="check" size={10} />
              {sweepResult.drafted_claims.length > 0
                ? `Drafted ${sweepResult.drafted_claims.length} claim${sweepResult.drafted_claims.length === 1 ? "" : "s"}, ₹${sweepResult.total_recoverable.toFixed(0)} total`
                : "Checked — nothing new to claim right now"}
            </div>
          )}
          <button type="button" className="btn btn-primary btn-block" onClick={onSweep} disabled={sweeping}>
            {sweeping ? "Checking your orders…" : "Check for recoverable compensation"}
          </button>
          <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
            This checks every eligible cancelled order from the last 2 days, not just this
            one — it only drafts a claim for you to review, nothing is submitted automatically.
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState(null);
  const [summary, setSummary] = useState(null);
  const [perfOpen, setPerfOpen] = useState(false);
  const perfRef = useRef(null);
  useClickOutside(perfRef, () => setPerfOpen(false), perfOpen);
  const [tab, setTab] = useState("eligible");
  const [orders, setOrders] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  // Below 760px the list and detail panes can't sit side by side (see
  // .dashboard-split's mobile media query in theme.css) — this tracks
  // which one is showing instead, so opening an order there means a
  // single-pane swap, not scrolling past the whole list to reach it.
  // Irrelevant above 760px, where CSS ignores it and shows both panes.
  const [mobileView, setMobileView] = useState("list");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sweeping, setSweeping] = useState(false);
  const [sweepError, setSweepError] = useState(null);
  const [sweepResult, setSweepResult] = useState(null);
  const [range, setRange] = useState("week");
  const [customFrom, setCustomFrom] = useState(null);
  const [customTo, setCustomTo] = useState(null);
  const [trends, setTrends] = useState(null);
  const [digest, setDigest] = useState(null);
  const [showRevenue, setShowRevenue] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const orderParam = searchParams.get("order");

  useEffect(() => {
    api.getOperationsSummary().then(setKpis).catch(() => {});
    api.getInsightsSummary().then(setSummary).catch(() => {});
  }, []);

  // Proactive digest (Stage 2D) — computed lazily server-side, at most once
  // per day; loading the Dashboard is what triggers it, no click required.
  useEffect(() => {
    api.getCompensationDigest().then((d) => {
      setDigest(d);
      if (d.status === "new" && d.new_claims_count > 0) {
        api.markDigestViewed(d.id).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  function reviewDigestClaims() {
    setTab("eligible");
    if (digest) {
      api.dismissDigest(digest.id).catch(() => {});
      api.track("digest_reviewed", { new_claims_count: digest.new_claims_count, new_recoverable_amount: digest.new_recoverable_amount });
      setDigest((prev) => (prev ? { ...prev, status: "dismissed" } : prev));
    }
  }

  function dismissDigest() {
    if (!digest) return;
    api.dismissDigest(digest.id).catch(() => {});
    api.track("digest_dismissed", { new_claims_count: digest.new_claims_count, new_recoverable_amount: digest.new_recoverable_amount });
    setDigest((prev) => (prev ? { ...prev, status: "dismissed" } : prev));
  }

  // Arriving from the nav's order lookup (?order=<aggregator_order_id>) —
  // switch to the unfiltered tab so the order is reachable regardless of
  // its status, then select it once the list (or a direct fetch, if it's
  // older than the recent page) confirms it exists.
  useEffect(() => {
    if (orderParam) {
      setTab("all");
      // A lingering Platform/Status filter from before the jump could hide
      // the very order this navigation is trying to reveal.
      setPlatformFilter("all");
      setStatusFilter("all");
    }
  }, [orderParam]);

  useEffect(() => {
    if (!orderParam || !orders) return;
    const match = orders.find((o) => o.aggregator_order_id === orderParam);
    if (match) {
      setSelectedId(match.id);
      setMobileView("detail");
      setSearchParams({}, { replace: true });
      return;
    }
    api.searchOrders(orderParam, 1).then((rows) => {
      if (rows[0]) {
        setOrders((prev) => [rows[0], ...(prev || []).filter((o) => o.id !== rows[0].id)]);
        setSelectedId(rows[0].id);
        setMobileView("detail");
      }
    }).finally(() => setSearchParams({}, { replace: true }));
  }, [orderParam, orders]);

  useEffect(() => {
    api.getOrderTrends(range, customFrom, customTo).then(setTrends).catch(() => setTrends(null));
  }, [range, customFrom, customTo]);

  function handleRangeChange({ range: r, from, to }) {
    setRange(r);
    setCustomFrom(from ?? null);
    setCustomTo(to ?? null);
  }

  function refreshOrders() {
    setOrders(null);
    api.listOrders(tab).then((rows) => {
      setOrders(rows);
      setSelectedId((prev) => (rows.some((o) => o.id === prev) ? prev : rows[0]?.id ?? null));
    }).catch(() => setOrders([]));
  }

  useEffect(refreshOrders, [tab]);

  async function runSweep() {
    setSweeping(true);
    setSweepError(null);
    setSweepResult(null);
    try {
      const result = await api.runCompensationSweep();
      setSweepResult(result);
      refreshOrders();
      api.getOperationsSummary().then(setKpis).catch(() => {});
      api.getOrderTrends(range, customFrom, customTo).then(setTrends).catch(() => {});
    } catch (e) {
      setSweepError(`Couldn't complete the check: ${e.message || e}`);
    } finally {
      setSweeping(false);
    }
  }

  // Platform is free text in the schema (not a fixed enum, unlike status),
  // so its option list is built from whatever platforms are actually
  // present in the current tab's data rather than a hardcoded guess —
  // it can never offer a platform this restaurant doesn't use.
  const platformOptions = [
    { value: "all", label: "All" },
    ...Array.from(new Set((orders || []).map((o) => o.platform).filter(Boolean))).sort().map((p) => ({ value: p, label: p })),
  ];
  const filteredOrders = (orders || []).filter((o) => {
    if (platformFilter !== "all" && o.platform !== platformFilter) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    return true;
  });
  const activeFilterCount = (platformFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

  function changeTab(key) {
    setTab(key);
    setMobileView("list");
    setPlatformFilter("all");
    setStatusFilter("all");
  }

  const selectedOrder = (orders || []).find((o) => o.id === selectedId) || null;
  const revenuePoints = trends?.points.map((p) => ({ bucket: p.bucket, value: p.revenue })) ?? [];
  const orderPoints = trends?.points.map((p) => ({ bucket: p.bucket, value: p.orders })) ?? [];
  // Derived client-side from the same totals the hero tiles already use —
  // no reason to make the backend recompute revenue ÷ orders when both are
  // already sitting right here.
  const aov = trends?.totals.orders ? trends.totals.revenue / trends.totals.orders : null;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px clamp(16px, 5vw, 32px) 28px", display: "flex", flexDirection: "column", gap: 18, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 2px" }}>Operations</h2>
          <p className="dim" style={{ margin: 0, fontSize: 13 }}>Live view across orders, SLA compliance and compensation.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div ref={perfRef} style={{ position: "relative" }}>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="AI performance"
              title="AI performance"
              onClick={() => setPerfOpen((v) => !v)}
              style={{ color: perfOpen ? "var(--color-accent)" : undefined }}
            >
              <Icon name="gauge" size={16} />
            </button>
            <AiPerformancePopover open={perfOpen} summary={summary} />
          </div>
          <TimeRangeFilter range={range} customFrom={customFrom} customTo={customTo} onChange={handleRangeChange} />
        </div>
      </div>

      <CompensationDigestBanner digest={digest} onReview={reviewDigestClaims} onDismiss={dismissDigest} />

      <div className="dashboard-hero-row">
        <HeroStatTile
          label="Revenue" icon="check" format="currency" size="lg"
          value={trends?.totals.revenue} deltaPct={trends?.deltas_pct.revenue}
          points={revenuePoints} granularity={trends?.granularity}
          obscured={!showRevenue}
          onToggleObscure={() => setShowRevenue(!showRevenue)}
        />
        <HeroStatTile
          label="Total orders" icon="db" format="number" size="lg"
          value={trends?.totals.orders} deltaPct={trends?.deltas_pct.orders}
          points={orderPoints} granularity={trends?.granularity}
          chartBaseColor="#8b5cf6" chartHoverColor="#a78bfa"
        />
      </div>

      {/* Split from one flat 7-tile row into two labeled groups — every
          KPI here used to carry the same visual weight regardless of
          whether it was an operational signal or a money signal, which
          flattens priority (a design-audit finding: "everything shouts
          at the same volume"). Grouping under a kicker label, macOS
          System-Settings-section style, doesn't need new components —
          just tells the eye where a number belongs before it reads the
          number itself. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="dim" style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }}>Delivery &amp; SLA</div>
        {/* 3 even columns, not 4 — DeliveryPaceTile is 2 columns wide by
            design (.tile-wide), so 3 square tiles + 1 wide tile in a
            4-column grid is 5 column-units trying to fit in 4, and the
            4th tile always wraps onto its own row alone. Giving the wide
            tile its own full-width row below instead means the grid
            math actually divides evenly. */}
        <div className="dashboard-secondary-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <RoundedKpiTile label="Cancellation rate" value={kpis?.cancellation_rate_pct} icon="x" danger={kpis?.cancellation_rate_pct > 20} />
          <ActivityTile label="SLA breaches today" value={kpis?.sla_breaches_today} icon="clock" />
          <StatTile
            label="Avg. prep time" icon="clock"
            value={kpis?.avg_prep_time_seconds != null ? kpis.avg_prep_time_seconds / 60 : null}
            decimals={1} suffix=" min"
          />
        </div>
        <DeliveryPaceTile avgDelaySeconds={kpis?.avg_delivery_delay_seconds} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="dim" style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }}>Money</div>
        <div className="dashboard-secondary-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <StatTile label="Compensation identified" value={kpis?.compensation_identified_total} decimals={0} icon="check" prefix="₹" />
          <StatTile label="Lost to cancellations today" value={kpis?.lost_revenue_today} decimals={0} icon="x" prefix="₹" />
          <StatTile label="Average order value" value={aov} decimals={0} icon="layers" prefix="₹" />
        </div>
      </div>

      {/* minHeight, not minHeight:0 — flex:1 + minHeight:0 lets this
          section shrink to fit whatever's left after the KPI tiles above
          it, which on a shorter screen could be almost nothing (measured:
          90px, with the order rows themselves collapsing to 0px visible
          height) and the page never grows past the viewport to fall back
          on a real scrollbar, so the rest of the content is just gone
          with no way to reach it. A real minimum means the order list
          never gets crushed smaller than something usable — and once
          total content genuinely exceeds the viewport, this page's own
          overflow:auto (set above) kicks in as a normal, working
          scrollbar instead of silently vanishing content. */}
      <div className="dashboard-split" data-mobile-view={mobileView} style={{ flex: 1, minHeight: 420, display: "grid", gridTemplateColumns: "460px 1fr", gap: 16 }}>
        <div className="card elev-sm dashboard-list-pane" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-divider)", flex: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="seg" role="radiogroup" aria-label="Order filter" style={{ maxWidth: "100%", overflowX: "auto" }}>
              {TABS.map((t) => (
                <label key={t.key} className="seg-opt" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                  <input type="radio" name="ordertab" checked={tab === t.key} onChange={() => changeTab(t.key)} />
                  {t.label}
                  {orders && tab === t.key && <span style={{ opacity: 0.55, marginLeft: 4 }}>{orders.length}</span>}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className="tag tag-accent clickable"
                  style={{ gap: 5 }}
                  onClick={() => { setPlatformFilter("all"); setStatusFilter("all"); }}
                  title="Clear filters"
                >
                  Active filters {activeFilterCount}
                  <Icon name="x" size={9} />
                </button>
              )}
              <FilterDropdown label="Platform" value={platformFilter} options={platformOptions} onChange={setPlatformFilter} />
              <FilterDropdown label="Status" value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <OrderSearch />
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {orders === null && <div className="dim" style={{ padding: 16, fontSize: 13 }}>Loading…</div>}
            {orders && filteredOrders.length === 0 && (
              <div className="dim" style={{ padding: 16, fontSize: 13 }}>
                {orders.length === 0 ? "No orders in this view yet." : "No orders match these filters."}
              </div>
            )}
            {orders && filteredOrders.map((o) => (
              <OrderRow key={o.id} order={o} selected={o.id === selectedId} onClick={() => { setSelectedId(o.id); setMobileView("detail"); }} />
            ))}
          </div>
        </div>

        <div className="dashboard-detail-pane" style={{ display: "flex", minHeight: 0 }}>
          <OrderDetail order={selectedOrder} onSweep={runSweep} sweeping={sweeping} sweepError={sweepError} sweepResult={sweepResult} onBack={() => setMobileView("list")} />
        </div>
      </div>
    </div>
  );
}
