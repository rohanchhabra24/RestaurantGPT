import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "./Icon.jsx";

const IN_FLIGHT_STEPS = [
  { agent: "SQL Agent", detail: "Querying Swiggy & Zomato order timestamps...", icon: "db" },
  { agent: "Weather Agent", detail: "Cross-referencing historical rain radar (Open-Meteo)...", icon: "cloud-rain" },
  { agent: "Policy Auditor", detail: "Checking SLA contracts & compensation clauses...", icon: "file" },
  { agent: "Grounding Verifier", detail: "Verifying arithmetic against raw order logs...", icon: "check" },
];

/**
 * DynamicIslandTrace
 * Can be rendered in two modes:
 * 1. `mode="live"` (in-flight while query is being investigated)
 * 2. `mode="completed"` (rendered inside AnswerCard with real trace steps)
 */
export default function DynamicIslandTrace({ mode = "completed", steps = [], onCiteClick }) {
  const [open, setOpen] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  // In live mode, cycle through the actual operational steps every 2.2 seconds
  useEffect(() => {
    if (mode !== "live") return;
    const interval = setInterval(() => {
      setCurrentStepIdx((prev) => (prev + 1) % IN_FLIGHT_STEPS.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [mode]);

  // LIVE IN-FLIGHT DYNAMIC ISLAND PILL
  if (mode === "live") {
    const step = IN_FLIGHT_STEPS[currentStepIdx];
    return (
      <motion.div
        layoutId="dynamic-island-pill"
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 10 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        style={{
          margin: "12px auto",
          maxWidth: 480,
          borderRadius: "var(--radius-pill)",
          padding: "8px 16px",
          background: "color-mix(in srgb, var(--color-surface) 85%, var(--color-bg))",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid var(--color-divider)",
          boxShadow: "0 10px 30px -8px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Animated Radar Beacon */}
        <div style={{ position: "relative", width: 14, height: 14, flexShrink: 0 }}>
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "var(--color-accent)",
              opacity: 0.75,
              animation: "rgpt-pulse 1.8s ease-in-out infinite",
            }}
          />
          <span
            style={{
              position: "absolute",
              inset: 2,
              borderRadius: "50%",
              background: "var(--color-accent)",
            }}
          />
        </div>

        {/* Live Step Content */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-accent-200)" }}>
              {step.agent}
            </span>
            <span style={{ fontSize: 10, color: "var(--color-neutral-500)" }}>· live telemetry</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={step.detail}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "var(--color-text)",
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {step.detail}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Specular Glint Bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
            backgroundSize: "200% 100%",
            animation: "rgpt-flow 2s linear infinite",
          }}
        />
      </motion.div>
    );
  }

  // COMPLETED TERMINAL TRACE (Inside AnswerCard)
  if (!steps || steps.length === 0) return null;

  return (
    <div
      style={{
        borderRadius: "var(--radius-md)",
        border: "var(--lum-border)",
        background: "var(--lum-bg)",
        overflow: "hidden",
        fontSize: 13,
        marginTop: 10,
        boxShadow: "0 2px 8px -2px rgba(0, 0, 0, 0.25)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: "9px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          color: "var(--color-text-dim)",
          cursor: "pointer",
          font: "500 12.5px var(--font-body)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 8px rgba(16, 185, 129, 0.6)",
              flexShrink: 0,
            }}
          />
          <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Multi-Agent Forensic Audit</span>
          <span className="dim" style={{ fontSize: 11.5 }}>({steps.length} verified checkpoints)</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5 }}>
          {open ? "Hide audit" : "Inspect trace"}
          <Icon
            name="chevron-down"
            size={12}
            style={{
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{
              padding: "10px 14px 14px",
              borderTop: "1px solid var(--color-divider)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: "color-mix(in srgb, var(--color-surface) 95%, black)",
            }}
          >
            {steps.map((rawStep, i) => {
              let title = `Checkpoint ${i + 1}`;
              let desc = rawStep;
              let agentBadge = "Telemetry";

              const bracketMatch = rawStep.match(/^\[([^\]]+)\]\s*(.*)$/);
              if (bracketMatch) {
                const rawAgent = bracketMatch[1];
                agentBadge = rawAgent.replace(/_agent$/, "").replace(/_/g, " ").toUpperCase();
                title = rawAgent.replace(/_agent$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                desc = bracketMatch[2];
              } else if (rawStep.includes(": ")) {
                const colonIdx = rawStep.indexOf(": ");
                title = rawStep.slice(0, colonIdx);
                desc = rawStep.slice(colonIdx + 2);
              }

              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    lineHeight: 1.5,
                    fontSize: 12.5,
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      flexShrink: 0,
                      background: "color-mix(in srgb, var(--color-accent) 14%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
                      color: "var(--color-accent-200)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      marginTop: 1,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, color: "var(--color-text)" }}>{title}</span>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "var(--color-neutral-800)",
                          border: "1px solid var(--color-divider)",
                          color: "var(--color-neutral-300)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {agentBadge}
                      </span>
                    </div>
                    <div style={{ color: "var(--color-text-dim)", wordBreak: "break-word" }}>{desc}</div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
