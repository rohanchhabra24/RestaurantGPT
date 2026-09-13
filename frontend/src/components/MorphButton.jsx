import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* A button whose icon swaps for a second one rather than sitting still —
   used where the icon itself can carry a state change (folder → open
   folder while browsing, upload → check once done) instead of needing a
   separate success message. `active` controls the swap explicitly (e.g.
   tied to a real completion state); omit it to swap on hover instead. */
export default function MorphButton({ iconA: IconA, iconB: IconB, label, active, onClick, disabled, primary = false, type = "button" }) {
  const [hovered, setHovered] = useState(false);
  const showB = active != null ? active : hovered;

  return (
    <motion.button
      type={type}
      className={`icon-morph-btn${primary ? " primary" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.96 }}
    >
      <span className="icon-morph-btn-icon">
        <AnimatePresence mode="popLayout" initial={false}>
          {!showB ? (
            <motion.span
              key="a"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 25 }}
              style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <IconA size={15} />
            </motion.span>
          ) : (
            <motion.span
              key="b"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 25 }}
              style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <IconB size={15} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span>{label}</span>
    </motion.button>
  );
}
