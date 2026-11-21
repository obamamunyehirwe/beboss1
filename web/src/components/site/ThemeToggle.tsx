import { Sun, Moon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { retailCopy } from "@/lib/i18n-dict";
export function ThemeToggle() {
  const { lang } = useI18n();
  return (
    <button
      className="theme-toggle"
      title={retailCopy[lang].theme}
      aria-label={retailCopy[lang].theme}
      onClick={() => {
        const root = document.documentElement;
        const dark = root.classList.toggle("dark");
        document.cookie = `beboss_theme=${dark ? "dark" : "light"}; Path=/; SameSite=Lax; Max-Age=31536000`;
      }}
    >
      <Moon className="theme-moon" />
      <Sun className="theme-sun" />
    </button>
  );
}
