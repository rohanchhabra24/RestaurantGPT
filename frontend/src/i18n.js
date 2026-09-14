// Stage 3I: static UI localization. Deliberately separate from the
// Settings dialog's "Answer language" (English/Hindi/Hinglish — how the AI
// writes its prose, see synthesis.py's language-steering) — this is a pure
// display preference for the app's own chrome (nav, buttons, dialogs), so
// it's kept client-side (localStorage) rather than added to the
// restaurant_members schema. Only English and Hindi exist as UI locales —
// there's no separate "Hinglish UI", since Hinglish is a spoken/written
// register for answers, not how real apps localize menus and buttons.
//
// See docs/i18n-workflow.md for how to add a new translation key or
// extend coverage to another page — today's catalogs cover the nav bar
// and the chat page shell; everything else still renders in English
// regardless of this setting, by design (see that doc for why).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en/common.json";
import hi from "./locales/hi/common.json";

export const STORAGE_KEY = "rgpt-ui-lang";
export const SUPPORTED_LANGUAGES = ["en", "hi"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { common: en }, hi: { common: hi } },
    ns: ["common"],
    defaultNS: "common",
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

export default i18n;
