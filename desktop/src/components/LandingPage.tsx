import {
  ArrowDownRight, ArrowRight, BarChart3, Boxes, Building2,
  Cloud, Languages, LockKeyhole, Moon, ShieldCheck, Smartphone, Sun, Zap
} from "lucide-react";
import type { DesktopLanguage } from "../lib/i18n";
import type { DesktopPreferences } from "../lib/types";

type Copy = {
  eyebrow: string; headline: string; accent: string; subtitle: string;
  signIn: string; explore: string; trust: string; platform: string;
  sectionEyebrow: string; sectionTitle: string; sectionBody: string;
  features: { title: string; body: string }[];
  footer: string; ownerAccess: string; theme: string;
};
const COPY: Record<DesktopLanguage, Copy> = {
  en: {
    eyebrow: "THE BUSINESS, IN ONE PLACE",
    headline: "Bring every part of your business",
    accent: "into clear view.",
    subtitle: "A capable desktop workspace for sales, stock, customers, teams and branches — connected to your BeBoss shop and built to keep working when the internet does not.",
    signIn: "Sign in to your shop", explore: "Explore the workspace",
    trust: "Owner access protected by registered-phone verification",
    platform: "BE BOSS · RETAIL OPERATIONS",
    sectionEyebrow: "ONE CONNECTED WORKSPACE",
    sectionTitle: "The tools your operation actually uses.",
    sectionBody: "Work with your shop's synchronized records, not sample figures. Your access is verified before any business data is opened.",
    features: [
      { title: "Sales and purchasing", body: "Record sales, manage receipts, track purchases and follow customer balances." },
      { title: "Inventory control", body: "Maintain your catalogue, stock levels, reorder attention and product history." },
      { title: "People and locations", body: "Manage branches, enrolled POS devices, staff roles and available permissions." },
      { title: "Business intelligence", body: "Review sales, gross profit, receivables and shop performance from synchronized records." },
      { title: "Encrypted offline work", body: "Keep supported changes in the encrypted local database and durable sync outbox." },
      { title: "Sync and recovery", body: "Inspect synchronization, verify snapshots and use encrypted backup and restore workflows." }
    ],
    footer: "Your shop data stays behind owner authentication.",
    ownerAccess: "Secure owner access", theme: "Appearance"
  },
  rw: {
    eyebrow: "UBUCURUZI BWAWE AHANTU HAMWE",
    headline: "Reba ibikorwa byose by'ubucuruzi",
    accent: "mu buryo busobanutse.",
    subtitle: "Ahantu ho gukorera kuri mudasobwa hacunga ibicuruzwa, ububiko, abakiriya, abakozi n'amashami — hahujwe na BeBoss kandi hakomeza gukora n'igihe internet itariho.",
    signIn: "Injira mu iduka ryawe", explore: "Reba ibikoresho bihari",
    trust: "Kwinjira k'umuyobozi birindwa no kugenzura telefone yanditse",
    platform: "BE BOSS · IMICUNGIRE Y'UBUCURUZI",
    sectionEyebrow: "AHANTU HAMWE HO GUKORERA",
    sectionTitle: "Ibikoresho ubucuruzi bukenera.",
    sectionBody: "Koresha amakuru y'iduka ryawe yahujwe, si imibare y'icyitegererezo. Uburenganzira bwawe buragenzurwa mbere yo gufungura amakuru.",
    features: [
      { title: "Kugurisha no kugura", body: "Andika ibyagurishijwe, ucunge inyemezabwishyu, ugure kandi ukurikirane imyenda y'abakiriya." },
      { title: "Imicungire y'ububiko", body: "Cunga ibicuruzwa, ingano isigaye, ibikeneye kongerwa n'amateka yabyo." },
      { title: "Abakozi n'amashami", body: "Cunga amashami, ibikoresho bya POS byemewe, inshingano z'abakozi n'uburenganzira." },
      { title: "Isesengura ry'ubucuruzi", body: "Reba ibicuruzwa byagurishijwe, inyungu, imyenda n'imikorere ukoresheje amakuru yahujwe." },
      { title: "Gukora offline birinzwe", body: "Impinduka zemewe zibikwa muri database irinzwe n'umurongo utegereje guhuza." },
      { title: "Guhuza no kugarura amakuru", body: "Genza ihuzwa, wemeze snapshots kandi ukoreshe uburyo bwo kubika no kugarura amakuru." }
    ],
    footer: "Amakuru y'iduka arindwa no kwemeza umuyobozi.",
    ownerAccess: "Kwinjira k'umuyobozi kurinzwe", theme: "Imigaragarire"
  },
  fr: {
    eyebrow: "TOUTE L'ACTIVITÉ, AU MÊME ENDROIT",
    headline: "Gardez toute votre activité",
    accent: "clairement en vue.",
    subtitle: "Un espace de travail sur ordinateur pour les ventes, les stocks, les clients, les équipes et les succursales — connecté à votre boutique BeBoss et conçu pour continuer à fonctionner hors ligne.",
    signIn: "Se connecter à votre boutique", explore: "Découvrir l'espace de travail",
    trust: "Accès propriétaire protégé par vérification du téléphone enregistré",
    platform: "BE BOSS · GESTION COMMERCIALE",
    sectionEyebrow: "UN ESPACE DE TRAVAIL CONNECTÉ",
    sectionTitle: "Les outils utiles à vos opérations.",
    sectionBody: "Travaillez sur les données synchronisées de votre boutique, pas sur des chiffres fictifs. Votre accès est vérifié avant toute ouverture des données.",
    features: [
      { title: "Ventes et achats", body: "Enregistrez les ventes, gérez les reçus, suivez les achats et les soldes clients." },
      { title: "Gestion des stocks", body: "Gérez le catalogue, les niveaux de stock, les réapprovisionnements et l'historique." },
      { title: "Équipes et succursales", body: "Gérez les succursales, les terminaux POS inscrits, les rôles et les autorisations." },
      { title: "Analyse commerciale", body: "Consultez les ventes, la marge brute, les créances et les performances à partir des données synchronisées." },
      { title: "Travail hors ligne chiffré", body: "Conservez les modifications prises en charge dans la base locale chiffrée et la file de synchronisation." },
      { title: "Synchronisation et récupération", body: "Inspectez la synchronisation, vérifiez les instantanés et utilisez les sauvegardes chiffrées." }
    ],
    footer: "Les données de votre boutique restent protégées par l'authentification du propriétaire.",
    ownerAccess: "Accès propriétaire sécurisé", theme: "Apparence"
  },
  sw: {
    eyebrow: "BIASHARA YAKO, MAHALI PAMOJA",
    headline: "Ona kila sehemu ya biashara",
    accent: "kwa uwazi zaidi.",
    subtitle: "Sehemu ya kazi ya kompyuta ya mauzo, bidhaa, wateja, timu na matawi — imeunganishwa na duka lako la BeBoss na inaweza kuendelea kufanya kazi bila intaneti.",
    signIn: "Ingia kwenye duka lako", explore: "Chunguza sehemu ya kazi",
    trust: "Ufikiaji wa mmiliki unalindwa kwa uthibitisho wa simu iliyosajiliwa",
    platform: "BE BOSS · UENDESHAJI WA BIASHARA",
    sectionEyebrow: "SEHEMU MOJA ILIYOUNGANISHWA",
    sectionTitle: "Zana za shughuli zako za kila siku.",
    sectionBody: "Tumia rekodi halisi zilizosawazishwa za duka lako, si takwimu za mfano. Ufikiaji wako unathibitishwa kabla ya data kufunguliwa.",
    features: [
      { title: "Mauzo na manunuzi", body: "Rekodi mauzo, simamia risiti, fuatilia manunuzi na salio la wateja." },
      { title: "Udhibiti wa bidhaa", body: "Simamia orodha ya bidhaa, viwango vya akiba na bidhaa zinazohitaji kuongezwa." },
      { title: "Wafanyakazi na matawi", body: "Simamia matawi, vifaa vya POS vilivyosajiliwa, majukumu na ruhusa." },
      { title: "Uchambuzi wa biashara", body: "Chunguza mauzo, faida ghafi, madeni na utendaji kwa rekodi zilizosawazishwa." },
      { title: "Kazi fiche bila intaneti", body: "Hifadhi mabadiliko yanayotumika katika hifadhidata fiche na foleni ya kusawazisha." },
      { title: "Usawazishaji na urejeshaji", body: "Kagua usawazishaji, thibitisha snapshots na tumia nakala fiche za kurejesha." }
    ],
    footer: "Data ya duka lako inalindwa nyuma ya uthibitishaji wa mmiliki.",
    ownerAccess: "Ufikiaji salama wa mmiliki", theme: "Mwonekano"
  }
};

