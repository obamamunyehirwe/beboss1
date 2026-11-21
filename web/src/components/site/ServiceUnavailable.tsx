import { Link } from "@tanstack/react-router";
import { WifiOff, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { retailCopy, type TKey } from "@/lib/i18n-dict";
import { SiteLayout, PageHero } from "./SiteLayout";
export function ServiceUnavailable({ title = "navStatus" }: { title?: TKey }) {
  const { lang, t, p } = useI18n();
  return (
    <SiteLayout>
      <PageHero eyebrow="BEBOSS POS" title={t(title)} />
      <section className="retail-section">
        <div className="max-w-lg rounded-2xl border border-border bg-card p-7">
          <WifiOff className="mb-4 text-primary" />
          <p role="status" className="text-lg font-semibold">
            {retailCopy[lang].unavailable}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-5">
            <button onClick={() => window.location.reload()} className="action-primary">
              <RefreshCw />
              {p.common.tryAgain}
            </button>
            <Link to="/">{p.common.goHome}</Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
