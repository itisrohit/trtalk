// i18n foundation — react-i18next with JSON locales (the React analog of
// Rails' config/locales/*.yml). HARD RULE: no hardcoded UI strings — every
// user-visible literal goes through t().
//
// Locale resolution: localStorage (the header switcher) → VITE_DEFAULT_LOCALE
// (.env, wizard-able in Sprint 6) → "en".
import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"

import en from "./locales/en.json"
import es from "./locales/es.json"

export const SUPPORTED_LOCALES = ["en", "es"] as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: import.meta.env.VITE_DEFAULT_LOCALE || "en",
    supportedLngs: [...SUPPORTED_LOCALES],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      // The header switcher persists to localStorage; no navigator sniffing —
      // the deployment's default locale is an explicit operator choice.
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: "admin_locale",
    },
  })

export default i18n
