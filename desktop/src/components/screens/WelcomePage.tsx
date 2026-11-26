import { Activity, ArrowRight, ArrowUpRight, BarChart3, Building2, CreditCard, Megaphone, Package, RefreshCw, ShieldCheck, ShoppingCart, Smartphone, Truck, Users, Wallet, Zap } from "lucide-react";
import { money, n, rows, s } from "../../lib/format";
import type { CloudState, NavKey, Row, Snapshot } from "../../lib/types";
import type { DesktopLanguage } from "../../lib/i18n";
import { PageHeading, SalesTable, StatCard, StatusPill } from "../ui";

type WelcomeCopy = {
  greeting: [string, string, string];
  eyebrow: string; description: string; newSale: string; notices: string; noticeHeading: string;
  verified: string; pending: string; offline: string; welcomeTo: string; shopFallback: string;
  welcomeBody: string; overview: string; management: string; retailEyebrow: string; retailTitle: string;
  retailBody: string; pointOfSale: string; team: string; signedSnapshot: string; syncMode: string;
  offlineQueue: string; connected: string; branches: string; terminals: string; lastSnapshot: string; noSnapshot: string;
  revenue: string; revenueSub: string; grossProfit: string; profitSub: string; products: string; productSub: string;
  customers: string; receivables: string; quickAccess: string; continueWork: string; allAreas: string;
  shortcuts: { sale: [string, string]; inventory: [string, string]; reports: [string, string]; staff: [string, string]; branches: [string, string]; billing: [string, string] };
  latestActivity: string; recentSales: string; ledger: string; attention: string; lowStock: string; lowStockSub: string;
  openTransfers: string; transferSub: string; subscription: string; subscriptionSub: string; cloudSync: string;
  offlineSyncSub: string; syncSub: string; workspace: string; fromSavedSales: string; reorderItems: string;
  branchCount: string; terminalCount: string; statusPending: string; statusVerified: string;
};

