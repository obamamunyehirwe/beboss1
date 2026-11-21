import { Languages } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LANGS } from "@/lib/i18n-dict";
import { useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang, p } = useI18n();
  const current = LANGS.find((l) => l.code === lang);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="site-language-trigger" aria-label={p.common.changeLanguage}>
          <Languages />
          {current?.short}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => setLang(l.code)} className={l.code === lang ? "text-primary" : ""}>
            <span className="w-7 font-mono text-xs">{l.short}</span>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
