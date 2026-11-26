import { useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, Check, CheckCircle2, Cloud, Database,
  Languages, LockKeyhole, Monitor, Moon, RefreshCw, ShieldCheck, Smartphone,
  Sun, Wifi, X, Zap, Palette, LayoutGrid
} from "lucide-react";
import { DESKTOP_LANGUAGES, type DesktopLanguage } from "../lib/i18n";
import type { DesktopPreferences } from "../lib/types";

type CheckStatus = "pending" | "running" | "complete" | "warning" | "failed";
type StepId = "system" | "device" | "database" | "security" | "cloud";
type PageId = "welcome" | "preferences" | "verification" | "finish";
interface SetupStep {
  id: StepId; title: string; description: string; status: CheckStatus; details: string;
}
interface SetupDiagnostics {
  osPlatform: string; osArch: string; appVersion: string; dbPath: string;
  databaseEncrypted: boolean; databaseCipherVersion: string; pendingOutboxCount: number;
}
type WizardCopy = {
  stepNames: string[]; welcomeTag: string; welcomeTitle: string; welcomeBody: string;
  features: { title: string; body: string }[]; installTitle: string; installBody: string;
  preferencesTag: string; preferencesTitle: string; preferencesBody: string;
  language: string; appearance: string; dark: string; light: string; system: string;
  sync: string; syncBody: string; frequency: string; motion: string; motionBody: string;
  startPage: string; accent: string; orange: string; blue: string; green: string;
  density: string; comfortable: string; compact: string;
  privacyTitle: string; privacyBody: string; privacyCheck: string; privacyError: string;
  verificationTag: string; verificationTitle: string; verificationBody: string;
  runChecks: string; retry: string; checking: string; finishTag: string; finishTitle: string;
  finishBody: string; installPath: string; localDatabase: string; pending: string;
  cloudWarning: string; back: string; next: string; finish: string; working: string;
  setupError: string; statuses: Record<CheckStatus, string>;
  steps: { title: string; description: string }[];
};
const TEXT: Record<DesktopLanguage, WizardCopy> = {
  en: {
    stepNames: ["Welcome", "Preferences", "System checks", "Ready"],
    welcomeTag: "FIRST-RUN SETUP", welcomeTitle: "Prepare your BeBoss workspace.",
    welcomeBody: "Set your desktop preferences, verify the encrypted local workspace, and confirm that the device is ready before opening owner sign-in.",
    features: [
      { title: "Encrypted business data", body: "The local SQLCipher database is checked before the app continues." },
      { title: "Protected credentials", body: "The operating-system credential vault is tested with a temporary secret." },
      { title: "Persistent device identity", body: "A unique desktop identity is provisioned for shop authorization." },
      { title: "Cloud readiness", body: "The configured Supabase host is checked; sign-in performs the real authorization." }
    ],
    installTitle: "Choose the installation folder first.",
    installBody: "On Windows, choose the application path in the installer directory screen. BeBoss creates its app icon and Start Menu shortcut. Business data stays in the operating system's protected application-data location.",
    preferencesTag: "PERSONALIZE YOUR WORKSPACE", preferencesTitle: "Make BeBoss work your way.",
    preferencesBody: "These choices are saved in the encrypted desktop preferences store and can be changed later in Settings.",
    language: "Interface language", appearance: "Appearance", dark: "Dark", light: "Light", system: "System",
    sync: "Automatic cloud synchronization", syncBody: "Retry queued changes when the network returns and refresh cloud data on the selected interval.",
    frequency: "Cloud refresh interval", motion: "Reduce interface motion", motionBody: "Respect reduced-motion preference and keep transitions minimal.",
    startPage: "Start page after owner sign-in",
    accent: "Accent colour", orange: "Orange", blue: "Blue", green: "Green", density: "Workspace density", comfortable: "Comfortable", compact: "Compact",
    privacyTitle: "Privacy and device access",
    privacyBody: "BeBoss stores business records in its protected application-data workspace, uses the operating system's secure credential vault, and connects to BeBoss Cloud for owner sign-in and synchronization. Printer and file-export access is used when you choose Print, Save or Export. Setup does not request access to unrelated personal files or media.",
    privacyCheck: "I have read and accept this device and data-use notice.",
    privacyError: "Review the access notice and accept it before continuing.",
    verificationTag: "REAL DEVICE VALIDATION", verificationTitle: "Verify this installation.",
    verificationBody: "The checks below call the native desktop host and your configured cloud endpoint. A cloud warning does not block encrypted offline setup, but owner sign-in and synchronization require connectivity.",
    runChecks: "Run system checks", retry: "Retry checks", checking: "Running native checks…",
    finishTag: "SETUP COMPLETE", finishTitle: "Your desktop workspace is ready.",
    finishBody: "Local security checks have passed. Continue to the BeBoss welcome page, then sign in with the shop owner's registered phone and SMS verification code.",
    installPath: "Application data path", localDatabase: "Encrypted local database", pending: "Queued sync records",
    cloudWarning: "The cloud endpoint could not be reached. You can finish local setup, but online owner verification and cloud synchronization require internet access.",
    back: "Back", next: "Next", finish: "Finish setup", working: "Saving preferences…",
    setupError: "Setup could not be completed. Resolve the failed check and retry.",
    statuses: { pending: "Pending", running: "Checking", complete: "Verified", warning: "Attention", failed: "Failed" },
    steps: [
      { title: "System compatibility", description: "Operating system and native desktop runtime" },
      { title: "Device identity", description: "Persistent desktop identity" },
      { title: "Encrypted database", description: "SQLCipher and durable local outbox" },
      { title: "Credential vault", description: "Operating-system secure storage" },
      { title: "Cloud connectivity", description: "Supabase host reachability (TCP only)" }
    ]
  },
  rw: {
    stepNames: ["Murakaza neza", "Ibyo ukunda", "Igenzura", "Byiteguye"],
    welcomeTag: "GUTANGIZA BWA MBERE", welcomeTitle: "Tegura BeBoss kuri mudasobwa.",
    welcomeBody: "Hitamo imiterere ukunda, genzura ububiko burinzwe n'ibanga, kandi wemeze ko igikoresho cyiteguye mbere yo kwinjira nk'umuyobozi.",
    features: [
      { title: "Amakuru arinzwe", body: "Ububiko bwa SQLCipher bugenzurwa mbere yo gukomeza." },
      { title: "Amakuru y'ibanga arinzwe", body: "Ububiko bw'ibanga bwa sisitemu bugenzurwa hakoreshejwe ijambo ry'ibanga ry'agateganyo." },
      { title: "Indangamuntu y'igikoresho", body: "Mudasobwa ihabwa indangamuntu yayo yo kwemezwa n'iduka." },
      { title: "Guhuza na Cloud", body: "Aderesi ya Supabase iragenzurwa; kwinjira nyakuri ni byo byemeza uburenganzira." }
    ],
    installTitle: "Banza uhitemo aho porogaramu izajya.",
    installBody: "Kuri Windows, hitamo aho BeBoss izashyirwa mu idirishya ry'installer. BeBoss ikora ikirango cya porogaramu na shortcut muri Start Menu. Amakuru y'ubucuruzi abikwa ahantu harinzwe na sisitemu.",
    preferencesTag: "HITAMO IBYO UKUNDA", preferencesTitle: "Tegura BeBoss uko ubishaka.",
    preferencesBody: "Ibi bihitamo bibikwa mu bubiko burinzwe kandi ushobora kubihindura muri Settings nyuma.",
    language: "Ururimi", appearance: "Imigaragarire", dark: "Umwijima", light: "Umucyo", system: "Sisitemu",
    sync: "Guhuza amakuru na Cloud byikora", syncBody: "Ongera ugerageze kohereza impinduka igihe internet igarutse kandi wongere usome amakuru ku gihe wahisemo.",
    frequency: "Igihe cyo kongera gusoma amakuru", motion: "Gabanya animasiyo", motionBody: "Kurikiza ihitamo ryo kugabanya imigendere y'amashusho.",
    startPage: "Ipaji ibanza nyuma yo kwinjira",
    accent: "Ibara ry’ingenzi", orange: "Oranje", blue: "Ubururu", green: "Icyatsi", density: "Ubucucike bw’imigaragarire", comfortable: "Bisanzwe", compact: "Bito",
    privacyTitle: "Ibanga n'uburenganzira bwa mudasobwa",
    privacyBody: "BeBoss ibika amakuru y'ubucuruzi mu bubiko bwayo burinzwe, ikoresha ububiko bw'ibanga bwa sisitemu, kandi ihuza na BeBoss Cloud mu kwinjira no guhererekanya amakuru. Printer n'ububiko bwa dosiye bikoreshwa igihe uhisemo Gucapa, Kubika cyangwa Kohereza. Iyi setup ntisaba kugera ku mafoto cyangwa izindi dosiye zawe zitari iz'akazi.",
    privacyCheck: "Nasomye kandi nemeye aya mabwiriza yo gukoresha mudasobwa n'amakuru.",
    privacyError: "Soma amabwiriza yo kugera ku makuru hanyuma uyemere mbere yo gukomeza.",
    verificationTag: "IGENZURA NYAKURI", verificationTitle: "Genza iyi installation.",
    verificationBody: "Igenzura rikoresha native desktop host n'aderesi ya cloud washyizeho. Ikibazo cya cloud ntikibuza gutegura ububiko bwa offline burinzwe, ariko kwinjira no guhuza amakuru bisaba internet.",
    runChecks: "Tangira igenzura", retry: "Ongera ugenzure", checking: "Igenzura rirakorwa…",
    finishTag: "BYARANGIYE", finishTitle: "Ahantu ho gukorera hariteguye.",
    finishBody: "Igenzura ry'umutekano wa mudasobwa ryatsinze. Komeza ujye ku rupapuro rwa BeBoss, winjire ukoresheje telefone yanditse y'umuyobozi na kode ya SMS.",
    installPath: "Aho amakuru abikwa", localDatabase: "Ububiko bw'ibanga bwa mudasobwa", pending: "Impinduka zitegereje koherezwa",
    cloudWarning: "Aderesi ya cloud ntiyabonetse. Ushobora kurangiza gutegura mudasobwa, ariko kwemeza umuyobozi no guhuza amakuru bisaba internet.",
    back: "Subira inyuma", next: "Komeza", finish: "Rangiza", working: "Kubika ibyo wahisemo…",
    setupError: "Igenzura ntiryashoboye kurangira. Kosora ikibazo hanyuma wongere ugerageze.",
    statuses: { pending: "Birategereje", running: "Irakorwa", complete: "Byemejwe", warning: "Icyitonderwa", failed: "Byanze" },
    steps: [
      { title: "Sisitemu", description: "Operating system na porogaramu ya desktop" },
      { title: "Indangamuntu", description: "Indangamuntu ihoraho ya mudasobwa" },
      { title: "Ububiko burinzwe", description: "SQLCipher n'umurongo w'impinduka" },
      { title: "Ububiko bw'ibanga", description: "Umutekano wa sisitemu" },
      { title: "Guhuza na Cloud", description: "Kugera kuri Supabase (TCP gusa)" }
    ]
  },
  fr: {
    stepNames: ["Bienvenue", "Préférences", "Vérifications", "Prêt"],
    welcomeTag: "PREMIÈRE INSTALLATION", welcomeTitle: "Préparez votre espace BeBoss.",
    welcomeBody: "Choisissez vos préférences, vérifiez l'espace local chiffré et confirmez que l'appareil est prêt avant d'ouvrir la connexion propriétaire.",
    features: [
      { title: "Données chiffrées", body: "La base locale SQLCipher est vérifiée avant de continuer." },
      { title: "Identifiants protégés", body: "Le coffre du système est testé avec un secret temporaire." },
      { title: "Identité persistante", body: "Une identité unique de bureau est créée pour l'autorisation de la boutique." },
      { title: "Disponibilité du cloud", body: "L'hôte Supabase est testé ; la connexion vérifie réellement les droits." }
    ],
    installTitle: "Choisissez d'abord le dossier d'installation.",
    installBody: "Sous Windows, choisissez le chemin de l'application dans l'écran du dossier de l'installateur. BeBoss crée l'icône et le raccourci du menu Démarrer. Les données restent dans le dossier applicatif protégé du système.",
    preferencesTag: "PERSONNALISEZ VOTRE ESPACE", preferencesTitle: "Configurez BeBoss à votre façon.",
    preferencesBody: "Ces choix sont enregistrés dans les préférences chiffrées et restent modifiables dans les paramètres.",
    language: "Langue de l'interface", appearance: "Apparence", dark: "Sombre", light: "Clair", system: "Système",
    sync: "Synchronisation cloud automatique", syncBody: "Réessayez les changements en attente au retour du réseau et actualisez les données selon l'intervalle choisi.",
    frequency: "Intervalle d'actualisation", motion: "Réduire les animations", motionBody: "Respecter la préférence de réduction des mouvements.",
    startPage: "Page d'accueil après connexion",
    accent: "Couleur d’accent", orange: "Orange", blue: "Bleu", green: "Vert", density: "Densité de l’espace", comfortable: "Confortable", compact: "Compact",
    privacyTitle: "Confidentialité et accès à l'appareil",
    privacyBody: "BeBoss conserve les données professionnelles dans son espace applicatif protégé, utilise le coffre sécurisé du système et se connecte à BeBoss Cloud pour la connexion du propriétaire et la synchronisation. L'accès à l'imprimante et aux fichiers est utilisé lorsque vous choisissez Imprimer, Enregistrer ou Exporter. L'installation ne demande pas l'accès aux fichiers personnels ou médias sans rapport avec ces fonctions.",
    privacyCheck: "J'ai lu et j'accepte cette notice d'utilisation de l'appareil et des données.",
    privacyError: "Veuillez lire et accepter la notice d'accès avant de continuer.",
    verificationTag: "VALIDATION RÉELLE", verificationTitle: "Vérifiez cette installation.",
    verificationBody: "Les contrôles utilisent le composant natif et l'hôte cloud configuré. Un avertissement cloud n'empêche pas la configuration hors ligne chiffrée, mais la connexion propriétaire et la synchronisation nécessitent Internet.",
    runChecks: "Lancer les vérifications", retry: "Réessayer", checking: "Vérifications en cours…",
    finishTag: "INSTALLATION TERMINÉE", finishTitle: "Votre espace de travail est prêt.",
    finishBody: "Les contrôles locaux ont réussi. Continuez vers l'accueil BeBoss, puis connectez-vous avec le téléphone enregistré du propriétaire et le code SMS.",
    installPath: "Chemin des données applicatives", localDatabase: "Base locale chiffrée", pending: "Éléments de synchronisation en attente",
    cloudWarning: "L'hôte cloud est inaccessible. Vous pouvez terminer la configuration locale, mais la vérification propriétaire et la synchronisation nécessitent Internet.",
    back: "Retour", next: "Suivant", finish: "Terminer", working: "Enregistrement des préférences…",
    setupError: "La configuration n'a pas abouti. Corrigez le contrôle en échec et réessayez.",
    statuses: { pending: "En attente", running: "Vérification", complete: "Vérifié", warning: "Attention", failed: "Échec" },
    steps: [
      { title: "Compatibilité système", description: "Système et exécution native" },
      { title: "Identité de l'appareil", description: "Identité persistante du bureau" },
      { title: "Base chiffrée", description: "SQLCipher et file locale durable" },
      { title: "Coffre d'identifiants", description: "Stockage sécurisé du système" },
      { title: "Connexion cloud", description: "Disponibilité de l'hôte Supabase (TCP)" }
    ]
  },
  sw: {
    stepNames: ["Karibu", "Mapendeleo", "Ukaguzi", "Tayari"],
    welcomeTag: "MARA YA KWANZA", welcomeTitle: "Andaa sehemu yako ya BeBoss.",
    welcomeBody: "Chagua mapendeleo ya kompyuta, kagua hifadhi fiche na uthibitishe kuwa kifaa kiko tayari kabla ya kufungua ukurasa wa mmiliki.",
    features: [
      { title: "Data fiche za biashara", body: "Hifadhidata ya ndani ya SQLCipher hukaguliwa kabla ya kuendelea." },
      { title: "Siri zilizolindwa", body: "Hifadhi salama ya mfumo hujaribiwa kwa siri ya muda." },
      { title: "Utambulisho wa kifaa", body: "Kompyuta hupata utambulisho wa kudumu kwa idhini ya duka." },
      { title: "Utayari wa mtandao", body: "Anwani ya Supabase hukaguliwa; kuingia ndiko kunathibitisha idhini halisi." }
    ],
    installTitle: "Chagua folda ya usakinishaji kwanza.",
    installBody: "Kwenye Windows, chagua mahali pa programu kwenye ukurasa wa folda wa kisakinishi. BeBoss hutengeneza ikoni na njia ya mkato ya Start Menu. Data ya biashara huhifadhiwa kwenye eneo la data la mfumo lililolindwa.",
    preferencesTag: "WEKA MAPENDELEO YAKO", preferencesTitle: "Tumia BeBoss unavyopendelea.",
    preferencesBody: "Chaguo hizi huhifadhiwa kwa usimbaji fiche na zinaweza kubadilishwa baadaye kwenye Settings.",
    language: "Lugha ya kiolesura", appearance: "Mwonekano", dark: "Giza", light: "Mwanga", system: "Mfumo",
    sync: "Usawazishaji wa mtandao wa kiotomatiki", syncBody: "Jaribu tena mabadiliko yaliyosubiri mtandao unaporudi na usasishe data kwa muda uliochagua.",
    frequency: "Muda wa kusasisha data", motion: "Punguza mwendo", motionBody: "Heshimu upendeleo wa kupunguza uhuishaji.",
    startPage: "Ukurasa wa kuanza baada ya mmiliki kuingia",
    accent: "Rangi kuu", orange: "Machungwa", blue: "Bluu", green: "Kijani", density: "Msongamano wa nafasi", comfortable: "Wastani", compact: "Fupi",
    privacyTitle: "Faragha na ufikiaji wa kifaa",
    privacyBody: "BeBoss huhifadhi rekodi za biashara kwenye eneo lake salama la programu, hutumia hifadhi salama ya mfumo, na huunganisha BeBoss Cloud kwa kuingia kwa mmiliki na kusawazisha data. Ufikiaji wa kichapishi na faili hutumika unapochagua Chapisha, Hifadhi au Hamisha. Usakinishaji hauhitaji ufikiaji wa faili binafsi au midia isiyohusiana na kazi hizo.",
    privacyCheck: "Nimesoma na kukubali taarifa hii ya matumizi ya kifaa na data.",
    privacyError: "Soma na ukubali taarifa ya ufikiaji kabla ya kuendelea.",
    verificationTag: "UKAGUZI HALISI", verificationTitle: "Thibitisha usakinishaji huu.",
    verificationBody: "Ukaguzi huu hutumia mfumo asilia wa kompyuta na anwani halisi ya mtandao ulioweka. Onyo la mtandao halizuii usanidi fiche wa offline, lakini kuingia kwa mmiliki na usawazishaji vinahitaji intaneti.",
    runChecks: "Anza ukaguzi", retry: "Jaribu tena", checking: "Ukaguzi unaendelea…",
    finishTag: "USANIDI UMEKAMILIKA", finishTitle: "Sehemu yako ya kazi iko tayari.",
    finishBody: "Ukaguzi wa usalama wa ndani umefaulu. Endelea kwenye ukurasa wa BeBoss kisha ingia kwa simu iliyosajiliwa ya mmiliki na msimbo wa SMS.",
    installPath: "Mahali pa data ya programu", localDatabase: "Hifadhidata fiche ya ndani", pending: "Rekodi zinazosubiri kusawazishwa",
    cloudWarning: "Anwani ya mtandao haipatikani. Unaweza kukamilisha usanidi wa ndani, lakini uthibitisho wa mmiliki na usawazishaji vinahitaji intaneti.",
    back: "Rudi", next: "Endelea", finish: "Maliza usanidi", working: "Inahifadhi mapendeleo…",
    setupError: "Usanidi haujakamilika. Rekebisha ukaguzi ulioshindwa kisha ujaribu tena.",
    statuses: { pending: "Inasubiri", running: "Inakagua", complete: "Imethibitishwa", warning: "Tahadhari", failed: "Imeshindwa" },
    steps: [
      { title: "Ulinganifu wa mfumo", description: "Mfumo wa uendeshaji na runtime" },
      { title: "Utambulisho wa kifaa", description: "Utambulisho wa kudumu wa kompyuta" },
      { title: "Hifadhidata fiche", description: "SQLCipher na foleni ya ndani" },
      { title: "Hifadhi ya siri", description: "Usalama wa mfumo" },
      { title: "Muunganisho wa mtandao", description: "Ufikivu wa Supabase (TCP pekee)" }
    ]
  }
};