const WELCOME_COPY: Record<DesktopLanguage, WelcomeCopy> = {
  en: {
    greeting: ["Good morning", "Good afternoon", "Good evening"], eyebrow: "YOUR RETAIL WORKSPACE",
    description: "Your business workspace is ready. Review today's performance or jump straight into an operation.",
    newSale: "New sale", notices: "BEBOSS NOTICES", noticeHeading: "Updates for your shop",
    verified: "CLOUD SNAPSHOT VERIFIED", pending: "CLOUD VERIFICATION PENDING", offline: "OFFLINE · LOCAL DATA",
    welcomeTo: "Welcome to", shopFallback: "your BeBoss shop",
    welcomeBody: "One workspace for point of sale, inventory, people, branches, finance and secure cross-device operations.",
    overview: "Business overview", management: "Management center", retailEyebrow: "THE CONNECTED RETAIL WORKSPACE",
    retailTitle: "Run every part of your shop from one clear view.",
    retailBody: "Sales, stock, customer balances, people and branches work together with BeBoss Cloud and encrypted offline recovery.",
    pointOfSale: "Open point of sale", team: "Manage your team", signedSnapshot: "Signed snapshot", syncMode: "Sync mode",
    offlineQueue: "Offline queue", connected: "Connected", branches: "Active branches", terminals: "Active terminals",
    lastSnapshot: "Last snapshot", noSnapshot: "No cloud snapshot timestamp yet", revenue: "Today's revenue",
    revenueSub: "From recorded sales today", grossProfit: "Today's gross profit", profitSub: "Saved sale cost basis",
    products: "Active products", productSub: "at or below reorder level", customers: "Customer accounts",
    receivables: "outstanding credit", quickAccess: "QUICK ACCESS", continueWork: "Continue with your work",
    allAreas: "All management areas", shortcuts: {
      sale: ["Start a sale", "Open checkout and issue a receipt"],
      inventory: ["Manage inventory", "Products, stock adjustments and reorder levels"],
      reports: ["Review performance", "Revenue, margin and sales reports"],
      staff: ["Manage your team", "Staff roles, assignments and access status"],
      branches: ["Manage branches", "Locations and operating targets"],
      billing: ["Subscription & payments", "Plan status, payment claims and renewals"],
    },
    latestActivity: "LATEST ACTIVITY", recentSales: "Recent sales", ledger: "Open ledger",
    attention: "Items needing attention", lowStock: "Low-stock products", lowStockSub: "At or below configured threshold",
    openTransfers: "Open stock transfers", transferSub: "Awaiting receipt or completion",
    subscription: "Subscription status", subscriptionSub: "Managed by verified billing records",
    cloudSync: "Cloud synchronization", offlineSyncSub: "Local transactions are waiting to upload",
    syncSub: "Open sync and integrity diagnostics", workspace: "CONNECTED WORKSPACE",
    fromSavedSales: "From saved sales", reorderItems: "Items at reorder level",
    branchCount: "branches", terminalCount: "terminals", statusPending: "PENDING", statusVerified: "VERIFIED",
  },
  rw: {
    greeting: ["Mwaramutse", "Mwiriwe", "Mwiriwe neza"], eyebrow: "AHO UCUCUNGIRA UBUCURUZI",
    description: "Ahantu ho gukorera hariteguye. Reba uko ubucuruzi bwifashe uyu munsi cyangwa uhite ukora igikorwa.",
    newSale: "Gurisha", notices: "AMATANGAZO YA BEBOSS", noticeHeading: "Amakuru y'iduka ryawe",
    verified: "AMAKURU YO MURI CLOUD YAGENZUWE", pending: "IGENZURA RYA CLOUD RIRACYATEGEREJWE", offline: "NTA INTERNET · AMAKURU YO KURI IKI GICURUZWA",
    welcomeTo: "Murakaza neza kuri", shopFallback: "iduka ryawe rya BeBoss",
    welcomeBody: "Ahantu hamwe ho kugurishiriza, gucunga ububiko, abantu, amashami, imari n'ibikoresho bihujwe mu mutekano.",
    overview: "Incamake y'ubucuruzi", management: "Imicungire y'ubucuruzi", retailEyebrow: "AHO UBUCURUZI BUHURIYE",
    retailTitle: "Cunga ibikorwa byose by'iduka ryawe ahantu hamwe.",
    retailBody: "Ibyagurishijwe, ububiko, imyenda y'abakiriya, abakozi n'amashami bikorana na BeBoss Cloud hamwe no kugarura amakuru arinzwe.",
    pointOfSale: "Fungura aho kugurishiriza", team: "Cunga abakozi", signedSnapshot: "Amakuru yemejwe",
    syncMode: "Uburyo bwo guhuza", offlineQueue: "Impinduka zitegereje", connected: "Birahujwe",
    branches: "Amashami akora", terminals: "Ibikoresho bikora", lastSnapshot: "Iheruka kubikwa",
    noSnapshot: "Nta gihe cy'amakuru ya Cloud kiraboneka", revenue: "Amafaranga yinjiye uyu munsi",
    revenueSub: "Ayavuye mu byo mwagurishije", grossProfit: "Inyungu mbumbe uyu munsi",
    profitSub: "Yabaruwe ku bicuruzwa byagurishijwe", products: "Ibicuruzwa bikora",
    productSub: "Biri munsi cyangwa ku rugero rwo kongera", customers: "Konti z'abakiriya",
    receivables: "umwenda utarishyurwa", quickAccess: "IBIKORWA BYIHUSE", continueWork: "Komeza imirimo yawe",
    allAreas: "Ibice byose by'imicungire", shortcuts: {
      sale: ["Tangira igurisha", "Fungura aho kugurishiriza utange inyemezabwishyu"],
      inventory: ["Cunga ububiko", "Ibicuruzwa, ivugurura ry'ibipimo n'ibisabwa kongerwa"],
      reports: ["Reba imikorere", "Amafaranga yinjiye, inyungu na raporo z'igurisha"],
      staff: ["Cunga abakozi", "Inshingano, aho bakorera n'uburenganzira"],
      branches: ["Cunga amashami", "Aho akorera n'intego z'ibikorwa"],
      billing: ["Kwiyandikisha no kwishyura", "Imiterere ya konti, ubwishyu no kongera igihe"],
    },
    latestActivity: "IBIKORWA BIHERUKA", recentSales: "Ibyagurishijwe vuba", ledger: "Reba urutonde",
    attention: "Ibikeneye kwitabwaho", lowStock: "Ibicuruzwa biri hafi gushira", lowStockSub: "Biri ku rugero cyangwa munsi yarwo",
    openTransfers: "Ihererekanya ry'ibicuruzwa", transferSub: "Birategereje kwakirwa cyangwa kurangira",
    subscription: "Imiterere yo kwiyandikisha", subscriptionSub: "Igenzurwa n'amakuru y'ubwishyu yemejwe",
    cloudSync: "Guhuza amakuru na Cloud", offlineSyncSub: "Impinduka zo kuri iyi mudasobwa zitegereje koherezwa",
    syncSub: "Fungura igenzura ryo guhuza no kwemeza amakuru", workspace: "AHO UBUCURUZI BUHURIYE",
    fromSavedSales: "Bishingiye ku byo mwagurishije", reorderItems: "Ibicuruzwa bisabwa kongerwa",
    branchCount: "amashami", terminalCount: "ibikoresho", statusPending: "BIRATEGEREJWE", statusVerified: "BYAGENZUWE",
  },
  fr: {
    greeting: ["Bonjour", "Bon après-midi", "Bonsoir"], eyebrow: "VOTRE ESPACE COMMERCIAL",
    description: "Votre espace de travail est prêt. Consultez les performances du jour ou lancez directement une opération.",
    newSale: "Nouvelle vente", notices: "ACTUALITÉS BEBOSS", noticeHeading: "Actualités de votre boutique",
    verified: "INSTANTANÉ CLOUD VÉRIFIÉ", pending: "VÉRIFICATION CLOUD EN ATTENTE", offline: "HORS LIGNE · DONNÉES LOCALES",
    welcomeTo: "Bienvenue chez", shopFallback: "votre boutique BeBoss",
    welcomeBody: "Un espace unique pour le point de vente, les stocks, les équipes, les succursales, les finances et les opérations sécurisées entre appareils.",
    overview: "Vue d'ensemble", management: "Centre de gestion", retailEyebrow: "L'ESPACE COMMERCIAL CONNECTÉ",
    retailTitle: "Pilotez toute votre boutique depuis une vue claire.",
    retailBody: "Ventes, stocks, soldes clients, équipes et succursales fonctionnent avec BeBoss Cloud et la récupération locale chiffrée.",
    pointOfSale: "Ouvrir le point de vente", team: "Gérer votre équipe", signedSnapshot: "Instantané signé",
    syncMode: "Mode de synchronisation", offlineQueue: "File hors ligne", connected: "Connecté",
    branches: "Succursales actives", terminals: "Terminaux actifs", lastSnapshot: "Dernier instantané",
    noSnapshot: "Aucun horodatage d'instantané cloud", revenue: "Chiffre d'affaires du jour",
    revenueSub: "À partir des ventes enregistrées", grossProfit: "Marge brute du jour",
    profitSub: "Coût des ventes enregistré", products: "Produits actifs",
    productSub: "Au seuil ou sous le seuil de réapprovisionnement", customers: "Comptes clients",
    receivables: "de crédit restant dû", quickAccess: "ACCÈS RAPIDE", continueWork: "Poursuivez votre travail",
    allAreas: "Tous les domaines de gestion", shortcuts: {
      sale: ["Démarrer une vente", "Ouvrir la caisse et émettre un reçu"],
      inventory: ["Gérer les stocks", "Produits, ajustements et seuils de réapprovisionnement"],
      reports: ["Analyser les performances", "Chiffre d'affaires, marges et rapports de ventes"],
      staff: ["Gérer votre équipe", "Rôles, affectations et état des accès"],
      branches: ["Gérer les succursales", "Emplacements et objectifs opérationnels"],
      billing: ["Abonnement et paiements", "État du forfait, paiements et renouvellements"],
    },
    latestActivity: "ACTIVITÉ RÉCENTE", recentSales: "Ventes récentes", ledger: "Ouvrir le registre",
    attention: "Points à surveiller", lowStock: "Produits en stock faible", lowStockSub: "Au niveau ou sous le seuil configuré",
    openTransfers: "Transferts en cours", transferSub: "En attente de réception ou de clôture",
    subscription: "État de l'abonnement", subscriptionSub: "Géré par les paiements vérifiés",
    cloudSync: "Synchronisation cloud", offlineSyncSub: "Les opérations locales attendent leur envoi",
    syncSub: "Ouvrir les diagnostics de synchronisation et d'intégrité", workspace: "ESPACE CONNECTÉ",
    fromSavedSales: "À partir des ventes enregistrées", reorderItems: "Articles au seuil de réapprovisionnement",
    branchCount: "succursales", terminalCount: "terminaux", statusPending: "EN ATTENTE", statusVerified: "VÉRIFIÉ",
  },
  sw: {
    greeting: ["Habari za asubuhi", "Habari za mchana", "Habari za jioni"], eyebrow: "ENEO LA BIASHARA YAKO",
    description: "Eneo lako la kazi liko tayari. Angalia utendaji wa leo au anza shughuli mara moja.",
    newSale: "Mauzo mapya", notices: "TAARIFA ZA BEBOSS", noticeHeading: "Habari za duka lako",
    verified: "TAARIFA YA CLOUD IMETHIBITISHWA", pending: "UTHIBITISHAJI WA CLOUD UNASUBIRI", offline: "BILA MTANDAO · DATA YA NDANI",
    welcomeTo: "Karibu kwenye", shopFallback: "duka lako la BeBoss",
    welcomeBody: "Eneo moja la mauzo, hesabu ya bidhaa, watu, matawi, fedha na shughuli salama kwenye vifaa mbalimbali.",
    overview: "Muhtasari wa biashara", management: "Kituo cha usimamizi", retailEyebrow: "ENEO LA BIASHARA LILILOUNGANISHWA",
    retailTitle: "Simamia kila sehemu ya duka lako kwa mwonekano mmoja.",
    retailBody: "Mauzo, bidhaa, madeni ya wateja, wafanyakazi na matawi yanafanya kazi pamoja na BeBoss Cloud na hifadhi fiche ya nje ya mtandao.",
    pointOfSale: "Fungua sehemu ya mauzo", team: "Simamia timu yako", signedSnapshot: "Taarifa iliyosainiwa",
    syncMode: "Hali ya kusawazisha", offlineQueue: "Foleni ya nje ya mtandao", connected: "Imeunganishwa",
    branches: "Matawi yanayotumika", terminals: "Vifaa vinavyotumika", lastSnapshot: "Taarifa ya mwisho",
    noSnapshot: "Hakuna muda wa taarifa ya cloud bado", revenue: "Mapato ya leo",
    revenueSub: "Kutoka kwenye mauzo yaliyohifadhiwa", grossProfit: "Faida ghafi ya leo",
    profitSub: "Gharama ya bidhaa zilizouzwa", products: "Bidhaa zinazotumika",
    productSub: "Zilizo chini au kwenye kiwango cha kuongeza", customers: "Akaunti za wateja",
    receivables: "deni ambalo halijalipwa", quickAccess: "UFIKIAJI WA HARAKA", continueWork: "Endelea na kazi yako",
    allAreas: "Sehemu zote za usimamizi", shortcuts: {
      sale: ["Anza kuuza", "Fungua malipo na toa risiti"],
      inventory: ["Simamia bidhaa", "Bidhaa, marekebisho ya hesabu na viwango vya kuongeza"],
      reports: ["Kagua utendaji", "Mapato, faida na ripoti za mauzo"],
      staff: ["Simamia timu", "Majukumu, ugawaji na hali ya ufikiaji"],
      branches: ["Simamia matawi", "Maeneo na malengo ya uendeshaji"],
      billing: ["Usajili na malipo", "Hali ya mpango, madai ya malipo na kuongeza muda"],
    },
    latestActivity: "SHUGHULI ZA HIVI KARIBUNI", recentSales: "Mauzo ya hivi karibuni", ledger: "Fungua daftari",
    attention: "Mambo yanayohitaji umakini", lowStock: "Bidhaa zinazopungua", lowStockSub: "Ziko kwenye au chini ya kiwango kilichowekwa",
    openTransfers: "Uhamisho wa bidhaa unaoendelea", transferSub: "Unasubiri kupokelewa au kukamilika",
    subscription: "Hali ya usajili", subscriptionSub: "Inasimamiwa na rekodi za malipo zilizothibitishwa",
    cloudSync: "Usawazishaji wa cloud", offlineSyncSub: "Mabadiliko ya ndani yanasubiri kutumwa",
    syncSub: "Fungua uchunguzi wa usawazishaji na uadilifu", workspace: "ENEO LILILOUNGANISHWA",
    fromSavedSales: "Kutoka mauzo yaliyohifadhiwa", reorderItems: "Bidhaa zinazohitaji kuongezwa",
    branchCount: "matawi", terminalCount: "vifaa", statusPending: "INASUBIRI", statusVerified: "IMETHIBITISHWA",
  },
};

