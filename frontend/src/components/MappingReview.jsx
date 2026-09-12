import { useState } from "react";

// Every restaurant/POS system exports order data with different column
// names, units, and status vocabulary — the backend's Data Mapper proposes
// a mapping via LLM, but nothing gets inserted until it's reviewed here.
// Overriding a row falls back to a plain rename (kind: "direct"); leaving
// it alone keeps whatever the LLM proposed (which may be a computed
// timestamp difference, a currency parse, or a status value_map — richer
// than a simple rename, so overriding is opt-in, not the default).

const TARGET_LABELS = {
  aggregator_order_id: "Order ID",
  placed_at: "Order placed at",
  zone: "Zone / area",
  platform: "Platform",
  status: "Status",
  total_amount: "Order amount",
  prep_time_seconds: "Prep time",
  delivery_time_seconds: "Delivery time",
  cancellation_reason: "Cancellation reason",
  weather_flag: "Weather flag",
};

const REQUIRED_TARGETS = new Set(["aggregator_order_id", "placed_at"]);

function describeMapping(m) {
  switch (m.kind) {
    case "direct":
      return m.source ? `From "${m.source}"` : "Not mapped";
    case "direct_currency":
      return `From "${m.source}" (currency)`;
    case "direct_scaled":
      return `From "${m.source}" (in ${m.unit})`;
    case "timestamp_diff":
      return `Computed: "${m.end_source}" minus "${m.start_source}"`;
    case "not_present":
      return "Not found in this file";
    default:
      return "";
  }
}

export default function MappingReview({ headers, sampleRows, proposedMapping, onConfirm, onCancel, busy }) {
  const [overrides, setOverrides] = useState({});

  function setOverride(target, value) {
    setOverrides((prev) => ({ ...prev, [target]: value }));
  }

  function buildFinalMapping() {
    return proposedMapping.map((m) => {
      if (!(m.target in overrides)) return m;
      const chosen = overrides[m.target];
      return chosen ? { target: m.target, kind: "direct", source: chosen } : { target: m.target, kind: "not_present" };
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
        We matched your columns automatically — review before importing. Only Order ID and Order placed at are required;
        anything else left unmapped just comes through blank.
      </p>

      <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
        <table className="table" style={{ fontSize: 12.5 }}>
          <thead>
            <tr><th>Field</th><th>Detected mapping</th><th>Override</th></tr>
          </thead>
          <tbody>
            {proposedMapping.map((m) => (
              <tr key={m.target}>
                <td>
                  {TARGET_LABELS[m.target] || m.target}
                  {REQUIRED_TARGETS.has(m.target) && <span style={{ color: "var(--color-danger)" }}> *</span>}
                </td>
                <td className="dim">{describeMapping(m)}</td>
                <td>
                  <select
                    className="input"
                    style={{ fontSize: 12, padding: "4px 8px", width: "100%" }}
                    value={overrides[m.target] ?? (m.kind === "direct" ? m.source || "" : "")}
                    onChange={(e) => setOverride(m.target, e.target.value)}
                  >
                    <option value="">— not present —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sampleRows?.length > 0 && (
        <div>
          <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
            Sample rows from your file
          </div>
          <div style={{ overflow: "auto", maxHeight: 120, border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
            <table className="table" style={{ fontSize: 11 }}>
              <thead>
                <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {sampleRows.map((r, i) => (
                  <tr key={i}>
                    {headers.map((h) => <td key={h} className="mono">{String(r[h] ?? "")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => onConfirm(buildFinalMapping())} disabled={busy}>
          {busy ? "Importing…" : "Confirm & Import"}
        </button>
      </div>
    </div>
  );
}
