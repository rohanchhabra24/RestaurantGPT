import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Icon from "./Icon.jsx";

export default function CommandPalette({ open, onClose, onOpenUpload, onRunSweep }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const items = useMemo(() => [
    {
      group: "Navigation",
      id: "nav-dash",
      label: "Go to Dashboard",
      sub: "Delivery operations, revenue & SLA breaches",
      icon: "gauge",
      action: () => navigate("/dashboard"),
    },
    {
      group: "Navigation",
      id: "nav-chat",
      label: "Ask RestaurantGPT (Chat)",
      sub: "Query orders, investigate root causes, check policies",
      icon: "chat",
      action: () => navigate("/"),
    },
    {
      group: "Navigation",
      id: "nav-sources",
      label: "Data Sources & Ingestion",
      sub: "Live aggregator feeds, CSV backfills, indexed documents",
      icon: "db",
      action: () => navigate("/sources"),
    },
    {
      group: "Navigation",
      id: "nav-diagnoses",
      label: "Anomaly Diagnoses",
      sub: "Proactive delivery spikes & statistical deviation scan",
      icon: "alert",
      action: () => navigate("/diagnoses"),
    },
    {
      group: "Navigation",
      id: "nav-traces",
      label: "Audit Traces & Log",
      sub: "Full routing traces, verified SQL queries, pipeline latency",
      icon: "route",
      action: () => navigate("/traces"),
    },
    {
      group: "Actions",
      id: "act-sweep",
      label: "Run Compensation Sweep",
      sub: "Audit delayed orders and draft recoverable claims",
      icon: "check",
      action: () => {
        if (onRunSweep) onRunSweep();
        else navigate("/dashboard?sweep=1");
      },
    },
    {
      group: "Actions",
      id: "act-upload",
      label: "Upload Order CSV or Policy Document",
      sub: "Import new data into vector search & orders table",
      icon: "upload",
      action: () => {
        if (onOpenUpload) onOpenUpload();
      },
    },
    {
      group: "Preferences",
      id: "act-theme",
      label: "Toggle Dark / Light Theme",
      sub: "Switch UI appearance mode",
      icon: "sparkle",
      action: () => {
        const cur = document.documentElement.dataset.theme;
        const next = cur === "light" ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("rgpt-theme", next); } catch (e) {}
      },
    },
  ], [navigate, onOpenUpload, onRunSweep]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      item.sub.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
      onClose();
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-backdrop" style={{ zIndex: 998, backdropFilter: "blur(12px)" }} />
        <DialogPrimitive.Content
          className="dialog elev-lg"
          aria-describedby={undefined}
          style={{
            position: "fixed",
            top: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(92vw, 560px)",
            padding: 0,
            overflow: "hidden",
            zIndex: 999,
            background: "var(--color-surface)",
            border: "1px solid var(--color-divider)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "0 24px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)",
          }}
          onKeyDown={handleKeyDown}
        >
          <DialogPrimitive.Title className="sr-only" style={{ display: "none" }}>Command Palette</DialogPrimitive.Title>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 18px",
              borderBottom: "1px solid var(--color-divider)",
              background: "rgba(255, 255, 255, 0.02)",
            }}
          >
            <Icon name="search" size={17} style={{ color: "var(--color-neutral-400)", flex: "none" }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search commands, navigate or run actions..."
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                color: "var(--color-text)",
                fontSize: 14.5,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <span
              className="tag tag-neutral mono"
              style={{ fontSize: 11, padding: "2px 7px", cursor: "pointer" }}
              onClick={onClose}
            >
              ESC
            </span>
          </div>

          <div style={{ maxHeight: 340, overflowY: "auto", padding: "8px 6px" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-neutral-500)", fontSize: 13 }}>
                No commands matching "{query}"
              </div>
            ) : (
              filtered.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    onClick={() => { item.action(); onClose(); }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "9px 12px",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      background: isSelected ? "var(--color-accent-900)" : "transparent",
                      color: isSelected ? "var(--color-accent-100)" : "var(--color-text)",
                      border: isSelected ? "1px solid rgba(145, 132, 217, 0.3)" : "1px solid transparent",
                      transition: "all 0.1s ease",
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "none",
                        background: isSelected ? "var(--color-accent-800)" : "var(--color-surface-raised)",
                        color: isSelected ? "var(--color-accent-200)" : "var(--color-neutral-400)",
                      }}
                    >
                      <Icon name={item.icon} size={15} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: isSelected ? 600 : 500 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 11.5, color: isSelected ? "var(--color-accent-200)" : "var(--color-text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.sub}
                      </div>
                    </div>
                    <span className="dim mono" style={{ fontSize: 11, flex: "none", textTransform: "uppercase" }}>
                      {item.group}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              borderTop: "1px solid var(--color-divider)",
              background: "rgba(255, 255, 255, 0.015)",
              fontSize: 11.5,
              color: "var(--color-neutral-400)",
            }}
          >
            <div style={{ display: "flex", gap: 14 }}>
              <span><kbd style={{ padding: "2px 5px", borderRadius: 4, background: "var(--color-surface-raised)", border: "1px solid var(--color-divider)" }}>↑↓</kbd> Navigate</span>
              <span><kbd style={{ padding: "2px 5px", borderRadius: 4, background: "var(--color-surface-raised)", border: "1px solid var(--color-divider)" }}>↵</kbd> Select</span>
            </div>
            <span>RestaurantGPT Command Bar</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
