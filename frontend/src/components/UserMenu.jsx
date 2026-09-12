import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../authContext.jsx";
import useClickOutside from "../hooks/useClickOutside.js";

function initialsFor(email) {
  if (!email) return "?";
  const local = email.split("@")[0];
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="avatar" onClick={() => setOpen((v) => !v)} aria-label="Account menu" title={user?.email}>
        {initialsFor(user?.email)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="menu-popover"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
          >
            <div className="menu-popover-header">{user?.email}</div>
            <button type="button" className="menu-item" onClick={signOut}>
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
