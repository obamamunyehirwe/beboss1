import { ArrowRight, CheckCircle2, Clock3, CloudDownload, Database, Laptop, Smartphone } from "lucide-react";
import type { DesktopPreferences, RestorePreview } from "../lib/types";

type RestoreCopy = {
  eyebrow: string; title: string; lead: string; available: string; chunks: string; devices: string;
  records: string; sources: string; sourceAndroid: string; sourceDesktop: string; sourceOther: string;
  integrity: string; restore: string; restoring: string; notNow: string; lastVerified: string;
  noCharge: string; labels: Record<keyof RestorePreview["counts"], string>;
};
const COPY: Record<DesktopPreferences["language"], RestoreCopy> = {
  en: {
    eyebrow: "YOUR SHOP DATA IS READY", title: "Retrieve your shop workspace?",
    lead: "BeBoss found a complete, verified cloud snapshot from your registered shop devices. Review the records and retrieve the shared workspace on this desktop.",
    available: "records available", chunks: "verified chunks", devices: "source devices",
    records: "Records in this snapshot", sources: "Devices that supplied the snapshot",
    sourceAndroid: "Android terminal", sourceDesktop: "Desktop installation", sourceOther: "BeBoss terminal",
    integrity: "Every snapshot chunk is integrity-checked. Cloud records are merged using version clocks and deletion history; the existing phone data is not deleted or replaced by an empty desktop database.",
    restore: "Retrieve and open my shop", restoring: "Verifying and retrieving your shop…",
    notNow: "Not now — return to sign in", lastVerified: "Latest verified cloud snapshot",
    noCharge: "Device registration and any recurring device add-on were handled in the previous step. This data retrieval does not collect or change a payment.",
    labels: {
      products: "Products", customers: "Customers", sales: "Sales", saleItems: "Sale items",
      customerPayments: "Customer payments", purchases: "Purchases", stockTransfers: "Stock transfers",
      branches: "Branches", users: "Staff accounts"
    }
  },
  rw: {
    eyebrow: "AMAKURU Y'IDUKA ARITEGUYE", title: "Garura imikorere y'iduka ryawe?",
    lead: "BeBoss yabonye kopi yuzuye kandi yagenzuwe yo muri Cloud iturutse ku bikoresho by'iduka ryawe. Reba amakuru ahari maze uyagarure kuri iyi mudasobwa.",
    available: "amakuru ahari", chunks: "ibice byagenzuwe", devices: "ibikoresho byohereje",
    records: "Amakuru ari muri iyi kopi", sources: "Ibikoresho byatanze iyi kopi",
    sourceAndroid: "Igikoresho cya Android", sourceDesktop: "Mudasobwa", sourceOther: "Igikoresho cya BeBoss",
    integrity: "Buri gice cy'amakuru kiragenzurwa. Amakuru ahuzwa hakurikijwe verisiyo n'amateka y'ibyasibwe; amakuru yo kuri telefone ntasibwa cyangwa ngo asimburwe na mudasobwa irimo ubusa.",
    restore: "Garura amakuru ufungure iduka", restoring: "Turimo kugenzura no kugarura amakuru…",
    notNow: "Si ubu — subira kwinjira", lastVerified: "Kopi iheruka kwemezwa muri Cloud",
    noCharge: "Kwiyandikisha kw'igikoresho n'amafaranga yacyo ya buri kwezi byemejwe mu ntambwe ibanza. Kugarura aya makuru ntibikura amafaranga kandi ntibihindura ubwishyu.",
    labels: {
      products: "Ibicuruzwa", customers: "Abakiriya", sales: "Ibyagurishijwe", saleItems: "Ibicuruzwa byagurishijwe",
      customerPayments: "Ubwishyu bw'abakiriya", purchases: "Ibyaguzwe", stockTransfers: "Ihererekanya ry'ibintu",
      branches: "Amashami", users: "Abakozi"
    }
  },
  fr: {
    eyebrow: "LES DONNÉES DE VOTRE BOUTIQUE SONT PRÊTES", title: "Récupérer votre espace de travail ?",
    lead: "BeBoss a trouvé un instantané cloud complet et vérifié provenant des appareils de votre boutique. Consultez les éléments puis récupérez l'espace partagé sur cet ordinateur.",
    available: "enregistrements disponibles", chunks: "blocs vérifiés", devices: "appareils sources",
    records: "Données de cet instantané", sources: "Appareils ayant fourni l'instantané",
    sourceAndroid: "Terminal Android", sourceDesktop: "Ordinateur de bureau", sourceOther: "Terminal BeBoss",
    integrity: "Chaque bloc est vérifié. Les données sont fusionnées selon les versions et l'historique des suppressions ; les données du téléphone ne sont ni supprimées ni remplacées par une base vide.",
    restore: "Récupérer et ouvrir ma boutique", restoring: "Vérification et récupération en cours…",
    notNow: "Pas maintenant — revenir à la connexion", lastVerified: "Dernier instantané cloud vérifié",
    noCharge: "L'enregistrement de l'appareil et tout supplément mensuel ont été confirmés à l'étape précédente. Cette récupération ne prélève ni ne modifie aucun paiement.",
    labels: {
      products: "Produits", customers: "Clients", sales: "Ventes", saleItems: "Articles vendus",
      customerPayments: "Paiements clients", purchases: "Achats", stockTransfers: "Transferts de stock",
      branches: "Succursales", users: "Comptes du personnel"
    }
  },
  sw: {
    eyebrow: "DATA YA DUKA LAKO IKO TAYARI", title: "Rejesha sehemu ya kazi ya duka lako?",
    lead: "BeBoss imepata nakala kamili ya wingu iliyothibitishwa kutoka kwenye vifaa vilivyosajiliwa vya duka lako. Kagua rekodi kisha urejeshe sehemu ya kazi kwenye kompyuta hii.",
    available: "rekodi zinapatikana", chunks: "vipande vilivyothibitishwa", devices: "vifaa chanzo",
    records: "Rekodi katika nakala hii", sources: "Vifaa vilivyotoa nakala hii",
    sourceAndroid: "Kifaa cha Android", sourceDesktop: "Kompyuta", sourceOther: "Kifaa cha BeBoss",
    integrity: "Kila kipande cha nakala hukaguliwa uadilifu. Data huunganishwa kwa kutumia matoleo na historia ya ufutaji; data ya simu haifutwi wala kubadilishwa na hifadhidata tupu ya kompyuta.",
    restore: "Rejesha na ufungue duka langu", restoring: "Inathibitisha na kurejesha data…",
    notNow: "Sio sasa — rudi kuingia", lastVerified: "Nakala ya mwisho ya wingu iliyothibitishwa",
    noCharge: "Usajili wa kifaa na ada yoyote ya kila mwezi ilithibitishwa katika hatua iliyotangulia. Urejeshaji huu haukusanyi wala kubadilisha malipo.",
    labels: {
      products: "Bidhaa", customers: "Wateja", sales: "Mauzo", saleItems: "Bidhaa zilizouzwa",
      customerPayments: "Malipo ya wateja", purchases: "Manunuzi", stockTransfers: "Uhamisho wa bidhaa",
      branches: "Matawi", users: "Akaunti za wafanyakazi"
    }
  }
};
const RECORD_KEYS: Array<keyof RestorePreview["counts"]> = [
  "products", "customers", "sales", "saleItems", "customerPayments", "purchases",
  "stockTransfers", "branches", "users"
];
const formatCount = (value: number) => Math.max(0, Number(value) || 0).toLocaleString();
const LOCALES: Record<DesktopPreferences["language"], string> = { en: "en-RW", rw: "rw-RW", fr: "fr-FR", sw: "sw-KE" };
function formatSyncTime(value: number, language: DesktopPreferences["language"]) {
  return value
    ? new Intl.DateTimeFormat(LOCALES[language], { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "—";
}

export function DeviceRestorePrompt({ preview, theme, language, busy, error, onRestore, onNotNow }: {
  preview: RestorePreview;
  theme: DesktopPreferences["theme"];
  language: DesktopPreferences["language"];
  busy: boolean;
  error: string;
  onRestore: () => void;
  onNotNow: () => void;
}) {
  const t = COPY[language];
  return <main className="device-restore-shell" data-theme={theme}>
    <section className="device-restore-card" aria-labelledby="device-restore-title">
      <div className="device-restore-brand"><img src="/beboss-app-icon.png" alt="BeBoss" /><span>BeBoss · {t.eyebrow}</span></div>
      <div className="device-restore-icon"><CloudDownload size={26} /></div>
      <p className="device-restore-eyebrow">{t.eyebrow}</p>
      <h1 id="device-restore-title">{t.title}</h1>
      <p className="device-restore-lead">{t.lead}</p>
      <div className="device-restore-summary">
        <div><strong>{formatCount(preview.totalRecords)}</strong><span>{t.available}</span></div>
        <div><strong>{formatCount(preview.verifiedChunks)}</strong><span>{t.chunks}</span></div>
        <div><strong>{formatCount(preview.sourceDevices.length)}</strong><span>{t.devices}</span></div>
      </div>
      <div className="device-restore-section">
        <div className="device-restore-section-title"><Database size={16} /><strong>{t.records}</strong></div>
        <div className="device-restore-counts">{RECORD_KEYS.map((key) => <div key={key}><span>{t.labels[key]}</span><strong>{formatCount(preview.counts[key])}</strong></div>)}</div>
      </div>
      <div className="device-restore-section">
        <div className="device-restore-section-title"><Smartphone size={16} /><strong>{t.sources}</strong></div>
        <div className="device-restore-sources">{preview.sourceDevices.map(device => <div key={device.deviceId} className="device-restore-source">
          <span className="device-restore-source-icon">{device.platform === "DESKTOP" ? <Laptop size={17} /> : <Smartphone size={17} />}</span>
          <span className="device-restore-source-copy"><strong>{device.name}</strong><small>{device.platform === "ANDROID" ? t.sourceAndroid : device.platform === "DESKTOP" ? t.sourceDesktop : t.sourceOther}</small></span>
          <span className="device-restore-source-time"><Clock3 size={13} />{formatSyncTime(device.lastSyncedAt, language)}</span>
        </div>)}</div>
      </div>
      <div className="device-restore-integrity"><CheckCircle2 size={17} /><span>{t.integrity}</span></div>
      {error && <div className="device-restore-error" role="alert">{error}</div>}
      <div className="device-restore-actions">
        <button className="device-restore-primary" type="button" disabled={busy} onClick={onRestore}>{busy ? t.restoring : t.restore} <ArrowRight size={17} /></button>
        <button className="device-restore-secondary" type="button" disabled={busy} onClick={onNotNow}>{t.notNow}</button>
      </div>
      <p className="device-restore-billing">{t.noCharge}</p>
      <p className="device-restore-foot">{t.lastVerified} · {formatSyncTime(preview.snapshotUpdatedAt, language)}</p>
    </section>
  </main>;
}
