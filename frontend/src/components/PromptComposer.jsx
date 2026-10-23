import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "./Icon.jsx";

const OPERATOR_PILLS = [
  { id: "rain", label: "🌧️ Rain SLA", query: "Which Zone 3 cancellations qualify for rain SLA compensation?" },
  { id: "rider", label: "🛵 Rider Delay", query: "Why did delivery times spike in Zone 5 this week?" },
  { id: "claims", label: "💰 Unclaimed Claims", query: "Check all recoverable compensation claims from yesterday." },
  { id: "speed", label: "⚡ Swiggy vs Zomato", query: "Compare average delivery times between Swiggy and Zomato last week." },
];

export default function PromptComposer({ draft, setDraft, onSend, sending, placeholder }) {
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea to fit content smoothly up to 160px
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function handleMouseMove(e) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending && draft?.trim()) {
        onSend(draft.trim());
      }
    }
  }

  function handlePillClick(query) {
    setDraft(query);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }

  const hasContent = Boolean(draft?.trim());

  return (
    <div className="prompt-composer-wrapper" style={{ width: "100%", maxWidth: 840, margin: "0 auto" }}>
      {/* Quick Operator Pills */}
      <div
        className="prompt-pills-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "none",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-neutral-500)",
            flexShrink: 0,
            marginRight: 2,
          }}
        >
          Quick queries:
        </span>
        {OPERATOR_PILLS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handlePillClick(p.query)}
            disabled={sending}
            className="prompt-pill-btn"
            style={{
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: "var(--radius-pill)",
              background: "color-mix(in srgb, var(--color-surface) 80%, transparent)",
              border: "1px solid var(--color-divider)",
              color: "var(--color-text-dim)",
              cursor: sending ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent)";
              e.currentTarget.style.color = "var(--color-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-divider)";
              e.currentTarget.style.color = "var(--color-text-dim)";
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Halo Specular Container */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        style={{
          position: "relative",
          borderRadius: "var(--radius-md)",
          padding: 1,
          background: isFocused
            ? `radial-gradient(400px circle at ${mousePos.x}% ${mousePos.y}%, var(--color-accent), var(--color-divider) 50%, transparent 100%)`
            : "var(--lum-border)",
          transition: "background 0.2s ease",
          boxShadow: isFocused ? "0 8px 30px -10px rgba(145, 132, 217, 0.25)" : "none",
        }}
      >
        <div
          style={{
            position: "relative",
            background: "var(--color-surface)",
            borderRadius: "calc(var(--radius-md) - 1px)",
            padding: "12px 14px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Multiline Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || "Ask anything about orders, cancellations, weather SLA, or claims..."}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--color-text)",
              fontSize: 14,
              lineHeight: 1.5,
              resize: "none",
              fontFamily: "var(--font-body)",
              padding: 0,
              minHeight: 24,
              maxHeight: 160,
              overflowY: "auto",
            }}
          />

          {/* Action Row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 6,
              borderTop: "1px solid color-mix(in srgb, var(--color-divider) 60%, transparent)",
            }}
          >
            {/* Operator Safety Badges */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: "var(--color-neutral-400)",
                }}
              >
                <Icon name="check" size={11} style={{ color: "var(--color-accent)" }} />
                Order & Policy Grounded
              </span>
              <span
                className="desktop-only-hint"
                style={{
                  fontSize: 11,
                  color: "var(--color-neutral-500)",
                }}
              >
                ↵ to send · Shift+↵ newline
              </span>
            </div>

            {/* Morphing Send Button */}
            <motion.button
              type="button"
              disabled={sending || !hasContent}
              onClick={() => hasContent && !sending && onSend(draft.trim())}
              whileTap={{ scale: 0.94 }}
              animate={{
                scale: hasContent ? 1 : 0.96,
                backgroundColor: hasContent ? "var(--color-accent)" : "var(--color-surface-raised)",
                color: hasContent ? "#ffffff" : "var(--color-neutral-500)",
              }}
              transition={{ duration: 0.15 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--color-divider)",
                cursor: hasContent && !sending ? "pointer" : "not-allowed",
                fontWeight: 600,
                fontSize: 12.5,
                boxShadow: hasContent ? "0 4px 14px -3px rgba(145, 132, 217, 0.45)" : "none",
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {sending ? (
                  <motion.span
                    key="sending"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Icon name="clock" size={13} className="animate-spin" />
                    <span>Auditing...</span>
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span>Investigate</span>
                    <Icon name="send" size={12} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
