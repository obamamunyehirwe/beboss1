import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DICTS, type Lang, type TKey } from "./i18n-dict";
import { PAGES, type PageCopy } from "./i18n-pages";

const STORAGE = "beboss.lang";

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
  /** Structured page copy (lists, steps, statuses) for the current language. */
  p: PageCopy;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE);
      if (saved && Object.prototype.hasOwnProperty.call(DICTS, saved)) {
        setLangState(saved as Lang);
      }
    } catch {
      // Continue with the default language when browser storage is unavailable.
    }
    const syncLanguage = (event: StorageEvent) => {
      if (event.key !== STORAGE) return;
      if (event.newValue && Object.prototype.hasOwnProperty.call(DICTS, event.newValue)) {
        setLangState(event.newValue as Lang);
      } else if (event.newValue === null) {
        setLangState("en");
      }
    };
    window.addEventListener("storage", syncLanguage);
    return () => window.removeEventListener("storage", syncLanguage);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang: (l) => {
        if (!Object.prototype.hasOwnProperty.call(DICTS, l)) return;
        setLangState(l);
        try {
          window.localStorage.setItem(STORAGE, l);
        } catch {
          // Keep the current selection for this session when storage is unavailable.
        }
      },
      t: (k) => DICTS[lang][k] ?? DICTS.en[k],
      p: PAGES[lang],
    }),
    [lang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useI18n must be used inside I18nProvider");
  return v;
}

/** For screens that may render outside the provider (root 404 / error pages). */
export function useStoredPageCopy(): PageCopy {
  const ctx = useContext(I18nContext);
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    if (ctx) return;
    try {
      const saved = window.localStorage.getItem(STORAGE);
      if (saved && Object.prototype.hasOwnProperty.call(PAGES, saved)) {
        setLang(saved as Lang);
      }
    } catch {
      setLang("en");
    }
    const syncLanguage = (event: StorageEvent) => {
      if (event.key !== STORAGE) return;
      if (event.newValue && Object.prototype.hasOwnProperty.call(PAGES, event.newValue)) {
        setLang(event.newValue as Lang);
      } else if (event.newValue === null) {
        setLang("en");
      }
    };
    window.addEventListener("storage", syncLanguage);
    return () => window.removeEventListener("storage", syncLanguage);
  }, [ctx]);
  return ctx ? ctx.p : PAGES[lang];
}
