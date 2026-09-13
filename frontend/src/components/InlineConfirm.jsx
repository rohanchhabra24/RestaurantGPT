import { useEffect, useRef, useState } from "react";
import { X, Check, Undo2 } from "lucide-react";
import Icon from "./Icon.jsx";

/* Inspired by bencho.dev's GlassKit Confirm (its own repo/CSS weren't
   reachable from this sandbox to port verbatim — the interaction below
   is rebuilt from the pattern the card describes: the button becomes
   its own inline dialog rather than opening a modal or a browser
   confirm(), and undo lives in the same footprint on a burn-down timer
   instead of a separate toast).

   Three phases, and the parent owns what each one *means*:
   - idle    → the plain delete icon.
   - asking  → a tap widens it into a yes/no pair, still under the cursor
               that asked.
   - done    → onConfirm fires immediately (the parent marks the row as
               "going away" — e.g. dims it — but does NOT delete yet);
               an undo affordance with a burning-down bar takes over,
               and either onUndo (bar clicked) or onCommit (bar runs out)
               fires next. onCommit is where the real, irreversible
               action — the actual API call — belongs. */
export default function InlineConfirm({ onConfirm, onCommit, onUndo, undoMs = 4000, label = "Delete" }) {
  const [phase, setPhase] = useState("idle");
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function ask(e) {
    e.preventDefault();
    e.stopPropagation();
    setPhase("asking");
  }

  function cancelAsk(e) {
    e.preventDefault();
    e.stopPropagation();
    setPhase("idle");
  }

  function confirm(e) {
    e.preventDefault();
    e.stopPropagation();
    setPhase("done");
    onConfirm?.();
    timer.current = window.setTimeout(() => {
      // Reset first: if the parent doesn't unmount this row (e.g. the
      // real delete failed and it stays visible), it shouldn't be stuck
      // showing a dead "Undo" that no longer undoes anything real.
      setPhase("idle");
      onCommit?.();
    }, undoMs);
  }

  function undo(e) {
    e.preventDefault();
    e.stopPropagation();
    window.clearTimeout(timer.current);
    setPhase("idle");
    onUndo?.();
  }

  return (
    <div className="inline-confirm" data-phase={phase}>
      <div className="inline-confirm-row">
        {phase === "idle" && (
          <button type="button" className="inline-confirm-btn danger" aria-label={label} onClick={ask}>
            <Icon name="x" size={12} />
          </button>
        )}
        {phase === "asking" && (
          <>
            <button type="button" className="inline-confirm-btn danger" aria-label={`Confirm ${label.toLowerCase()}`} onClick={confirm}>
              <Check size={13} />
            </button>
            <button type="button" className="inline-confirm-btn" aria-label="Cancel" onClick={cancelAsk}>
              <X size={13} />
            </button>
          </>
        )}
        {phase === "done" && (
          <button type="button" className="inline-confirm-undo" onClick={undo}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Undo2 size={11} />Undo
            </span>
          </button>
        )}
      </div>
      {phase === "done" && (
        <span className="inline-confirm-burn" style={{ animationDuration: `${undoMs}ms` }} />
      )}
    </div>
  );
}
