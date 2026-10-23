import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "./Icon.jsx";

const LUM_CARD_STYLE = { border: "var(--lum-border)", background: "var(--lum-bg)" };

export default function ForensicCardStack({ examples = [], activeIndex = 0, onSelect }) {
  // Rotate through 3 card depth slots: front (active), middle, back
  return (
    <div
      className="forensic-card-stack-root"
      style={{
        position: "relative",
        width: "100%",
        minHeight: 280,
        perspective: 1000,
      }}
    >
      {/* Ambient Glow */}
      <div
        className="pointer-events-none absolute -inset-6 rounded-3xl opacity-50 blur-[28px] [animation:rgpt-glow_6s_ease-in-out_infinite]"
        style={{
          background: "radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 32%, transparent), transparent 70%)",
        }}
      />

      {examples.map((item, index) => {
        // Calculate relative offset from active index
        const offset = (index - activeIndex + examples.length) % examples.length;
        const isFront = offset === 0;
        const isMiddle = offset === 1;
        const isBack = offset === 2;

        // Visual depth properties per slot
        const yOffset = isFront ? 0 : isMiddle ? 16 : 30;
        const scale = isFront ? 1 : isMiddle ? 0.95 : 0.90;
        const rotateZ = isFront ? 0 : isMiddle ? -2.5 : 2.5;
        const opacity = isFront ? 1 : isMiddle ? 0.65 : 0.35;
        const zIndex = isFront ? 30 : isMiddle ? 20 : 10;

        return (
          <motion.div
            key={item.question}
            onClick={() => onSelect(index)}
            animate={{
              y: yOffset,
              scale: scale,
              rotateZ: rotateZ,
              opacity: opacity,
              zIndex: zIndex,
            }}
            transition={{
              type: "spring",
              stiffness: 350,
              damping: 26,
            }}
            whileHover={
              !isFront
                ? {
                    scale: scale + 0.02,
                    opacity: opacity + 0.2,
                    cursor: "pointer",
                  }
                : {}
            }
            drag={isFront ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.x) > 60) {
                onSelect((activeIndex + 1) % examples.length);
              }
            }}
            style={{
              position: isFront ? "relative" : "absolute",
              top: 0,
              left: 0,
              right: 0,
              borderRadius: "var(--radius-lg)",
              padding: "18px 20px 20px",
              ...LUM_CARD_STYLE,
              boxShadow: isFront
                ? "0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)"
                : "0 10px 25px -10px rgba(0, 0, 0, 0.5)",
              cursor: isFront ? "grab" : "pointer",
              touchAction: "pan-y",
            }}
          >
            {/* Top Bar with Live Indicator */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#10b981",
                    boxShadow: "0 0 8px rgba(16, 185, 129, 0.8)",
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--color-text)",
                  }}
                >
                  Forensic Scenario 0{index + 1}
                </span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: "var(--radius-pill)",
                  background: isFront ? "rgba(145, 132, 217, 0.16)" : "transparent",
                  color: "var(--color-accent-200)",
                  border: "1px solid var(--color-divider)",
                }}
              >
                {isFront ? "Active Audit · Drag to swipe" : "Tap to inspect"}
              </span>
            </div>

            {/* Operator Question */}
            <div
              style={{
                borderRadius: "10px 10px 2px 10px",
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-divider)",
                padding: "10px 14px",
                fontSize: 13.5,
                fontWeight: 500,
                color: "var(--color-text)",
                marginBottom: 10,
                alignSelf: "flex-end",
              }}
            >
              {item.question}
            </div>

            {/* Verified Answer Bubble */}
            <div
              style={{
                borderRadius: "10px 10px 10px 2px",
                background: "color-mix(in srgb, var(--color-surface) 90%, black)",
                border: "1px solid var(--color-divider)",
                padding: "12px 14px",
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--color-text)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#10b981",
                  marginBottom: 6,
                }}
              >
                <Icon name="check" size={11} />
                Verified from Telemetry
              </div>
              <p style={{ margin: 0, color: "var(--color-text-dim)", fontSize: 13 }}>{item.answer}</p>

              {/* Citations */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {item.citations.map((c) => (
                  <span
                    key={c}
                    className="mono"
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "var(--color-surface-raised)",
                      border: "1px solid var(--color-divider)",
                      color: "var(--color-text)",
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
