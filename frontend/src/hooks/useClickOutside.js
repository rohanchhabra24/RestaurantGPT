import { useEffect } from "react";

// Closes a popover (avatar menu, notifications) on an outside click or Escape.
export default function useClickOutside(ref, onClose, active) {
  useEffect(() => {
    if (!active) return;
    function handlePointer(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [ref, onClose, active]);
}
