import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Settings } from "lucide-react";
import { useAuth } from "../authContext.jsx";
import useClickOutside from "../hooks/useClickOutside.js";
import { getTheme, setTheme } from "../theme.js";
import { settingsApi } from "../api.js";

const LANGUAGE_OPTIONS = [
  { key: "english", label: "English" },
  { key: "hindi", label: "Hindi" },
  { key: "hinglish", label: "Hinglish" },
];

/* Settings menu item — the gear rotates 180° on hover rather than
   spinning continuously, so it reads as a control that responds to you
   rather than as decoration running on its own clock. */
function SettingsMenuItem({ onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      className="menu-item"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <motion.span
        style={{ display: "inline-flex" }}
        animate={{ rotate: hovered ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <Settings size={14} />
      </motion.span>
      Settings
    </button>
  );
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setThemeState] = useState(getTheme);
  const [language, setLanguage] = useState(null); // null = still loading
  const [languageSaving, setLanguageSaving] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);

  useEffect(() => {
    setTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (settingsOpen && language === null) {
      settingsApi.get().then((s) => setLanguage(s.response_language)).catch(() => setLanguage("english"));
    }
  }, [settingsOpen, language]);

  async function changeLanguage(next) {
    const prev = language;
    setLanguage(next);
    setLanguageSaving(true);
    try {
      await settingsApi.update(next);
    } catch {
      setLanguage(prev); // revert — the toggle shouldn't claim a change that didn't save
    } finally {
      setLanguageSaving(false);
    }
  }

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
            <SettingsMenuItem onClick={() => { setSettingsOpen(true); setOpen(false); }} />
            <button type="button" className="menu-item" onClick={signOut}>
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {settingsOpen && (
        <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="dialog" style={{ width: 380, maxWidth: "92vw" }}>
            <div className="dialog-title">Settings</div>
            <div className="dialog-body" style={{ gap: 14 }}>
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Account</div>
                <div style={{ fontSize: 14 }}>{user?.email}</div>
              </div>
              <div className="hr" />
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Appearance</div>
                <div className="seg" role="radiogroup" aria-label="Theme">
                  <label className="seg-opt" style={{ fontSize: 12.5 }}>
                    <input type="radio" name="theme" checked={theme === "dark"} onChange={() => setThemeState("dark")} />
                    Dark
                  </label>
                  <label className="seg-opt" style={{ fontSize: 12.5 }}>
                    <input type="radio" name="theme" checked={theme === "light"} onChange={() => setThemeState("light")} />
                    Light
                  </label>
                </div>
              </div>
              <div className="hr" />
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Answer language</div>
                <div className="seg" role="radiogroup" aria-label="Answer language">
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <label key={opt.key} className="seg-opt" style={{ fontSize: 12.5 }}>
                      <input
                        type="radio"
                        name="response-language"
                        checked={language === opt.key}
                        disabled={language === null || languageSaving}
                        onChange={() => changeLanguage(opt.key)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <p className="dim" style={{ fontSize: 11, margin: "6px 0 0", lineHeight: 1.5 }}>
                  Order numbers, amounts, and policy citations always come straight from your
                  data either way — only the wording around them changes.
                </p>
              </div>
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setSettingsOpen(false)}>Close</button>
              <button type="button" className="btn btn-primary" onClick={signOut}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