export function WelcomePage({ cloud, snapshot, offline, revenueToday, profitToday, lowStock, onNavigate, onReceipt, onAnnouncementAction, language }: {
  cloud: CloudState; snapshot: Snapshot | null; offline: boolean; revenueToday: number; profitToday: number; lowStock: number;
  onNavigate: (view: NavKey) => void; onReceipt: (sale: Row) => void;
  onAnnouncementAction?: (urlValue: string) => Promise<void>; language: string
}) {
  const locale: DesktopLanguage = language in WELCOME_COPY ? language as DesktopLanguage : "en";
  const t = WELCOME_COPY[locale];
  const ownerName = s(cloud.owner?.owner_name) || s(cloud.shop.owner_name) || s(snapshot?.shopProfile?.name);
  const firstName = ownerName.trim().split(/\\s+/)[0] || s(cloud.owner?.username) || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t.greeting[0] : hour < 17 ? t.greeting[1] : t.greeting[2];
  const products = rows(snapshot?.products).filter((item) => item.isDeleted !== true);
  const customers = rows(snapshot?.customers).filter((item) => item.isDeleted !== true);
  const sales = rows(snapshot?.sales).sort((a, b) => n(b.saleDate) - n(a.saleDate));
  const activeBranches = rows(cloud.branches).filter((item) => item.is_active === true);
  const activeDevices = rows(cloud.devices).filter((item) => item.is_active === true);
  const pendingTransfers = rows(cloud.transfers).filter((item) => ["REQUESTED", "IN_TRANSIT", "RECEIPT_REQUESTED"].includes(s(item.status).toUpperCase()));
  const receivables = customers.reduce((sum, item) => sum + n(item.debtBalance), 0);
  const now = Date.now();
  const announcements = rows(cloud.announcements).filter((item) =>
    item.is_active === true &&
    ["ALL", "APP"].includes(s(item.audience).toUpperCase()) &&
    (!s(item.target_shop_key) || s(item.target_shop_key) === s(cloud.shop.id)) &&
    (!s(item.starts_at) || Date.parse(s(item.starts_at)) <= now) &&
    (!s(item.ends_at) || Date.parse(s(item.ends_at)) > now)
  ).slice(0, 3);
  const shortcuts: { title: string; description: string; view: NavKey; icon: typeof ShoppingCart; tone: string }[] = [
    { title: t.shortcuts.sale[0], description: t.shortcuts.sale[1], view: "checkout", icon: ShoppingCart, tone: "orange" },
    { title: t.shortcuts.inventory[0], description: t.shortcuts.inventory[1], view: "products", icon: Package, tone: "blue" },
    { title: t.shortcuts.reports[0], description: t.shortcuts.reports[1], view: "reports", icon: BarChart3, tone: "green" },
    { title: t.shortcuts.staff[0], description: t.shortcuts.staff[1], view: "staff", icon: Users, tone: "purple" },
    { title: t.shortcuts.branches[0], description: t.shortcuts.branches[1], view: "branches", icon: Building2, tone: "blue" },
    { title: t.shortcuts.billing[0], description: t.shortcuts.billing[1], view: "billing", icon: CreditCard, tone: "orange" },
  ];
  const verified = cloud.verifiedChunks > 0;
  return <div className="page-stack welcome-page">
    <PageHeading eyebrow={t.eyebrow} title={greeting + ", " + firstName} description={t.description}
      action={<button className="btn-primary" onClick={() => onNavigate("checkout")}><ShoppingCart size={16} /> {t.newSale}</button>} />
    {announcements.length > 0 ? (
      <section className="panel announcements" aria-label={t.notices}>
        <div className="panel-heading">
          <div><span className="eyebrow muted">{t.notices}</span><h3>{t.noticeHeading}</h3></div>
          <Megaphone size={18} className="muted-icon" />
        </div>
        {announcements.map((notice) => (
          <article className="announcement-row" key={s(notice.id)}>
            <StatusPill value={s(notice.severity) || "INFO"} />
            <div>
              <strong>{s(notice.title)}</strong>
              {s(notice.body) ? <p>{s(notice.body)}</p> : null}
              {s(notice.cta_label) && s(notice.cta_url) ? (
                <button className="text-action" onClick={() => { void onAnnouncementAction?.(s(notice.cta_url)); }}>{s(notice.cta_label)} <ArrowUpRight size={13} /></button>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    ) : null}
    <section className="welcome-hero">
      <div className="welcome-hero-copy">
        <span className={"welcome-live " + (offline ? "offline" : verified ? "verified" : "pending")}><i />{offline ? t.offline : verified ? t.verified : t.pending}</span>
        <h2>{t.welcomeTo} <em>{s(cloud.shop.shop_name) || t.shopFallback}</em></h2>
        <p>{t.welcomeBody}</p>
        <div className="welcome-hero-actions">
          <button className="btn-primary" onClick={() => onNavigate("overview")}><BarChart3 size={16} /> {t.overview}</button>
          <button className="btn-outline" onClick={() => onNavigate("management")}><Activity size={16} /> {t.management}</button>
        </div>
      </div>
      <div className="welcome-hero-status">
        <div className="welcome-status-brand"><img src="/beboss-app-icon.png" alt="BeBoss" /><span><strong>BeBoss Desktop</strong><small>RETAIL OPERATIONS</small></span></div>
        <div className="welcome-status-row"><span><ShieldCheck size={15} /> {t.signedSnapshot}</span><StatusPill value={verified ? t.statusVerified : t.statusPending} /></div>
        <div className="welcome-status-row"><span><RefreshCw size={15} /> {t.syncMode}</span><strong>{offline ? t.offlineQueue : t.connected}</strong></div>
        <div className="welcome-status-row"><span><Building2 size={15} /> {t.branches}</span><strong>{activeBranches.length}</strong></div>
        <div className="welcome-status-row"><span><Smartphone size={15} /> {t.terminals}</span><strong>{activeDevices.length}</strong></div>
        <small className="welcome-snapshot-time">{cloud.snapshotUpdatedAt ? t.lastSnapshot + " " + new Date(cloud.snapshotUpdatedAt).toLocaleString() : t.noSnapshot}</small>
      </div>
    </section>
    <section className="welcome-visual-stage">
      <div className="welcome-visual-copy">
        <span className="eyebrow">{t.retailEyebrow}</span>
        <h3>{t.retailTitle}</h3>
        <p>{t.retailBody}</p>
        <div className="welcome-visual-actions">
          <button className="btn-primary" onClick={() => onNavigate("checkout")}><ShoppingCart size={15} /> {t.pointOfSale}</button>
          <button className="btn-outline" onClick={() => onNavigate("staff")}><Users size={15} /> {t.team}</button>
        </div>
        <div className="welcome-visual-footnote"><ShieldCheck size={15} /> {t.signedSnapshot} · {offline ? t.offlineQueue : t.workspace}</div>
      </div>
      <div className="welcome-visual-art">
        <div className="welcome-art-image"><img src="/Friendly%20Modern%20Store%20Checkout.png" alt="Modern retail checkout counter" /></div>
        <div className="welcome-art-shade" />
        <div className="welcome-art-brand"><img src="/beboss-wordmark-light.png" alt="BeBoss" /></div>
        <div className="welcome-art-float welcome-art-float-revenue"><span>{t.revenue.toUpperCase()}</span><strong>{money(revenueToday)}</strong><small>{t.fromSavedSales}</small></div>
        <div className="welcome-art-float welcome-art-float-stock"><span>{t.products.toUpperCase()}</span><strong>{lowStock.toLocaleString()}</strong><small>{t.reorderItems}</small></div>
        <div className="welcome-art-orbit welcome-art-orbit-one" />
        <div className="welcome-art-orbit welcome-art-orbit-two" />
        <div className="welcome-art-caption"><span><i /> {offline ? t.offlineQueue : t.workspace}</span><b>{activeBranches.length} {t.branchCount} · {activeDevices.length} {t.terminalCount}</b></div>
      </div>
    </section>
    <div className="stat-grid four">
      <StatCard label={t.revenue} value={money(revenueToday)} sub={t.revenueSub} icon={Wallet} tone="blue" />
      <StatCard label={t.grossProfit} value={money(profitToday)} sub={t.profitSub} icon={ArrowUpRight} tone="green" />
      <StatCard label={t.products} value={products.length.toLocaleString()} sub={lowStock + " " + t.productSub} icon={Package} tone="orange" />
      <StatCard label={t.customers} value={customers.length.toLocaleString()} sub={money(receivables) + " " + t.receivables} icon={Users} tone="purple" />
    </div>
    <section className="welcome-section">
      <div className="section-title-row"><div><span className="eyebrow muted">{t.quickAccess}</span><h3>{t.continueWork}</h3></div><button className="text-action" onClick={() => onNavigate("management")}>{t.allAreas} <ArrowRight size={14} /></button></div>
      <div className="welcome-shortcut-grid">{shortcuts.map((item) => { const Icon = item.icon; return <button className="welcome-shortcut" key={item.view} onClick={() => onNavigate(item.view)}>
        <span className={"welcome-shortcut-icon " + item.tone}><Icon size={19} /></span><span className="welcome-shortcut-copy"><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRight size={15} className="welcome-shortcut-arrow" />
      </button>; })}</div>
    </section>
    <div className="welcome-bottom-grid">
      <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow muted">{t.latestActivity}</span><h3>{t.recentSales}</h3></div><button className="text-action" onClick={() => onNavigate("sales")}>{t.ledger} <ArrowRight size={14} /></button></div><SalesTable sales={sales.slice(0, 5)} onReceipt={onReceipt} /></section>
      <section className="panel welcome-attention">
        <div className="panel-heading"><div><span className="eyebrow muted">{t.attention}</span><h3>{t.attention}</h3></div><Zap size={18} className="muted-icon" /></div>
        <button className="welcome-pulse-row" onClick={() => onNavigate("products")}><span className="welcome-pulse-icon warning"><Package size={16} /></span><span><strong>{t.lowStock}</strong><small>{t.lowStockSub}</small></span><b>{lowStock}</b></button>
        <button className="welcome-pulse-row" onClick={() => onNavigate("transfers")}><span className="welcome-pulse-icon info"><Truck size={16} /></span><span><strong>{t.openTransfers}</strong><small>{t.transferSub}</small></span><b>{pendingTransfers.length}</b></button>
        <button className="welcome-pulse-row" onClick={() => onNavigate("billing")}><span className="welcome-pulse-icon success"><CreditCard size={16} /></span><span><strong>{t.subscription}</strong><small>{t.subscriptionSub}</small></span><StatusPill value={s(cloud.shop.subscription_status) || "UNKNOWN"} /></button>
        <button className="welcome-pulse-row" onClick={() => onNavigate("sync")}><span className="welcome-pulse-icon info"><RefreshCw size={16} /></span><span><strong>{t.cloudSync}</strong><small>{offline ? t.offlineSyncSub : t.syncSub}</small></span><b>{offline ? "OFFLINE" : verified ? "OK" : "CHECK"}</b></button>
      </section>
    </div>
  </div>;
}
