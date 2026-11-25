import { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, BarChart3, Boxes, Building2, CheckCircle2,
  Cloud, Cpu, CreditCard, Database, Globe2, Languages, Layers, LockKeyhole, Moon,
  Printer, ShieldCheck, ShoppingCart, Smartphone, Sparkles, Sun, TrendingUp, Wallet, Zap,
  Download, Menu, X, Monitor, HardDrive, Bell, Clock, Users, ChevronRight, Star
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

const WORKSPACE_TABS = [
  {
    id: "pos",
    label: "Point of Sale",
    icon: ShoppingCart,
    metricLabel: "CHECKOUT SPEED",
    metricValue: "1.4s avg",
    summary: "Fast barcode scan, split Cash / MoMo / Credit checkout, and instant 80mm ESC/POS thermal receipts with cryptographic verification seals.",
    bullets: ["Offline-first encrypted transaction queue", "Automatic stock deduction & margin tracking", "Print PDF, 80mm thermal, or shareable PNG receipt card"],
    previewTitle: "Counter #1 · Active Cart",
    previewBadge: "ESC/POS READY",
    previewRows: [
      { name: "Inyange Milk 1L × 4", meta: "Barcode 600124", val: "4,800 FRw", tone: "good" },
      { name: "Basmati Rice 5kg × 1", meta: "Stock 42 left", val: "11,500 FRw", tone: "good" },
      { name: "MTN MoMo Split", meta: "Instant seal #A8F2", val: "16,300 FRw", tone: "accent" }
    ]
  },
  {
    id: "debit",
    label: "Debit & Credit Desk",
    icon: Wallet,
    metricLabel: "COLLECTION VELOCITY",
    metricValue: "98.2% tracked",
    summary: "Control customer credit limits, aging buckets, partial settlements, debit adjustments, and one-click WhatsApp/SMS reminders from one live ledger.",
    bullets: ["Automated 0–7d, 8–30d, and 31+d overdue aging buckets", "Partial & full collections with receipt numbering", "Customer 360 statements & over-limit risk alerts"],
    previewTitle: "Receivables Aging · Live",
    previewBadge: "CREDIT GUARD",
    previewRows: [
      { name: "Kigali Catering Ltd", meta: "Utilization 82% · 6d", val: "410,000 FRw", tone: "warn" },
      { name: "Nyamirambo Mini-Mart", meta: "Over limit · Follow-up", val: "620,000 FRw", tone: "bad" },
      { name: "Payment Collected · MoMo", meta: "Receipt PAY-492018", val: "-150,000 FRw", tone: "good" }
    ]
  },
  {
    id: "inventory",
    label: "Inventory Control",
    icon: Boxes,
    metricLabel: "REORDER ALERTS",
    metricValue: "Live watch",
    summary: "Track every SKU, cost basis, supplier purchase, reorder threshold, and branch transfer with instant CSV import/export.",
    bullets: ["Low-stock badges across every branch", "Real-time inventory cost & retail valuation", "Supplier purchasing & automated margin tracking"],
    previewTitle: "Warehouse Stock Pulse",
    previewBadge: "AUTO-REORDER",
    previewRows: [
      { name: "Cooking Oil 5L", meta: "4 left · Threshold 10", val: "REORDER", tone: "bad" },
      { name: "Sugar 25kg Sack", meta: "28 in stock · Healthy", val: "HEALTHY", tone: "good" },
      { name: "Branch Transfer #TR-19", meta: "Main → Remera", val: "IN TRANSIT", tone: "warn" }
    ]
  },
  {
    id: "branches",
    label: "Multi-Branch Sync",
    icon: Building2,
    metricLabel: "SYNC ENGINE",
    metricValue: "HLC Merge",
    summary: "Coordinate Android POS terminals and desktop workstations across locations with signed snapshots and conflict-free HLC merging.",
    bullets: ["Inter-branch stock transfer requests & receipts", "Granular per-staff mobile & desktop permissions", "Zero-trust owner phone SMS verification"],
    previewTitle: "Branch Network Topology",
    previewBadge: "AES-256 SYNC",
    previewRows: [
      { name: "Main Branch · Kigali HQ", meta: "Desktop + 2 Android POS", val: "VERIFIED", tone: "good" },
      { name: "Remera Express", meta: "Android POS · Synced 12s", val: "ONLINE", tone: "good" },
      { name: "Signed Snapshot Chunks", meta: "Zero conflicts detected", val: "100% OK", tone: "accent" }
    ]
  },
  {
    id: "analytics",
    label: "Financial Reports",
    icon: TrendingUp,
    metricLabel: "GROSS MARGIN",
    metricValue: "Real-time",
    summary: "Monitor daily revenue, gross profit, receivables, top-moving products, and 7-day sales trends directly from your verified shop snapshot.",
    bullets: ["Live daily revenue & gross profit breakdown", "Payment method reconciliation (Cash, MoMo, Bank, Credit)", "Encrypted local backup & signed branch export"],
    previewTitle: "Executive Margin Telemetry",
    previewBadge: "LIVE KPI",
    previewRows: [
      { name: "Daily Gross Revenue", meta: "Up 18.4% vs last week", val: "1,485,000 FRw", tone: "good" },
      { name: "Net Gross Profit", meta: "28.6% average margin", val: "424,710 FRw", tone: "accent" },
      { name: "MoMo + Cash Ratio", meta: "64% Cash · 36% Digital", val: "BALANCED", tone: "good" }
    ]
  },
] as const;


function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".mx-reveal"));
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function Counter({ to, suffix = "", decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => { const p = Math.min(1, (now - start) / 1400); setValue(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

const MARQUEE = ["Point of sale", "Debit & credit desk", "Inventory control", "Multi-branch sync", "Staff permissions", "80mm thermal receipts", "MTN MoMo", "Encrypted offline", "Stock transfers", "Profit reports", "Customer 360", "Backups"];

export function LandingPage({
  language, theme, onLanguageChange, onThemeChange, onSignIn, onInstall
}: {
  language: DesktopLanguage;
  theme: DesktopPreferences["theme"];
  onLanguageChange: (value: DesktopLanguage) => void;
  onThemeChange: (value: DesktopPreferences["theme"]) => void;
  onSignIn: () => void;
  onInstall?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<(typeof WORKSPACE_TABS)[number]["id"]>("pos");
  const [tilt, setTilt] = useState({ rx: 8, ry: -14 });
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [section, setSection] = useState("top");
  const t = COPY[language];
  const isDark = theme !== "light";
  const currentTab = WORKSPACE_TABS.find((tab) => tab.id === activeTab) ?? WORKSPACE_TABS[0]!;
  const CurrentIcon = currentTab.icon;
  useReveal();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      const ids = ["top", "capabilities", "workspace", "debit", "install", "security"];
      let current = "top";
      for (const sid of ids) { const el = document.getElementById(sid); if (el && el.getBoundingClientRect().top < 140) current = sid; }
      setSection(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function move(event: React.MouseEvent<HTMLDivElement>) {
    const r = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - r.left) / r.width, py = (event.clientY - r.top) / r.height;
    setTilt({ rx: (0.5 - py) * 18, ry: (px - 0.5) * 24 });
  }

  const links = [
    { id: "capabilities", label: "Platform" },
    { id: "workspace", label: "Workspace" },
    { id: "debit", label: "Debit desk" },
    { id: "install", label: "Install" },
    { id: "security", label: "Security" }
  ];
  const go = (sid: string) => { setMenu(false); document.getElementById(sid)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <main className="mx-landing" data-mode={isDark ? "dark" : "light"}>
      <div className="mx-bg" aria-hidden="true"><i className="mx-orb a" /><i className="mx-orb b" /><i className="mx-orb c" /><div className="mx-grid" /></div>

      <header className={"mx-header" + (scrolled ? " scrolled" : "")}>
        <div className="mx-header-inner">
          <button className="mx-brand" onClick={() => go("top")} aria-label="BeBoss home">
            <span className="mx-brand-icon"><img src="/beboss-app-icon.png" alt="" /></span>
            <span><strong>BeBoss</strong><small>DESKTOP · v1.3</small></span>
          </button>
          <nav className="mx-nav" aria-label="Main navigation">
            {links.map((l) => <button key={l.id} className={section === l.id ? "active" : ""} onClick={() => go(l.id)}>{l.label}</button>)}
          </nav>
          <div className="mx-header-actions">
            <label className="mx-lang"><Languages size={14} />
              <select aria-label="Language" value={language} onChange={(e) => onLanguageChange(e.target.value as DesktopLanguage)}>
                <option value="en">EN</option><option value="rw">RW</option><option value="fr">FR</option><option value="sw">SW</option>
              </select>
            </label>
            <button className="mx-icon-btn" onClick={() => onThemeChange(isDark ? "light" : "dark")} aria-label={t.theme}>{isDark ? <Sun size={16} /> : <Moon size={16} />}</button>
            {onInstall && <button className="mx-btn ghost sm hide-sm" onClick={onInstall}><Download size={15} />Install</button>}
            <button className="mx-btn primary sm" onClick={onSignIn}>{t.signIn}<ArrowRight size={15} /></button>
            <button className="mx-icon-btn mx-burger" onClick={() => setMenu((v) => !v)} aria-label="Menu" aria-expanded={menu}>{menu ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </div>
        {menu && <div className="mx-mobile-menu">
          {links.map((l) => <button key={l.id} onClick={() => go(l.id)}>{l.label}<ChevronRight size={16} /></button>)}
          {onInstall && <button onClick={() => { setMenu(false); onInstall(); }}>Run installer<Download size={16} /></button>}
        </div>}
      </header>

      <section className="mx-hero" id="top">
        <div className="mx-hero-copy">
          <span className="mx-chip"><span className="mx-pulse" /><Sparkles size={13} /> {t.eyebrow}</span>
          <h1>{t.headline} <span className="mx-gradient-text">{t.accent}</span></h1>
          <p>{t.subtitle}</p>
          <div className="mx-cta-row">
            <button className="mx-btn primary lg" onClick={onSignIn}>{t.signIn}<ArrowRight size={18} /></button>
            {onInstall ? <button className="mx-btn ghost lg" onClick={onInstall}><Download size={17} />Install desktop app</button>
              : <button className="mx-btn ghost lg" onClick={() => go("workspace")}>{t.explore}<ArrowDownRight size={17} /></button>}
          </div>
          <div className="mx-trust"><ShieldCheck size={15} /> {t.trust}</div>
          <div className="mx-stats">
            <div><strong><Counter to={99.9} decimals={1} suffix="%" /></strong><span>Offline uptime</span></div>
            <div><strong><Counter to={1.4} decimals={1} suffix="s" /></strong><span>Avg checkout</span></div>
            <div><strong><Counter to={256} /></strong><span>AES-bit encryption</span></div>
            <div><strong><Counter to={4} /></strong><span>Languages</span></div>
          </div>
        </div>

        <div className="mx-scene" onMouseMove={move} onMouseLeave={() => setTilt({ rx: 8, ry: -14 })}>
          <div className="mx-ring r1" /><div className="mx-ring r2" />
          <div className="mx-stage" style={{ transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}>
            <div className="mx-device">
              <div className="mx-device-bar"><i /><i /><i /><span><span className="mx-pulse" /> {t.platform}</span></div>
              <div className="mx-device-body">
                <div className="mx-kpis">
                  <div><small>Revenue today</small><strong>FRw 1.28M</strong><em className="up">+18.4%</em></div>
                  <div><small>Gross margin</small><strong>28.6%</strong><em className="up">+2.1pt</em></div>
                  <div><small>Receivables</small><strong>FRw 224K</strong><em className="down">−6.2%</em></div>
                </div>
                <div className="mx-chart">{[38, 52, 44, 66, 58, 74, 62, 88, 70, 92, 81, 97].map((h, i) => <i key={i} style={{ height: h + "%", animationDelay: i * 70 + "ms" }} />)}</div>
                <div className="mx-rows">
                  <div><span className="dot g" />Inyange Milk 1L × 4<b>4,800</b></div>
                  <div><span className="dot o" />Credit · Eric Mugisha<b>32,000</b></div>
                  <div><span className="dot b" />MoMo split · #A8F2<b>16,300</b></div>
                </div>
              </div>
            </div>
            <div className="mx-float f1"><TrendingUp size={16} /><div><small>Live margin</small><strong>+28.6%</strong></div></div>
            <div className="mx-float f2"><Wallet size={16} /><div><small>Debit collected</small><strong>FRw 125,000</strong></div></div>
            <div className="mx-float f3"><Printer size={16} /><div><small>Receipt sealed</small><strong>BB-7F3A21</strong></div></div>
            <div className="mx-cube"><div className="fc front"><img src="/beboss-app-icon.png" alt="" /></div><div className="fc back" /><div className="fc right" /><div className="fc left" /><div className="fc top" /><div className="fc bottom" /></div>
          </div>
        </div>
      </section>

      <div className="mx-marquee" aria-hidden="true"><div>{[...MARQUEE, ...MARQUEE].map((m, i) => <span key={i}><Star size={12} />{m}</span>)}</div></div>

      <section className="mx-section" id="capabilities">
        <div className="mx-section-head mx-reveal"><span className="mx-eyebrow">{t.sectionEyebrow}</span><h2>{t.sectionTitle}</h2><p>{t.sectionBody}</p></div>
        <div className="mx-bento">
          {t.features.map((f, i) => { const Icon = FEATURE_ICONS[i] ?? Layers; return (
            <article key={f.title} className={"mx-card mx-reveal" + (i === 0 ? " wide" : "") + (i === 3 ? " tall" : "")} style={{ transitionDelay: i * 70 + "ms" }}>
              <span className="mx-card-icon"><Icon size={20} /></span><h3>{f.title}</h3><p>{f.body}</p>
              {i === 0 && <div className="mx-mini-bars">{[40, 64, 52, 80, 70, 95].map((h, k) => <i key={k} style={{ height: h + "%" }} />)}</div>}
            </article>); })}
        </div>
      </section>

      <section className="mx-section" id="workspace">
        <div className="mx-section-head mx-reveal"><span className="mx-eyebrow">INSIDE THE WORKSPACE</span><h2>Every desk your business runs on.</h2></div>
        <div className="mx-tabs mx-reveal">
          {WORKSPACE_TABS.map((tab) => { const Icon = tab.icon; return <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}><Icon size={15} />{tab.label}</button>; })}
        </div>
        <div className="mx-showcase mx-reveal" key={currentTab.id}>
          <div className="mx-showcase-copy">
            <span className="mx-card-icon"><CurrentIcon size={20} /></span>
            <small className="mx-eyebrow">{currentTab.metricLabel} · {currentTab.metricValue}</small>
            <h3>{currentTab.label}</h3><p>{currentTab.summary}</p>
            <ul>{currentTab.bullets.map((b) => <li key={b}><CheckCircle2 size={16} />{b}</li>)}</ul>
            <button className="mx-btn primary" onClick={onSignIn}>{t.signIn}<ArrowRight size={16} /></button>
          </div>
          <div className="mx-showcase-preview">
            <div className="mx-preview-head"><strong>{currentTab.previewTitle}</strong><span>{currentTab.previewBadge}</span></div>
            {currentTab.previewRows.map((row) => <div key={row.name} className={"mx-preview-row " + row.tone}><div><strong>{row.name}</strong><small>{row.meta}</small></div><b>{row.val}</b></div>)}
          </div>
        </div>
      </section>

      <section className="mx-section" id="debit">
        <div className="mx-split">
          <div className="mx-reveal">
            <span className="mx-eyebrow">DEBIT & CREDIT DESK</span>
            <h2>Know who owes you — and get paid faster.</h2>
            <p className="mx-lead">Credit limits, receivable aging, risk scores, promise-to-pay tracking, installment plans, WhatsApp/SMS reminders and full customer statements in one place.</p>
            <div className="mx-feature-list">
              <div><Clock size={17} /><span><strong>Aging buckets</strong>0–7, 8–30 and 31+ day exposure at a glance</span></div>
              <div><Bell size={17} /><span><strong>Smart reminders</strong>One-click WhatsApp and SMS follow-ups</span></div>
              <div><CreditCard size={17} /><span><strong>Installment plans</strong>Split balances into scheduled payments</span></div>
              <div><Users size={17} /><span><strong>Customer 360</strong>Every sale, payment and adjustment per customer</span></div>
            </div>
          </div>
          <div className="mx-debt-card mx-reveal">
            <div className="mx-preview-head"><strong>Receivables aging</strong><span>LIVE</span></div>
            {[{ l: "0–7 days", v: 72, a: "FRw 162,500", c: "g" }, { l: "8–30 days", v: 44, a: "FRw 42,000", c: "o" }, { l: "31+ days", v: 18, a: "FRw 20,000", c: "r" }].map((b) => <div key={b.l} className="mx-aging"><div><span>{b.l}</span><b>{b.a}</b></div><div className="track"><i className={b.c} style={{ width: b.v + "%" }} /></div></div>)}
            <div className="mx-debt-foot"><div><small>Recovery rate</small><strong><Counter to={86} suffix="%" /></strong></div><div><small>Promises due</small><strong><Counter to={7} /></strong></div><div><small>Risk accounts</small><strong><Counter to={2} /></strong></div></div>
          </div>
        </div>
      </section>

      <section className="mx-section" id="install">
        <div className="mx-section-head mx-reveal"><span className="mx-eyebrow">NATIVE DESKTOP · TAURI v2</span><h2>Installs like the tools you trust.</h2><p>A guided installer — licence, install location, components, shortcuts, then device verification — just like installing VS Code or Node.js.</p></div>
        <div className="mx-install mx-reveal">
          <div className="mx-install-steps">
            {[["Licence agreement", "Review and accept the BeBoss end-user licence."], ["Choose location", "Pick the install folder and see the disk space required."], ["Select components", "POS printer drivers, desktop shortcut, Start menu, auto-launch."], ["Install & verify", "Files are copied, the encrypted database is created and checked."]].map(([a, b], i) => <div key={a}><span>{i + 1}</span><div><strong>{a}</strong><small>{b}</small></div></div>)}
          </div>
          <div className="mx-install-card">
            <div className="mx-install-window"><div className="mx-device-bar"><i /><i /><i /><span>BeBoss Setup</span></div>
              <div className="mx-install-body"><HardDrive size={22} /><strong>Installing BeBoss Desktop 1.3.0</strong><small>Extracting: resources/app/sqlcipher.dll</small><div className="track"><i className="o anim" /></div></div>
            </div>
            <div className="mx-platforms"><span><Monitor size={15} />Windows 10/11</span><span><Cpu size={15} />macOS 12+</span><span><HardDrive size={15} />Ubuntu 22.04+</span></div>
            {onInstall && <button className="mx-btn primary lg full" onClick={onInstall}><Download size={18} />Run the setup wizard</button>}
          </div>
        </div>
      </section>

      <section className="mx-section" id="security">
        <div className="mx-security mx-reveal">
          <div className="mx-shield"><ShieldCheck size={34} /></div>
          <div><span className="mx-eyebrow">{t.ownerAccess.toUpperCase()}</span><h2>{t.footer}</h2>
            <div className="mx-pills"><span><LockKeyhole size={13} />SQLCipher AES-256</span><span><Smartphone size={13} />SMS owner verification</span><span><Database size={13} />Signed snapshots</span><span><Globe2 size={13} />EN · RW · FR · SW</span><span><Activity size={13} />Audit trail</span><span><Building2 size={13} />Multi-branch</span></div>
          </div>
          <button className="mx-btn primary lg" onClick={onSignIn}>{t.signIn}<ArrowRight size={18} /></button>
        </div>
      </section>

      <footer className="mx-footer"><span><img src="/beboss-app-icon.png" alt="" />BeBoss Desktop</span><small>© {new Date().getFullYear()} BeBoss · Retail operations platform</small></footer>
    </main>
  );
}