const INITIAL_STEPS: SetupStep[] = [
  { id: "system", title: "", description: "", status: "pending", details: "Not checked" },
  { id: "device", title: "", description: "", status: "pending", details: "Not initialized" },
  { id: "database", title: "", description: "", status: "pending", details: "Not verified" },
  { id: "security", title: "", description: "", status: "pending", details: "Not verified" },
  { id: "cloud", title: "", description: "", status: "pending", details: "Not tested" }
];

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }

export function SetupWizard({
  initialPreferences, onComplete
}: {
  initialPreferences: DesktopPreferences;
  onComplete: (preferences: DesktopPreferences, privacyAccepted: boolean) => Promise<void>;
}) {
  const [preferences, setPreferences] = useState<DesktopPreferences>(initialPreferences);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [page, setPage] = useState<PageId>("welcome");
  const [running, setRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [steps, setSteps] = useState<SetupStep[]>(INITIAL_STEPS);
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const [diagnostics, setDiagnostics] = useState<SetupDiagnostics | null>(null);
  const [failure, setFailure] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const t = TEXT[preferences.language];

  const pageIndex = (["welcome", "preferences", "verification", "finish"] as PageId[]).indexOf(page);
  const log = (message: string) => setLogs((previous) => [...previous.slice(-11), new Date().toLocaleTimeString() + "  " + message]);
  const updateStep = (id: StepId, status: CheckStatus, details: string) => {
    setSteps((previous) => previous.map((step) => step.id === id ? { ...step, status, details } : step));
  };
  const translatedSteps = steps.map((step, index) => ({ ...step, title: t.steps[index].title, description: t.steps[index].description }));

  async function runChecks(): Promise<boolean> {
    if (running) return false;
    if (!window.beBossDesktop?.isNative) {
      const message = "This is a browser preview. Install and launch BeBoss Desktop to run native Windows, SQLCipher and Credential Manager checks.";
      setFailure(message);
      setSteps((current) => current.map((step) => ({ ...step, status: "failed", details: message })));
      log("Native validation is unavailable in a browser preview.");
      return false;
    }
    setRunning(true); setFailure(""); setCompleted(false); setDiagnostics(null);
    setSteps(INITIAL_STEPS); setLogs([]);
    let active: StepId = "system";
    try {
      setActiveStep(active);
      updateStep(active, "running", "Reading native desktop runtime diagnostics…");
      log("Collecting native operating-system diagnostics.");
      const system = await window.beBossDesktop.systemDiagnostics();
      if (!system.osPlatform || !system.osArch || !system.dbPath || !system.appVersion) {
        throw new Error("The native runtime did not return complete operating-system diagnostics.");
      }
      updateStep(active, "complete", system.osPlatform + " · " + system.osArch + " · BeBoss " + system.appVersion);
      log("Native system information verified.");

      active = "device"; setActiveStep(active);
      updateStep(active, "running", "Provisioning a persistent local device identity…");
      const deviceId = await window.beBossDesktop.getDeviceId();
      if (!deviceId || deviceId.length < 16) throw new Error("The desktop host returned an invalid device identity.");
      updateStep(active, "complete", "Persistent identity ready · " + deviceId.slice(0, 8) + "…" + deviceId.slice(-6));
      log("Persistent desktop identity verified.");

      active = "database"; setActiveStep(active);
      updateStep(active, "running", "Opening SQLCipher and inspecting the sync outbox…");
      const pending = await window.beBossDesktop.local.outboxCount();
      const localSnapshot = await window.beBossDesktop.local.load();
      if (!system.databaseEncrypted || !system.databaseCipherVersion) {
        throw new Error("SQLCipher could not confirm that the local database is encrypted.");
      }
      updateStep(active, "complete", "SQLCipher " + system.databaseCipherVersion + " · " + (localSnapshot ? "existing shop data found" : "new workspace") + " · " + pending + " queued item(s)");
      log("Encrypted database integrity and durable outbox verified.");

      active = "security"; setActiveStep(active);
      updateStep(active, "running", "Testing operating-system credential storage…");
      const probeKey = "setup-probe-" + crypto.randomUUID();
      const probeValue = crypto.randomUUID();
      try {
        await window.beBossDesktop.secureStore.set(probeKey, probeValue);
        const storedValue = await window.beBossDesktop.secureStore.get(probeKey);
        if (storedValue !== probeValue) throw new Error("The credential vault did not return the value it stored.");
        log("Credential vault write/read test passed.");
      } finally {
        await window.beBossDesktop.secureStore.remove(probeKey).catch(() => false);
      }
      updateStep(active, "complete", "Credential vault write/read verified; temporary secret removed.");

      active = "cloud"; setActiveStep(active);
      updateStep(active, "running", "Testing the configured Supabase network endpoint…");
      const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
      let cloudWarning = false;
      if (!supabaseUrl) {
        cloudWarning = true;
        updateStep(active, "warning", "Supabase URL is not configured in this build.");
        log("Cloud host is not configured; online sign-in and synchronization require build configuration.");
      } else {
        try {
          const endpoint = new URL(supabaseUrl);
          if (endpoint.protocol !== "https:") throw new Error("The configured Supabase endpoint must use HTTPS.");
          const ping = await window.beBossDesktop.networkPing(endpoint.hostname + ":443");
          if (ping.reachable) {
            updateStep(active, "complete", "Supabase host reachable · " + ping.latencyMs + " ms TCP response (authentication not tested)");
            log("Supabase TCP reachability verified. Authentication will be tested at owner sign-in.");
          } else {
            cloudWarning = true;
            updateStep(active, "warning", "Cloud is unreachable. " + ping.details);
            log("Cloud is currently unreachable; offline local setup remains available.");
          }
        } catch (error) {
          cloudWarning = true;
          updateStep(active, "warning", "Cloud reachability could not be verified: " + errorMessage(error));
          log("Cloud connectivity check needs attention.");
        }
      }
      setDiagnostics({
        osPlatform: system.osPlatform, osArch: system.osArch, appVersion: system.appVersion,
        dbPath: system.dbPath, databaseEncrypted: Boolean(system.databaseEncrypted),
        databaseCipherVersion: system.databaseCipherVersion, pendingOutboxCount: pending
      });
      setCompleted(true); setActiveStep(null);
      if (cloudWarning) log("Local checks passed with a cloud connectivity warning.");
      else log("All required local checks passed.");
      return true;
    } catch (error) {
      const message = errorMessage(error);
      setFailure(message); updateStep(active, "failed", message);
      log("Setup stopped: " + message);
      return false;
    } finally { setRunning(false); }
  }

  async function next() {
    if (page === "preferences" && !privacyAccepted) {
      setFailure(t.privacyError);
      return;
    }
    if (page === "verification") {
      if (!completed) {
        const ok = await runChecks();
        if (!ok) return;
      }
      setPage("finish");
      return;
    }
    if (page === "finish") {
      if (!completed || !diagnostics) return;
      setFinishing(true); setFailure("");
      try { await onComplete(preferences, privacyAccepted); }
      catch (error) { setFailure(errorMessage(error)); }
      finally { setFinishing(false); }
      return;
    }
    setPage(page === "welcome" ? "preferences" : "verification");
  }

  const statusIcon = (status: CheckStatus) => {
    if (status === "running") return <RefreshCw size={15} className="spin" />;
    if (status === "complete") return <Check size={15} />;
    if (status === "warning") return <Wifi size={15} />;
    if (status === "failed") return <X size={15} />;
    return <span className="setup-status-pending" />;
  };
  const update = <K extends keyof DesktopPreferences>(key: K, value: DesktopPreferences[K]) =>
    setPreferences((current) => ({ ...current, [key]: value }));

  return (
    <div className="setup-wizard" data-theme={preferences.theme} data-motion={preferences.reducedMotion ? "reduced" : "full"} data-accent={preferences.accent} data-density={preferences.density}>
      <aside className="setup-rail">
        <div className="setup-brand">
          <img src="/beboss-app-icon.png" alt="BeBoss" />
          <div><strong>BeBoss Desktop</strong><small>RETAIL OPERATIONS PLATFORM</small></div>
        </div>
        <div className="setup-progress" aria-label="Setup progress">
          {t.stepNames.map((name, index) => (
            <button key={name} type="button" className={"setup-step " + (pageIndex === index ? "active" : index < pageIndex ? "complete" : "")}
              aria-current={pageIndex === index ? "step" : undefined}
              onClick={() => { if (!running && !finishing && index < pageIndex) setPage((["welcome", "preferences", "verification", "finish"] as PageId[])[index]); }}
              disabled={running || finishing || index > pageIndex}>
              <span>{index < pageIndex ? <Check size={15} /> : <b>{index + 1}</b>}</span>
              <div><small>STEP 0{index + 1}</small><strong>{name}</strong></div>
            </button>
          ))}
        </div>
        <div className="setup-security"><LockKeyhole size={17} /><div><strong>{t.features[0].title}</strong><small>{t.features[0].body}</small></div></div>
      </aside>

      <main className="setup-main">
        <section key={page} className="setup-content" aria-live="polite" aria-busy={running}>
          <div className="setup-topline"><span>0{pageIndex + 1} / 04</span><div><i style={{ width: ((pageIndex + 1) * 25) + "%" }} /></div></div>

          {page === "welcome" && <>
            <div className="setup-icon"><Zap size={25} /></div>
            <small className="eyebrow muted">{t.welcomeTag}</small>
            <h1>{t.welcomeTitle}</h1><p>{t.welcomeBody}</p>
            <div className="setup-feature-grid">
              <article><Database size={21} /><div><strong>{t.features[0].title}</strong><span>{t.features[0].body}</span></div></article>
              <article><ShieldCheck size={21} /><div><strong>{t.features[1].title}</strong><span>{t.features[1].body}</span></div></article>
              <article><Smartphone size={21} /><div><strong>{t.features[2].title}</strong><span>{t.features[2].body}</span></div></article>
              <article><Cloud size={21} /><div><strong>{t.features[3].title}</strong><span>{t.features[3].body}</span></div></article>
            </div>
            <div className="setup-install-note"><Monitor size={18} /><div><strong>{t.installTitle}</strong><span>{t.installBody}</span></div></div>
          </>}

          {page === "preferences" && <>
            <div className="setup-icon"><Languages size={25} /></div>
            <small className="eyebrow muted">{t.preferencesTag}</small>
            <h1>{t.preferencesTitle}</h1><p>{t.preferencesBody}</p>
            <div className="setup-preference-section">
              <label className="setup-field-label">{t.language}</label>
              <div className="setup-language-grid">
                {DESKTOP_LANGUAGES.map((item) => <button key={item.code} type="button" className={preferences.language === item.code ? "selected" : ""}
                  onClick={() => update("language", item.code)}>
                  <span>{item.short}</span><strong>{item.label}</strong>{preferences.language === item.code && <Check size={16} />}
                </button>)}
              </div>
            </div>
            <div className="setup-preference-section">
              <label className="setup-field-label">{t.appearance}</label>
              <div className="setup-choice-row">
                <button type="button" className={preferences.theme === "dark" ? "selected" : ""} onClick={() => update("theme", "dark")}><Moon size={17} />{t.dark}</button>
                <button type="button" className={preferences.theme === "light" ? "selected" : ""} onClick={() => update("theme", "light")}><Sun size={17} />{t.light}</button>
                <button type="button" className={preferences.theme === "system" ? "selected" : ""} onClick={() => update("theme", "system")}><Monitor size={17} />{t.system}</button>
              </div>
            </div>
            <div className="setup-preference-section">
              <label className="setup-field-label"><Palette size={14}/>{t.accent}</label>
              <div className="setup-choice-row setup-accent-row">
                <button type="button" className={preferences.accent === "orange" ? "selected" : ""} onClick={() => update("accent", "orange")}><i className="setup-accent-dot orange"/> {t.orange}</button>
                <button type="button" className={preferences.accent === "blue" ? "selected" : ""} onClick={() => update("accent", "blue")}><i className="setup-accent-dot blue"/> {t.blue}</button>
                <button type="button" className={preferences.accent === "green" ? "selected" : ""} onClick={() => update("accent", "green")}><i className="setup-accent-dot green"/> {t.green}</button>
              </div>
            </div>
            <div className="setup-preference-section">
              <label className="setup-field-label"><LayoutGrid size={14}/>{t.density}</label>
              <div className="setup-choice-row">
                <button type="button" className={preferences.density === "comfortable" ? "selected" : ""} onClick={() => update("density", "comfortable")}>{t.comfortable}</button>
                <button type="button" className={preferences.density === "compact" ? "selected" : ""} onClick={() => update("density", "compact")}>{t.compact}</button>
              </div>
            </div>
            <div className="setup-setting-list">
              <label className="setup-setting-row"><span><strong>{t.sync}</strong><small>{t.syncBody}</small></span><input type="checkbox" checked={preferences.autoSync} onChange={(event) => update("autoSync", event.target.checked)} /></label>
              <label className="setup-setting-row"><span><strong>{t.frequency}</strong><small>{t.syncBody}</small></span>
                <select value={preferences.refreshMinutes} onChange={(event) => update("refreshMinutes", Number(event.target.value) as DesktopPreferences["refreshMinutes"])}>
                  <option value={0}>Manual</option><option value={1}>1 minute</option><option value={5}>5 minutes</option><option value={15}>15 minutes</option>
                </select>
              </label>
              <label className="setup-setting-row"><span><strong>{t.motion}</strong><small>{t.motionBody}</small></span><input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => update("reducedMotion", event.target.checked)} /></label>
              <label className="setup-setting-row"><span><strong>{t.startPage}</strong><small>Choose the desktop page opened after sign-in.</small></span>
                <select value={preferences.defaultView} onChange={(event) => update("defaultView", event.target.value as DesktopPreferences["defaultView"])}>
                  <option value="welcome">Welcome</option><option value="overview">Overview</option><option value="management">Management center</option>
                </select>
              </label>
            </div>
          </>}

          {page === "preferences" && <>
            <section className="setup-privacy-notice" aria-labelledby="setup-privacy-title">
              <div className="setup-privacy-icon"><ShieldCheck size={18}/></div>
              <div><strong id="setup-privacy-title">{t.privacyTitle}</strong><p>{t.privacyBody}</p></div>
              <label className="setup-privacy-accept">
                <input type="checkbox" checked={privacyAccepted} onChange={(event) => { setPrivacyAccepted(event.target.checked); if (event.target.checked) setFailure(""); }}/>
                <span>{t.privacyCheck}</span>
              </label>
            </section>
            {failure && <p className="setup-error" role="alert">{failure}</p>}
          </>}
          {page === "verification" && <>
            <div className="setup-icon">{completed ? <CheckCircle2 size={25} /> : <Activity size={25} />}</div>
            <small className="eyebrow muted">{t.verificationTag}</small>
            <h1>{completed ? t.finishTitle : t.verificationTitle}</h1><p>{t.verificationBody}</p>
            <div className="setup-checks" aria-live="polite">
              {translatedSteps.map((step) => (
                <div className={"setup-check " + (activeStep === step.id ? "active" : "")} key={step.id}>
                  <span className={"setup-check-icon " + (step.status === "failed" ? "failed" : step.status === "warning" ? "warning" : step.status === "complete" ? "ready" : "")}>{statusIcon(step.status)}</span>
                  <div><strong>{step.title}</strong><small>{step.details}</small></div>
                  <b className={step.status === "complete" ? "ready" : step.status === "warning" ? "warning" : step.status === "failed" ? "failed" : ""}>{t.statuses[step.status]}</b>
                </div>
              ))}
            </div>
            {logs.length > 0 && <div className="setup-log-panel"><div><strong>Installation log</strong><span>{logs.length} events</span></div>{logs.map((entry, index) => <p key={index}>{entry}</p>)}</div>}
            {failure && <p className="setup-error" role="alert">{t.setupError} {failure}</p>}
            {completed && steps.find((step) => step.id === "cloud")?.status === "warning" && <p className="setup-offline-note">{t.cloudWarning}</p>}
          </>}

          {page === "finish" && <>
            <div className="setup-icon setup-icon-success"><CheckCircle2 size={26} /></div>
            <small className="eyebrow muted">{t.finishTag}</small>
            <h1>{t.finishTitle}</h1><p>{t.finishBody}</p>
            {diagnostics && <div className="setup-summary-list">
              <div><span><Monitor size={16} />Device</span><strong>{diagnostics.osPlatform} · {diagnostics.osArch} · BeBoss {diagnostics.appVersion}</strong></div>
              <div><span><Database size={16} />{t.localDatabase}</span><strong>{diagnostics.databaseCipherVersion}</strong></div>
              <div><span><Monitor size={16} />{t.installPath}</span><code>{diagnostics.dbPath}</code></div>
              <div><span><RefreshCw size={16} />{t.pending}</span><strong>{diagnostics.pendingOutboxCount}</strong></div>
            </div>}
            {failure && <p className="setup-error" role="alert">{failure}</p>}
          </>}

          <div className="setup-actions">
            {pageIndex > 0 && <button type="button" className="setup-back-btn" onClick={() => setPage((["welcome", "preferences", "verification", "finish"] as PageId[])[pageIndex - 1])} disabled={running || finishing}><ArrowLeft size={16} />{t.back}</button>}
            <button type="button" className="primary-btn" onClick={() => void next()} disabled={running || finishing || (page === "finish" && !completed) || (page === "preferences" && !privacyAccepted)}>
              {running ? <RefreshCw size={16} className="spin" /> : finishing ? <RefreshCw size={16} className="spin" /> : page === "finish" ? <Check size={16} /> : <ArrowRight size={16} />}
              {running ? t.checking : finishing ? t.working : page === "finish" ? t.finish : page === "verification" && !completed ? t.runChecks : page === "verification" ? t.next : t.next}
            </button>
            {page === "verification" && failure && !running && <button type="button" className="setup-retry-btn" onClick={() => void runChecks()}>{t.retry}</button>}
          </div>
        </section>
      </main>
    </div>
  );
}
