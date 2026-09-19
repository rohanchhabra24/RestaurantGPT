import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../authContext.jsx";
import useClickOutside from "../hooks/useClickOutside.js";
import { getTheme, setTheme } from "../theme.js";
import { settingsApi, api } from "../api.js";

// Language *names* stay as their own autonym regardless of which UI
// language is active — a picker translating "Hindi" into the current UI
// language instead of showing "हिंदी" would defeat the point of a language
// picker (a reader who can't read the current UI language still needs to
// recognize their own language's name in it).
const LANGUAGE_OPTIONS = [
  { key: "english", label: "English" },
  { key: "hindi", label: "हिंदी" },
  { key: "hinglish", label: "Hinglish" },
];

// Stage 3I — separate from LANGUAGE_OPTIONS above (that's the AI's answer
// language). Only English/Hindi exist as UI locales; see i18n.js for why
// there's no "Hinglish UI".
const APP_LANGUAGE_OPTIONS = [
  { key: "en", label: "English" },
  { key: "hi", label: "हिंदी" },
];

/* Settings menu item — the gear rotates 180° on hover rather than
   spinning continuously, so it reads as a control that responds to you
   rather than as decoration running on its own clock. */
function SettingsMenuItem({ onClick }) {
  const { t } = useTranslation();
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
      {t("settings.title")}
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
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setThemeState] = useState(getTheme);
  const [language, setLanguage] = useState(null); // null = still loading
  const [languageSaving, setLanguageSaving] = useState(false);
  const [city, setCity] = useState(null); // null = still loading; "" = loaded, unset
  const [cityDraft, setCityDraft] = useState("");
  const [citySaving, setCitySaving] = useState(false);
  const [cityError, setCityError] = useState(null);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);

  useEffect(() => {
    setTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (settingsOpen && language === null) {
      settingsApi.get().then((s) => {
        setLanguage(s.response_language);
        setCity(s.city || "");
        setCityDraft(s.city || "");
      }).catch(() => { setLanguage("english"); setCity(""); });
    }
  }, [settingsOpen, language]);

  async function changeLanguage(next) {
    const prev = language;
    setLanguage(next);
    setLanguageSaving(true);
    try {
      await settingsApi.update({ response_language: next });
      if (next !== prev) api.track("answer_language_changed", { to: next });
    } catch {
      setLanguage(prev); // revert — the toggle shouldn't claim a change that didn't save
    } finally {
      setLanguageSaving(false);
    }
  }

  async function saveCity(e) {
    e.preventDefault();
    setCitySaving(true);
    setCityError(null);
    try {
      const { city: saved } = await settingsApi.update({ city: cityDraft.trim() });
      setCity(saved || "");
      setCityDraft(saved || "");
    } catch (err) {
      setCityError(err.message || "Couldn't save — please try again.");
    } finally {
      setCitySaving(false);
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
              {t("settings.signOut")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {settingsOpen && createPortal(
        // Portaled to <body> — UserMenu renders from inside Topbar.jsx,
        // which has backdrop-filter, and per spec that makes it a
        // containing block for position:fixed descendants. Without this,
        // .dialog-backdrop's "fixed, full viewport" would actually be
        // relative to the 56px-tall topbar instead of the real viewport.
        <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="dialog" style={{ width: 380, maxWidth: "92vw" }}>
            <div className="dialog-title">{t("settings.title")}</div>
            <div className="dialog-body" style={{ gap: 14 }}>
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{t("settings.account")}</div>
                <div style={{ fontSize: 14 }}>{user?.email}</div>
              </div>
              <div className="hr" />
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>{t("settings.appearance")}</div>
                <div className="seg" role="radiogroup" aria-label={t("settings.appearance")}>
                  <label className="seg-opt" style={{ fontSize: 12.5 }}>
                    <input type="radio" name="theme" checked={theme === "dark"} onChange={() => setThemeState("dark")} />
                    {t("settings.themeDark")}
                  </label>
                  <label className="seg-opt" style={{ fontSize: 12.5 }}>
                    <input type="radio" name="theme" checked={theme === "light"} onChange={() => setThemeState("light")} />
                    {t("settings.themeLight")}
                  </label>
                </div>
              </div>
              <div className="hr" />
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>{t("settings.appLanguage")}</div>
                <div className="seg" role="radiogroup" aria-label={t("settings.appLanguage")}>
                  {APP_LANGUAGE_OPTIONS.map((opt) => (
                    <label key={opt.key} className="seg-opt" style={{ fontSize: 12.5 }}>
                      <input
                        type="radio"
                        name="app-language"
                        checked={i18n.resolvedLanguage === opt.key}
                        onChange={() => i18n.changeLanguage(opt.key)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <p className="dim" style={{ fontSize: 11, margin: "6px 0 0", lineHeight: 1.5 }}>
                  {t("settings.appLanguageHelp")}
                </p>
              </div>
              <div className="hr" />
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>{t("settings.answerLanguage")}</div>
                <div className="seg" role="radiogroup" aria-label={t("settings.answerLanguage")}>
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
                  {t("settings.answerLanguageHelp")}
                </p>
              </div>
              <div className="hr" />
              <div>
                <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>{t("settings.restaurantLocation")}</div>
                <form onSubmit={saveCity} style={{ display: "flex", gap: 6 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder={t("settings.restaurantLocationPlaceholder")}
                    value={cityDraft}
                    disabled={city === null}
                    onChange={(e) => setCityDraft(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn btn-secondary"
                    disabled={city === null || citySaving || cityDraft.trim() === (city || "")}
                  >
                    {citySaving ? t("settings.saving") : t("settings.save")}
                  </button>
                </form>
                {cityError && <div className="tag tag-danger" style={{ marginTop: 6 }}>{cityError}</div>}
                <p className="dim" style={{ fontSize: 11, margin: "6px 0 0", lineHeight: 1.5 }}>
                  {t("settings.restaurantLocationHelp")}
                </p>
              </div>
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setSettingsOpen(false)}>{t("settings.close")}</button>
              <button type="button" className="btn btn-primary" onClick={signOut}>{t("settings.signOut")}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
