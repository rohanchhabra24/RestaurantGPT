import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Icon from "./Icon.jsx";

const LUM_CARD_STYLE = { border: "var(--lum-border)", background: "var(--lum-bg)" };

export default function ForensicCardStack({ examples = [], activeIndex = 0, onSelect }) {
  const [direction, setDirection] = useState(0);

  function prevSlide() {
    setDirection(-1);
    onSelect((activeIndex - 1 + examples.length) % examples.length);
  }

  function nextSlide() {
    setDirection(1);
    onSelect((activeIndex + 1) % examples.length);
  }

  const current = examples[activeIndex] || examples[0] || {};

  const slideVariants = {
    enter: (dir) => ({
      x: dir >= 0 ? 40 : -40,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir) => ({
      x: dir >= 0 ? -40 : 40,
      opacity: 0,
    }),
  };

  return (
    <div className="relative w-full">
      {/* Ambient Glow */}
      <div
        className="pointer-events-none absolute -inset-6 rounded-3xl opacity-40 blur-[28px]"
        style={{
          background: "radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 28%, transparent), transparent 70%)",
        }}
      />

      {/* Main Slide Card */}
      <div
        className="relative overflow-hidden rounded-[var(--radius-lg)] p-5 sm:p-6"
        style={{
          ...LUM_CARD_STYLE,
          minHeight: 280,
          boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)",
        }}
      >
        {/* Top Control Bar: Title + Indicators + Arrow Controls */}
        <div
          className="flex items-center justify-between gap-3 mb-4 pb-3"
          style={{ borderBottom: "1px solid var(--color-divider)" }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)]">
              Forensic Scenario {String(activeIndex + 1).padStart(2, "0")}
            </span>
            <span className="text-[11px] text-[var(--color-text-dim)]">/ {String(examples.length).padStart(2, "0")}</span>
          </div>

          {/* Controls: Prev, Next & Scenario Indicator Pills */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-2">
              {examples.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setDirection(i > activeIndex ? 1 : -1);
                    onSelect(i);
                  }}
                  className="h-1.5 rounded-full transition-all cursor-pointer"
                  style={{
                    width: i === activeIndex ? 18 : 6,
                    background: i === activeIndex ? "var(--color-accent)" : "var(--color-divider)",
                  }}
                  aria-label={`Go to scenario ${i + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous scenario"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-divider)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:border-[var(--color-neutral-400)] transition-colors cursor-pointer"
              style={{ background: "color-mix(in srgb, var(--color-surface) 60%, transparent)" }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next scenario"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-divider)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:border-[var(--color-neutral-400)] transition-colors cursor-pointer"
              style={{ background: "color-mix(in srgb, var(--color-surface) 60%, transparent)" }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Sliding Card Content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={activeIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeOut" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x < -40) {
                nextSlide();
              } else if (info.offset.x > 40) {
                prevSlide();
              }
            }}
            className="flex flex-col gap-3"
          >
            {/* Operator Prompt */}
            <div
              className="rounded-lg p-3 text-sm font-medium border border-[var(--color-divider)] text-[var(--color-text)] self-end max-w-[90%]"
              style={{ background: "var(--color-surface-raised)" }}
            >
              {current.question}
            </div>

            {/* Verified Answer Bubble */}
            <div
              className="rounded-lg p-3.5 border border-[var(--color-divider)] text-[var(--color-text)]"
              style={{ background: "color-mix(in srgb, var(--color-surface) 90%, black)" }}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">
                <Icon name="check" size={12} />
                Verified from Telemetry
              </div>
              <p className="m-0 text-sm leading-relaxed text-[var(--color-text-dim)]">{current.answer}</p>

              {/* Citations */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {current.citations?.map((c) => (
                  <span
                    key={c}
                    className="font-mono text-xs px-2 py-0.5 rounded border border-[var(--color-divider)] text-[var(--color-text)]"
                    style={{ background: "var(--color-surface-raised)" }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