const FEATURE_ICONS = [BarChart3, Boxes, Building2, Zap, LockKeyhole, Cloud];

export function LandingPage({
  language, theme, onLanguageChange, onThemeChange, onSignIn
}: {
  language: DesktopLanguage;
  theme: DesktopPreferences["theme"];
  onLanguageChange: (value: DesktopLanguage) => void;
  onThemeChange: (value: DesktopPreferences["theme"]) => void;
  onSignIn: () => void;
}) {
  const t = COPY[language];
  const isDark = theme === "dark";
  return (
    <main className="landing-screen" data-mode={theme}>
      <div className="landing-atmosphere" aria-hidden="true"><i /><b /><span /></div>
      <header className="landing-header">
        <a className="landing-brand" href="#top" aria-label="BeBoss home">
          <img src="/beboss-app-icon.png" alt="" />
          <span><strong>BeBoss</strong><small>DESKTOP</small></span>
        </a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#capabilities">{t.sectionTitle}</a>
          <a href="#security">{t.ownerAccess}</a>
        </nav>
        <div className="landing-header-actions">
          <label className="landing-language" title="Language">
            <Languages size={15} />
            <select aria-label="Language" value={language} onChange={(event) => onLanguageChange(event.target.value as DesktopLanguage)}>
              <option value="en">EN</option><option value="rw">RW</option><option value="fr">FR</option><option value="sw">SW</option>
            </select>
          </label>
          <button className="landing-theme" onClick={() => onThemeChange(isDark ? "light" : "dark")} aria-label={t.theme} title={t.theme}>
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="landing-login landing-login-small" onClick={onSignIn}>{t.signIn}<ArrowRight size={15} /></button>\n          <button className="landing-admin-entry" type="button" onClick={onOpenAdmin}><ShieldCheck size={14} />Master Admin</button>
        </div>
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow"><span />{t.eyebrow}</span>
          <h1>{t.headline}<em>{t.accent}</em></h1>
          <p>{t.subtitle}</p>
          <div className="landing-hero-actions">
            <button className="landing-login" onClick={onSignIn}>{t.signIn}<ArrowRight size={17} /></button>
            <a className="landing-explore" href="#capabilities">{t.explore}<ArrowDownRight size={17} /></a>
          </div>
          <div className="landing-assurance"><ShieldCheck size={16} /><span>{t.trust}</span></div>
        </div>
        <div className="landing-hero-visual" aria-label="BeBoss retail workspace">
          <div className="landing-visual-orbit landing-orbit-one" />
          <div className="landing-visual-orbit landing-orbit-two" />
          <div className="landing-glass-panel">
            <div className="landing-visual-top"><span className="landing-live-dot" />{t.platform}<span className="landing-visual-version">DESKTOP</span></div>
            <div className="landing-photo-frame">
              <img src="/Friendly Modern Store Checkout.png" alt="Modern retail checkout" />
              <div className="landing-photo-shade" />
              <div className="landing-photo-brand"><img src="/beboss-app-logo.png" alt="BeBoss" /></div>
              <div className="landing-photo-wordmark"><img src="/beboss-wordmark-light.png" alt="BeBoss" /></div>
            </div>
            <div className="landing-visual-bottom">
              <span><LockKeyhole size={14} />SQLCipher local storage</span>
              <span><Cloud size={14} />Owner-authorized cloud sync</span>
            </div>
          </div>
          <div className="landing-float-card landing-float-card-a"><span><ShieldCheck size={15} /></span><div><strong>Protected workspace</strong><small>Verified owner access</small></div></div>
          <div className="landing-float-card landing-float-card-b"><span><Smartphone size={15} /></span><div><strong>Connected operations</strong><small>Mobile + desktop</small></div></div>
        </div>
      </section>

      <section className="landing-capabilities" id="capabilities">
        <div className="landing-section-heading">
          <div><span className="landing-eyebrow">{t.sectionEyebrow}</span><h2>{t.sectionTitle}</h2></div>
          <p>{t.sectionBody}</p>
        </div>
        <div className="landing-feature-grid">
          {t.features.map((feature, index) => {
            const Icon = FEATURE_ICONS[index];
            return <article className="landing-feature" key={feature.title}>
              <span className="landing-feature-icon"><Icon size={20} /></span>
              <span className="landing-feature-number">0{index + 1}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>;
          })}
        </div>
      </section>

      <section className="landing-security" id="security">
        <div className="landing-security-symbol"><LockKeyhole size={23} /></div>
        <div><span className="landing-eyebrow">{t.ownerAccess}</span><strong>{t.footer}</strong></div>
        <button className="landing-security-action" onClick={onSignIn}>{t.signIn}<ArrowRight size={16} /></button>
      </section>
      <footer className="landing-footer"><span>© {new Date().getFullYear()} BeBoss Retail Operations</span><span>{t.platform}</span></footer>
    </main>
  );
}
