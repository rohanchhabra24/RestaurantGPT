import { useState } from "react";

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom range" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// One shared control for the whole dashboard rather than a dropdown per
// tile — every number on the page needs to agree on what time window it's
// showing, otherwise "Revenue: this week" next to "Orders: today" reads as
// two different dashboards, not one.
export default function TimeRangeFilter({ range, customFrom, customTo, onChange }) {
  const [draftFrom, setDraftFrom] = useState(customFrom || todayISO());
  const [draftTo, setDraftTo] = useState(customTo || todayISO());
  const [pickerOpen, setPickerOpen] = useState(false);

  function selectPreset(key) {
    if (key === "custom") {
      setPickerOpen(true);
      return;
    }
    setPickerOpen(false);
    onChange({ range: key });
  }

  function applyCustom() {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return;
    setPickerOpen(false);
    onChange({ range: "custom", from: draftFrom, to: draftTo });
  }

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <div className="seg" role="radiogroup" aria-label="Time range">
        {PRESETS.map((p) => (
          <label key={p.key} className="seg-opt" style={{ fontSize: 12.5 }}>
            <input
              type="radio"
              name="dashboard-range"
              checked={range === p.key}
              onChange={() => selectPreset(p.key)}
            />
            {p.key === "custom" && range === "custom" ? `${customFrom} → ${customTo}` : p.label}
          </label>
        ))}
      </div>

      {pickerOpen && (
        <div
          className="card elev-lg"
          style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 30, padding: 16, gap: 10, width: 260 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="dim" style={{ fontSize: 11 }}>From</label>
            <input type="date" className="input" value={draftFrom} max={draftTo} onChange={(e) => setDraftFrom(e.target.value)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="dim" style={{ fontSize: 11 }}>To</label>
            <input type="date" className="input" value={draftTo} min={draftFrom} max={todayISO()} onChange={(e) => setDraftTo(e.target.value)} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12.5 }} onClick={() => setPickerOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={applyCustom}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
