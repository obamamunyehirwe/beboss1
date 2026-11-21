import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { retailCopy } from "@/lib/i18n-dict";

export function ThemeToggle() {
  const { lang } = useI18n();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const nextDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextDark);
    document.cookie = `beboss_theme=${nextDark ? "dark" : "light"}; Path=/; SameSite=Lax; Max-Age=31536000`;
    setDark(nextDark);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      title={retailCopy[lang].theme}
      aria-label={retailCopy[lang].theme}
      aria-pressed={dark}
      onClick={toggleTheme}
    >
      {dark ? <Sun className="theme-sun-active" /> : <Moon className="theme-moon-active" />}
    </button>
  );
}
