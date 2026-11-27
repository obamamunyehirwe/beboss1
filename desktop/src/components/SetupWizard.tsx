import { useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, Check, CheckCircle2, Cloud, Database,
  Languages, LockKeyhole, Monitor, Moon, RefreshCw, ShieldCheck, Smartphone,
  Sun, Wifi, X, Zap, Settings, User, ShieldAlert, Shield, Network, Save, Clock
} from "lucide-react";
import { DESKTOP_LANGUAGES, type DesktopLanguage } from "../lib/i18n";
import { checkCloudDatabase } from "../lib/cloud";
import type { DesktopPreferences } from "../lib/types";

type CheckStatus = "pending" | "running" | "complete" | "warning" | "failed";
type StepId = "system" | "device" | "database" | "security" | "cloud";
type PageId = "welcome" | "preferences" | "verification" | "finish";
interface SetupStep {
  id: StepId; title: string; description: string; status: CheckStatus; details: string;
}
interface SetupDiagnostics {
  osPlatform: string; osArch: string; appVersion: string; dbPath: string;
  databaseEncrypted: boolean; databaseCipherVersion: string; databaseIntegrity: string;
  journalMode: string; pendingOutboxCount: number;
}
type WizardCopy = {
  stepNames: string[]; welcomeTag: string; welcomeTitle: string; welcomeBody: string;
  features: { title: string; body: string }[]; installTitle: string; installBody: string;
  preferencesTag: string; preferencesTitle: string; preferencesBody: string;
  language: string; appearance: string; dark: string; light: string; system: string;
  sync: string; syncBody: string; frequency: string; motion: string; motionBody: string;
  startPage: string;
  privacyTitle: string; privacyBody: string; privacyCheck: string; privacyError: string;
  verificationTag: string; verificationTitle: string; verificationBody: string;
  runChecks: string; retry: string; checking: string; finishTag: string; finishTitle: string;
  finishBody: string; installPath: string; localDatabase: string; pending: string;
  cloudWarning: string; back: string; next: string; finish: string; working: string;
  setupError: string; recoverLocalTitle: string; recoverLocalBody: string; recoverLocalButton: string; recoverLocalConfirm: string; recoverLocalComplete: string; statuses: Record<CheckStatus, string>;
  steps: { title: string; description: string }[];
};
const TEXT: Record<DesktopLanguage, WizardCopy> = {
  en: {
    stepNames: ["Welcome", "Preferences", "System checks", "Ready"],
    welcomeTag: "FIRST-RUN SETUP", welcomeTitle: "Prepare your BeBoss workspace.",
    welcomeBody: "Set your desktop preferences, verify the protected on-device recovery store, and confirm that the device is ready before opening owner sign-in.",
    features: [
      { title: "Cloud business data", body: "Supabase PostgreSQL is the source of truth; SQLCipher protects only the local cache and retry queue." },
      { title: "Protected credentials", body: "The operating-system credential vault is tested with a temporary secret." },
      { title: "Persistent device identity", body: "A unique desktop identity is provisioned for shop authorization." },
      { title: "Cloud readiness", body: "The PostgreSQL Data API is checked; SMS sign-in verifies owner and tenant access." }
    ],
    installTitle: "Choose the installation folder first.",
    installBody: "On Windows, choose the application path in the installer directory screen. BeBoss creates its app icon and Start Menu shortcut. Shop records are stored in the Supabase cloud database; this computer keeps only a protected cache, pending retry queue, credentials and device settings.",
    preferencesTag: "PERSONALIZE YOUR WORKSPACE", preferencesTitle: "Make BeBoss work your way.",
    preferencesBody: "These choices are saved in the encrypted desktop preferences store and can be changed later in Settings.",
    language: "Interface language", appearance: "Appearance", dark: "Dark", light: "Light", system: "System",
    sync: "Automatic cloud synchronization", syncBody: "Retry queued changes when the network returns and refresh cloud data on the selected interval.",
    frequency: "Cloud refresh interval", motion: "Reduce interface motion", motionBody: "Respect reduced-motion preference and keep transitions minimal.",
    startPage: "Start page after owner sign-in",
    privacyTitle: "Privacy and device access",
    privacyBody: "BeBoss stores authoritative shop records in its Supabase PostgreSQL cloud database. This computer keeps an encrypted temporary cache and retry queue for continuity, plus credentials and device preferences in protected storage. Printer and file-export access is used when you choose Print, Save or Export. Setup does not request access to unrelated personal files or media.",
    privacyCheck: "I have read and accept this device and data-use notice.",
    privacyError: "Review the access notice and accept it before continuing.",
    verificationTag: "REAL DEVICE VALIDATION", verificationTitle: "Verify this installation.",
    verificationBody: "The checks below verify the native desktop runtime and make a real request to the Supabase PostgreSQL Data API. A live cloud database connection is required to finish first-time setup and sign in; cached data is never treated as a confirmed cloud write.",
    runChecks: "Run system checks", retry: "Retry checks", checking: "Running native checks…",
    finishTag: "SETUP COMPLETE", finishTitle: "Your desktop workspace is ready.",
    finishBody: "The Supabase cloud database and device security checks have passed. Continue to the BeBoss welcome page, then sign in with the shop owner's registered phone and SMS verification code.",
    installPath: "Application data path", localDatabase: "Encrypted cache and retry store", pending: "Pending cloud writes",
    cloudWarning: "The Supabase PostgreSQL database API is unreachable. Connect this device to the internet and verify the cloud endpoint before finishing setup.",
    back: "Back", next: "Next", finish: "Finish setup", working: "Saving preferences…",
    setupError: "Setup could not be completed. Resolve the failed check and retry.",
    recoverLocalTitle: "Recover this desktop from BeBoss Cloud",
    recoverLocalBody: "Only use this after the live cloud check passes. BeBoss will preserve the locked SQLCipher database and its sidecar files in a timestamped recovery folder, create a fresh encrypted cache and keep the original archive for later recovery. Then sign in and restore the verified shop snapshot from Cloud or a linked phone. Records that existed only in the locked offline queue may not be recoverable.",
    recoverLocalButton: "Quarantine local cache and recover",
    recoverLocalConfirm: "The cloud and Windows Credential Manager checks have passed. BeBoss will move the locked database, WAL and SHM files into a recovery archive and create a fresh encrypted cache. The archived files will not be deleted. Any changes stored only in the locked offline queue may be unrecoverable. Continue?",
    recoverLocalComplete: "Old local database files were preserved for recovery at",
    statuses: { pending: "Pending", running: "Checking", complete: "Verified", warning: "Attention", failed: "Failed" },
    steps: [
      { title: "System compatibility", description: "Operating system and native desktop runtime" },
      { title: "Device identity", description: "Persistent desktop identity" },
      { title: "Offline recovery store", description: "SQLCipher cache, credentials and durable retry queue" },
      { title: "Credential vault", description: "Operating-system secure storage" },
      { title: "Cloud connectivity", description: "Live Supabase PostgreSQL Data API request" }
    ]
  },
  rw: {
    stepNames: ["Murakaza neza", "Ibyo ukunda", "Igenzura", "Byiteguye"],
    welcomeTag: "GUTANGIZA BWA MBERE", welcomeTitle: "Tegura BeBoss kuri mudasobwa.",
    welcomeBody: "Hitamo imiterere ukunda, genzura ububiko bw'impinduka zitegereje, kandi wemeze ko database ya Supabase iri kuri internet mbere yo kwinjira nk'umuyobozi.",
    features: [
      { title: "Amakuru yo muri Cloud", body: "Supabase PostgreSQL ni yo ibika amakuru nyayo; SQLCipher ibika cache n'impinduka zitegereje gusa." },
      { title: "Amakuru y'ibanga arinzwe", body: "Ububiko bw'ibanga bwa sisitemu bugenzurwa hakoreshejwe ijambo ry'ibanga ry'agateganyo." },
      { title: "Indangamuntu y'igikoresho", body: "Mudasobwa ihabwa indangamuntu yayo yo kwemezwa n'iduka." },
      { title: "Guhuza na Cloud", body: "Supabase PostgreSQL Data API irageragezwa; SMS yemeza umuyobozi n'uburenganzira bw'iduka." }
    ],
    installTitle: "Banza uhitemo aho porogaramu izajya.",
    installBody: "Kuri Windows, hitamo aho BeBoss izashyirwa mu idirishya ry'installer. BeBoss ikora ikirango cya porogaramu na shortcut muri Start Menu. Amakuru nyayo y'ubucuruzi abikwa muri database ya Supabase kuri cloud; mudasobwa igumana cache n'umurongo w'impinduka zitegereje koherezwa, ibanga n'igenamiterere gusa.",
    preferencesTag: "HITAMO IBYO UKUNDA", preferencesTitle: "Tegura BeBoss uko ubishaka.",
    preferencesBody: "Ibi bihitamo bibikwa mu bubiko burinzwe kandi ushobora kubihindura muri Settings nyuma.",
    language: "Ururimi", appearance: "Imigaragarire", dark: "Umwijima", light: "Umucyo", system: "Sisitemu",
    sync: "Guhuza amakuru na Cloud byikora", syncBody: "Ongera ugerageze kohereza impinduka igihe internet igarutse kandi wongere usome amakuru ku gihe wahisemo.",
    frequency: "Igihe cyo kongera gusoma amakuru", motion: "Gabanya animasiyo", motionBody: "Kurikiza ihitamo ryo kugabanya imigendere y'amashusho.",
    startPage: "Ipaji ibanza nyuma yo kwinjira",
    privacyTitle: "Ibanga n'uburenganzira bwa mudasobwa",
    privacyBody: "Amakuru nyayo y'ubucuruzi abikwa muri database ya Supabase PostgreSQL. Mudasobwa igumana cache n'umurongo w'impinduka zitegereje byarinzwe n'ibanga, hamwe n'amakuru yo kwinjira n'igenamiterere. Printer n'ububiko bwa dosiye bikoreshwa igihe uhisemo Gucapa, Kubika cyangwa Kohereza. Iyi setup ntisaba kugera ku mafoto cyangwa izindi dosiye zawe zitari iz'akazi.",
    privacyCheck: "Nasomye kandi nemeye aya mabwiriza yo gukoresha mudasobwa n'amakuru.",
    privacyError: "Soma amabwiriza yo kugera ku makuru hanyuma uyemere mbere yo gukomeza.",
    verificationTag: "IGENZURA NYAKURI", verificationTitle: "Genza iyi installation.",
    verificationBody: "Igenzura risuzuma porogaramu ya mudasobwa kandi rikohereza ubusabe nyakuri kuri Supabase PostgreSQL Data API. Database yo muri Cloud igomba kuboneka mbere yo kurangiza setup no kwinjira; cache ntifatwa nk'impinduka yemejwe na server.",
    runChecks: "Tangira igenzura", retry: "Ongera ugenzure", checking: "Igenzura rirakorwa…",
    finishTag: "BYARANGIYE", finishTitle: "Ahantu ho gukorera hariteguye.",
    finishBody: "Igenzura ry'umutekano wa mudasobwa ryatsinze. Komeza ujye ku rupapuro rwa BeBoss, winjire ukoresheje telefone yanditse y'umuyobozi na kode ya SMS.",
    installPath: "Aho amakuru abikwa", localDatabase: "Cache n'umurongo wo kohereza impinduka", pending: "Impinduka zitegereje koherezwa",
    cloudWarning: "Database ya Supabase PostgreSQL ntiboneka. Huza internet kandi ugenzure aderesi ya cloud mbere yo kurangiza setup.",
    back: "Subira inyuma", next: "Komeza", finish: "Rangiza", working: "Kubika ibyo wahisemo…",
    setupError: "Igenzura ntiryashoboye kurangira. Kosora ikibazo hanyuma wongere ugerageze.",
    recoverLocalTitle: "Kugarura mudasobwa ukoresheje BeBoss Cloud",
    recoverLocalBody: "BeBoss izabika database ya SQLCipher itabasha gufunguka n'umurongo w'impinduka zitegereje koherezwa mu bubiko bufite itariki, ibike urufunguzo rwa kera muri OS Vault niba rukiboneka, hanyuma ikore cache nshya irinzwe. Nyuma ya setup, injira kuri konti y'iduka maze ugarure amakuru yemejwe ari muri Cloud. Impinduka zari muri queue idashobora gufunguka zishobora kutazagarurwa.",
    recoverLocalButton: "Bika cache yangiritse maze ukomeze",
    recoverLocalConfirm: "BeBoss izimurira database idafunguka n'impinduka zitegereje koherezwa mu bubiko bwo kuyisubizamo, hanyuma ikore cache nshya. Amadosiye ya kera ntazasibwa. Impinduka zari muri queue ifunze gusa zishobora kutazagarurwa. Urashaka gukomeza?",
    recoverLocalComplete: "Amadosiye ya database ya kera yabitswe hano kugira ngo azagarurwe nyuma",
    statuses: { pending: "Birategereje", running: "Irakorwa", complete: "Byemejwe", warning: "Icyitonderwa", failed: "Byanze" },
    steps: [
      { title: "Sisitemu", description: "Operating system na porogaramu ya desktop" },
      { title: "Indangamuntu", description: "Indangamuntu ihoraho ya mudasobwa" },
      { title: "Ububiko bwo kugarura", description: "SQLCipher, cache n'umurongo wo kohereza" },
      { title: "Ububiko bw'ibanga", description: "Umutekano wa sisitemu" },
      { title: "Guhuza na Cloud", description: "Ubusabe nyakuri kuri Supabase PostgreSQL Data API" }
    ]
  },
  fr: {
    stepNames: ["Bienvenue", "Préférences", "Vérifications", "Prêt"],
    welcomeTag: "PREMIÈRE INSTALLATION", welcomeTitle: "Préparez votre espace BeBoss.",
    welcomeBody: "Choisissez vos préférences, vérifiez le stockage de récupération protégé et confirmez que la base cloud Supabase est joignable avant la connexion propriétaire.",
    features: [
      { title: "Données cloud", body: "Supabase PostgreSQL est la source de vérité ; SQLCipher protège uniquement le cache et la file de reprise locale." },
      { title: "Identifiants protégés", body: "Le coffre du système est testé avec un secret temporaire." },
      { title: "Identité persistante", body: "Une identité unique de bureau est créée pour l'autorisation de la boutique." },
      { title: "Disponibilité du cloud", body: "L'API PostgreSQL Supabase est testée ; le SMS confirme le propriétaire et les droits du magasin." }
    ],
    installTitle: "Choisissez d'abord le dossier d'installation.",
    installBody: "Sous Windows, choisissez le chemin de l'application dans l'écran du dossier de l'installateur. BeBoss crée l'icône et le raccourci du menu Démarrer. Les données commerciales sont stockées dans la base cloud Supabase ; cet ordinateur ne conserve qu'un cache protégé, une file de reprise, les identifiants et les préférences de l'appareil.",
    preferencesTag: "PERSONNALISEZ VOTRE ESPACE", preferencesTitle: "Configurez BeBoss à votre façon.",
    preferencesBody: "Ces choix sont enregistrés dans les préférences chiffrées et restent modifiables dans les paramètres.",
    language: "Langue de l'interface", appearance: "Apparence", dark: "Sombre", light: "Clair", system: "Système",
    sync: "Synchronisation cloud automatique", syncBody: "Réessayez les changements en attente au retour du réseau et actualisez les données selon l'intervalle choisi.",
    frequency: "Intervalle d'actualisation", motion: "Réduire les animations", motionBody: "Respecter la préférence de réduction des mouvements.",
    startPage: "Page d'accueil après connexion",
    privacyTitle: "Confidentialité et accès à l'appareil",
    privacyBody: "Les données commerciales faisant autorité sont stockées dans Supabase PostgreSQL. Cet ordinateur conserve un cache temporaire chiffré et une file de reprise, ainsi que les identifiants et préférences protégés. L'accès à l'imprimante et aux fichiers est utilisé lorsque vous choisissez Imprimer, Enregistrer ou Exporter. L'installation ne demande pas l'accès aux fichiers personnels ou médias sans rapport avec ces fonctions.",
    privacyCheck: "J'ai lu et j'accepte cette notice d'utilisation de l'appareil et des données.",
    privacyError: "Veuillez lire et accepter la notice d'accès avant de continuer.",
    verificationTag: "VALIDATION RÉELLE", verificationTitle: "Vérifiez cette installation.",
    verificationBody: "Les contrôles vérifient le composant natif et envoient une vraie requête à l'API de données Supabase PostgreSQL. La base cloud doit être joignable pour terminer la première configuration et se connecter ; le cache n'est jamais considéré comme une écriture confirmée dans le cloud.",
    runChecks: "Lancer les vérifications", retry: "Réessayer", checking: "Vérifications en cours…",
    finishTag: "INSTALLATION TERMINÉE", finishTitle: "Votre espace de travail est prêt.",
    finishBody: "Les contrôles locaux ont réussi. Continuez vers l'accueil BeBoss, puis connectez-vous avec le téléphone enregistré du propriétaire et le code SMS.",
    installPath: "Chemin des données applicatives", localDatabase: "Cache chiffré et file de reprise", pending: "Éléments de synchronisation en attente",
    cloudWarning: "L'API de la base Supabase PostgreSQL est inaccessible. Connectez l'appareil à Internet et vérifiez le point de terminaison cloud avant de terminer.",
    back: "Retour", next: "Suivant", finish: "Terminer", working: "Enregistrement des préférences…",
    setupError: "La configuration n'a pas abouti. Corrigez le contrôle en échec et réessayez.",
    recoverLocalTitle: "Récupérer cet ordinateur depuis BeBoss Cloud",
    recoverLocalBody: "BeBoss déplacera la base SQLCipher illisible et la file de reprise dans un dossier horodaté, conservera l'ancienne clé dans le coffre du système si elle est disponible, puis créera un nouveau cache chiffré. Après la configuration, connectez-vous au compte de la boutique et restaurez l'instantané cloud vérifié. Les changements présents uniquement dans une file locale illisible peuvent ne pas être récupérables.",
    recoverLocalButton: "Mettre le cache local en quarantaine et récupérer",
    recoverLocalConfirm: "BeBoss déplacera la base illisible et la file de reprise dans un dossier de récupération et créera un nouveau cache chiffré. Les anciens fichiers seront conservés, pas supprimés. Les changements présents uniquement dans la file locale verrouillée peuvent ne pas être récupérables. Continuer ?",
    recoverLocalComplete: "Les anciens fichiers de la base locale ont été conservés pour récupération ici",
    statuses: { pending: "En attente", running: "Vérification", complete: "Vérifié", warning: "Attention", failed: "Échec" },
    steps: [
      { title: "Compatibilité système", description: "Système et exécution native" },
      { title: "Identité de l'appareil", description: "Identité persistante du bureau" },
      { title: "Base chiffrée", description: "Cache SQLCipher et file durable" },
      { title: "Coffre d'identifiants", description: "Stockage sécurisé du système" },
      { title: "Connexion cloud", description: "Requête réelle à l'API Supabase PostgreSQL" }
    ]
  },
  sw: {
    stepNames: ["Karibu", "Mapendeleo", "Ukaguzi", "Tayari"],
    welcomeTag: "MARA YA KWANZA", welcomeTitle: "Andaa sehemu yako ya BeBoss.",
    welcomeBody: "Chagua mapendeleo ya kompyuta, kagua hifadhi ya foleni fiche na uthibitishe kuwa hifadhidata ya Supabase inapatikana kabla ya kuingia.",
    features: [
      { title: "Data ya Cloud", body: "Supabase PostgreSQL ndiyo hifadhidata kuu; SQLCipher hulinda cache na foleni ya kutuma mabadiliko tu." },
      { title: "Siri zilizolindwa", body: "Hifadhi salama ya mfumo hujaribiwa kwa siri ya muda." },
      { title: "Utambulisho wa kifaa", body: "Kompyuta hupata utambulisho wa kudumu kwa idhini ya duka." },
      { title: "Utayari wa mtandao", body: "API ya Supabase PostgreSQL hupimwa; SMS huthibitisha mmiliki na ruhusa za duka." }
    ],
    installTitle: "Chagua folda ya usakinishaji kwanza.",
    installBody: "Kwenye Windows, chagua mahali pa programu kwenye ukurasa wa folda wa kisakinishi. BeBoss hutengeneza ikoni na njia ya mkato ya Start Menu. Data halisi ya biashara huhifadhiwa kwenye hifadhidata ya Supabase Cloud; kompyuta huweka cache fiche, foleni ya majaribio ya kutuma, siri na mapendeleo ya kifaa tu.",
    preferencesTag: "WEKA MAPENDELEO YAKO", preferencesTitle: "Tumia BeBoss unavyopendelea.",
    preferencesBody: "Chaguo hizi huhifadhiwa kwa usimbaji fiche na zinaweza kubadilishwa baadaye kwenye Settings.",
    language: "Lugha ya kiolesura", appearance: "Mwonekano", dark: "Giza", light: "Mwanga", system: "Mfumo",
    sync: "Usawazishaji wa mtandao wa kiotomatiki", syncBody: "Jaribu tena mabadiliko yaliyosubiri mtandao unaporudi na usasishe data kwa muda uliochagua.",
    frequency: "Muda wa kusasisha data", motion: "Punguza mwendo", motionBody: "Heshimu upendeleo wa kupunguza uhuishaji.",
    startPage: "Ukurasa wa kuanza baada ya mmiliki kuingia",
    privacyTitle: "Faragha na ufikiaji wa kifaa",
    privacyBody: "Data halisi ya biashara huhifadhiwa kwenye Supabase PostgreSQL. Kompyuta huweka cache ya muda iliyosimbwa na foleni ya kutuma tena, pamoja na siri na mapendeleo yaliyolindwa. Ufikiaji wa kichapishi na faili hutumika unapochagua Chapisha, Hifadhi au Hamisha. Usakinishaji hauhitaji ufikiaji wa faili binafsi au midia isiyohusiana na kazi hizo.",
    privacyCheck: "Nimesoma na kukubali taarifa hii ya matumizi ya kifaa na data.",
    privacyError: "Soma na ukubali taarifa ya ufikiaji kabla ya kuendelea.",
    verificationTag: "UKAGUZI HALISI", verificationTitle: "Thibitisha usakinishaji huu.",
    verificationBody: "Ukaguzi huthibitisha programu asilia na hutuma ombi halisi kwa Supabase PostgreSQL Data API. Hifadhidata ya Cloud lazima ipatikane ili kumaliza usanidi wa kwanza na kuingia; cache haihesabiwi kama maandishi yaliyohifadhiwa kwenye Cloud.",
    runChecks: "Anza ukaguzi", retry: "Jaribu tena", checking: "Ukaguzi unaendelea…",
    finishTag: "USANIDI UMEKAMILIKA", finishTitle: "Sehemu yako ya kazi iko tayari.",
    finishBody: "Ukaguzi wa usalama wa ndani umefaulu. Endelea kwenye ukurasa wa BeBoss kisha ingia kwa simu iliyosajiliwa ya mmiliki na msimbo wa SMS.",
    installPath: "Mahali pa data ya programu", localDatabase: "Cache fiche na foleni ya kutuma tena", pending: "Rekodi zinazosubiri kusawazishwa",
    cloudWarning: "Supabase PostgreSQL Data API haipatikani. Unganisha kompyuta kwenye intaneti na uthibitishe anwani ya Cloud kabla ya kumaliza usanidi.",
    back: "Rudi", next: "Endelea", finish: "Maliza usanidi", working: "Inahifadhi mapendeleo…",
    setupError: "Usanidi haujakamilika. Rekebisha ukaguzi ulioshindwa kisha ujaribu tena.",
    recoverLocalTitle: "Rejesha kompyuta hii kutoka BeBoss Cloud",
    recoverLocalBody: "BeBoss itahamisha hifadhidata ya SQLCipher isiyoweza kusomwa na foleni ya kutuma mabadiliko kwenye folda yenye muhuri wa muda, itahifadhi ufunguo wa zamani kwenye hifadhi salama ya mfumo ikiwa bado upo, kisha itaunda cache mpya iliyosimbwa. Baada ya usanidi, ingia kwa akaunti ya duka na urejeshe nakala iliyothibitishwa ya Cloud. Mabadiliko yaliyokuwepo kwenye foleni fiche isiyosomeka pekee huenda yasirejeshwe.",
    recoverLocalButton: "Hifadhi cache ya zamani kando na urejeshe",
    recoverLocalConfirm: "BeBoss itahamisha hifadhidata isiyosomeka na foleni ya mabadiliko kwenye folda ya urejeshaji na kuunda cache mpya fiche. Faili za zamani zitahifadhiwa, hazitafutwa. Mabadiliko yaliyokuwepo kwenye foleni iliyofungwa pekee huenda yasirejeshwe. Endelea?",
    recoverLocalComplete: "Faili za zamani za hifadhidata zimehifadhiwa kwa urejeshaji hapa",
    statuses: { pending: "Inasubiri", running: "Inakagua", complete: "Imethibitishwa", warning: "Tahadhari", failed: "Imeshindwa" },
    steps: [
      { title: "Ulinganifu wa mfumo", description: "Mfumo wa uendeshaji na runtime" },
      { title: "Utambulisho wa kifaa", description: "Utambulisho wa kudumu wa kompyuta" },
      { title: "Hifadhi ya kurejesha", description: "Cache ya SQLCipher na foleni ya kudumu" },
      { title: "Hifadhi ya siri", description: "Usalama wa mfumo" },
      { title: "Muunganisho wa mtandao", description: "Ombi halisi kwa Supabase PostgreSQL Data API" }
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

const STEP_ICONS: Record<StepId, React.ComponentType<{ className?: string }>> = {
  system: Monitor,
  device: Smartphone,
  database: Database,
  security: ShieldCheck,
  cloud: Cloud,
};

export function SetupWizard({initialPreferences,onComplete,onRecoverLocalDatabase}:{
 initialPreferences:DesktopPreferences;
 onComplete:(preferences:DesktopPreferences,privacyAccepted:boolean)=>Promise<void>;
 onRecoverLocalDatabase:()=>Promise<{backupPath:string;archivedFiles:string[];recoveryKeyReference:string|null}>;
}) {
  const [preferences,setPreferences]=useState<DesktopPreferences>(initialPreferences);
  const [privacyAccepted,setPrivacyAccepted]=useState(false);
  const [page,setPage]=useState<PageId>("welcome");
  const [running,setRunning]=useState(false);
  const [finishing,setFinishing]=useState(false);
  const [completed,setCompleted]=useState(false);
  const [recoveryCompleted,setRecoveryCompleted]=useState(false);
  const [databaseLocked,setDatabaseLocked]=useState(false);
  const [cloudReachable,setCloudReachable]=useState(false);
  const [vaultReady,setVaultReady]=useState(false);
  const [deviceReady,setDeviceReady]=useState(false);
  const [databaseMessage,setDatabaseMessage]=useState("");
  const [recoveryArchiveCount,setRecoveryArchiveCount]=useState(0);
  const [dpapiBackupAvailable,setDpapiBackupAvailable]=useState(false);
  const [steps,setSteps]=useState<SetupStep[]>(INITIAL_STEPS);
  const [activeStep,setActiveStep]=useState<StepId|null>(null);
  const [diagnostics,setDiagnostics]=useState<SetupDiagnostics|null>(null);
  const [failure,setFailure]=useState("");
  const [logs,setLogs]=useState<string[]>([]);
  const [logsExpanded,setLogsExpanded]=useState(false);
  const t=TEXT[preferences.language];
  const pageIndex=(["welcome","preferences","verification","finish"] as PageId[]).indexOf(page);
  const progress = pageIndex / 3;
  const log=(message:string)=>setLogs(prev=>[...prev.slice(-9),new Date().toLocaleTimeString()+"  "+message]);
  const updateStep=(id:StepId,status:CheckStatus,details:string)=>setSteps(prev=>prev.map(step=>step.id===id?{...step,status,details}:step));
  const translatedSteps=steps.map((step,index)=>({...step,title:t.steps[index].title,description:t.steps[index].description}));
  const recoveryReady=databaseLocked&&cloudReachable&&vaultReady&&deviceReady&&!running&&!finishing&&!recoveryCompleted;
  const completedChecks = steps.filter(s => s.status === "complete").length;

  async function runChecks(allowWhileRunning=false):Promise<boolean>{
   if(running&&!allowWhileRunning)return false;
   if(!window.beBossDesktop?.isNative){
    const message="This is a browser preview. Launch the installed BeBoss Desktop app to validate Windows, SQLCipher and Credential Manager.";
    setFailure(message);setSteps(current=>current.map(step=>({...step,status:"failed",details:message})));
    log("Native validation is unavailable in a browser preview.");return false;
   }
   setRunning(true);setFailure("");setCompleted(false);setDiagnostics(null);
   setCloudReachable(false);setVaultReady(false);setDeviceReady(false);setSteps(INITIAL_STEPS);setLogs([]);
   const failures:string[]=[];
   try{
    let active:StepId="system";setActiveStep(active);
    updateStep(active,"running","Inspecting the native desktop runtime and local recovery state without replacing existing encrypted data…");
    log("Checking native desktop runtime and local recovery state.");
    const preflight=await window.beBossDesktop.setupPreflight();
    if(!preflight.osPlatform||!preflight.osArch||!preflight.databasePath||!preflight.appVersion)throw new Error("The native runtime did not return complete installation diagnostics.");
    setRecoveryArchiveCount(preflight.recoveryArchiveCount);setDpapiBackupAvailable(preflight.dpapiBackupAvailable);
    let localReady=preflight.databaseState==="ready";setDatabaseLocked(!localReady);setDatabaseMessage(preflight.databaseMessage||"");
    updateStep(active,"complete",preflight.osPlatform+" · "+preflight.osArch+" · BeBoss "+preflight.appVersion);
    log("Native runtime responded; existing local files were not reset.");

    active="device";setActiveStep(active);updateStep(active,"running","Checking this installation's persistent device identity…");
    try{
     const id=await window.beBossDesktop.getDeviceId();
     if(!id||id.length<16)throw new Error("The native runtime returned an invalid device identity.");
     setDeviceReady(true);updateStep(active,"complete","Persistent identity ready · "+id.slice(0,8)+"…"+id.slice(-6));
     log("Persistent desktop identity verified.");
    }catch(error){const message=errorMessage(error);failures.push(message);updateStep(active,"failed",message);log("Device identity check failed: "+message);}

    active="database";setActiveStep(active);
    if(localReady){
     updateStep(active,"running","Verifying SQLCipher encryption, integrity and the durable retry queue…");
     try{
      const system=await window.beBossDesktop.systemDiagnostics();
      if(!system.databaseEncrypted||!system.databaseCipherVersion)throw new Error("SQLCipher could not confirm local encryption.");
      if(system.databaseIntegrity!=="ok")throw new Error("The local encrypted recovery store failed its integrity check. Preserve original files before recovery.");
      if(system.journalMode.toLowerCase()!=="wal")throw new Error("The local recovery store is not using WAL mode.");
      updateStep(active,"complete","SQLCipher "+system.databaseCipherVersion+" · integrity OK · WAL · "+system.pendingOutboxCount+" pending write(s)");
      setDiagnostics({osPlatform:system.osPlatform,osArch:system.osArch,appVersion:system.appVersion,dbPath:system.dbPath,databaseEncrypted:!!system.databaseEncrypted,databaseCipherVersion:system.databaseCipherVersion,databaseIntegrity:system.databaseIntegrity,journalMode:system.journalMode,pendingOutboxCount:system.pendingOutboxCount});
      log("Encrypted local cache and retry queue passed integrity checks.");
     }catch(error){
      const message=errorMessage(error);failures.push(message);localReady=false;setDatabaseLocked(true);setDatabaseMessage(message);
      updateStep(active,"warning",message);log("Local store needs attention: "+message);
     }
    }else{
     updateStep(active,"warning","Local cache is locked; original database files and queue remain unchanged. "+(preflight.databaseMessage||""));
     log("Local cache is locked; continuing with independent credential and cloud checks.");
    }

    active="security";setActiveStep(active);updateStep(active,"running","Testing the operating-system credential vault independently of the local database…");
    try{
     await window.beBossDesktop.testCredentialVault();setVaultReady(true);
     updateStep(active,"complete","Credential Manager write/read/delete passed with a temporary isolated entry.");
     log("Operating-system credential vault passed.");
    }catch(error){const message=errorMessage(error);failures.push(message);updateStep(active,"failed",message);log("Credential vault failed: "+message);}

    active="cloud";setActiveStep(active);updateStep(active,"running","Sending a real request to Supabase PostgreSQL Data API…");
    try{
     const probe=await checkCloudDatabase();setCloudReachable(true);
     updateStep(active,"complete","Supabase PostgreSQL Data API reachable · "+probe.latencyMs+" ms · "+probe.host);
     log("Cloud database is reachable; owner and tenant access are verified during SMS sign-in.");
    }catch(error){const message=errorMessage(error);failures.push(message);updateStep(active,"failed",message);log("Cloud connectivity failed: "+message);}
    setActiveStep(null);

    if(!localReady){
     setDatabaseLocked(true);
     setFailure("The existing local cache is locked. BeBoss has not deleted or overwritten it. Recovery is enabled only after device identity, Credential Manager and live Supabase checks all pass. Then archive the old files and restore shop data from Cloud or a linked phone."+(failures.length?" Details: "+failures.join(" · "):""));
     return false;
    }
    if(failures.length){setFailure("Some installation checks need attention: "+failures.join(" · "));return false;}
    setCompleted(true);log("All required local security and cloud checks passed.");return true;
   }catch(error){
    const message=errorMessage(error);setFailure(message);
    setSteps(current=>current.map(step=>step.id==="system"?{...step,status:"failed",details:message}:step));
    log("Setup preflight failed: "+message);return false;
   }finally{setRunning(false);}
  }

  async function recoverLocalCache(){
   if(running||finishing||recoveryCompleted)return;
   if(!window.beBossDesktop?.isNative){setFailure("Local recovery is available only inside the installed BeBoss Desktop application.");return;}
   if(!databaseLocked||!cloudReachable||!vaultReady||!deviceReady){
    setFailure("Recovery is disabled until device identity, Credential Manager and live Supabase checks all pass. Run the checks again after fixing any failed item.");return;
   }
   if(!window.confirm(t.recoverLocalConfirm))return;
   setRunning(true);setFailure("");
   try{
    const result=await onRecoverLocalDatabase();setRecoveryCompleted(true);setDatabaseLocked(false);
    log(t.recoverLocalComplete+": "+result.backupPath);
    const ok=await runChecks(true);if(!ok)setFailure(current=>current||"The original files remain preserved. Resolve the remaining check before signing in and restoring the shop snapshot.");
   }catch(error){const message=errorMessage(error);setFailure(message);log("Local recovery did not complete: "+message);}
   finally{setRunning(false);}
  }

  async function next(){
   if(page==="preferences"&&!privacyAccepted){setFailure(t.privacyError);return;}
   if(page==="verification"){if(!completed){const ok=await runChecks();if(!ok)return;}setPage("finish");return;}
   if(page==="finish"){if(!completed||!diagnostics)return;setFinishing(true);setFailure("");try{await onComplete(preferences,privacyAccepted);}catch(error){setFailure(errorMessage(error));}finally{setFinishing(false);}return;}
   setPage(page==="welcome"?"preferences":"verification");setFailure("");
  }
  const statusIcon=(status:CheckStatus)=>status==="running"?<RefreshCw size={13} className="spin"/>:status==="complete"?<Check size={13}/>:status==="warning"?<Wifi size={13}/>:status==="failed"?<X size={13}/>:<span className="setup-status-pending"/>;
  const update=<K extends keyof DesktopPreferences>(key:K,value:DesktopPreferences[K])=>setPreferences(current=>({...current,[key]:value}));

  return <div className="setup-wizard" data-theme={preferences.theme} data-motion={preferences.reducedMotion?"reduced":"full"}>
    <aside className="setup-visual" aria-label="BeBoss retail workspace">
      <img className="setup-visual-image" src="/Friendly%20Modern%20Store%20Checkout.png" alt="" aria-hidden="true" />
      <div className="setup-visual-brand">
        <img src="/beboss-app-icon.png" alt="" />
        <div><strong>BeBoss</strong><span>RETAIL OPERATIONS</span></div>
      </div>
      <div className="setup-visual-copy">
        <span className="setup-visual-kicker">ONE CONNECTED WORKSPACE</span>
        <h1>Every part of your shop, in sync.</h1>
        <p>Sales, stock, people and branches—together in one clear, protected workspace.</p>
      </div>
      <div className="setup-visual-bottom">
        <span><ShieldCheck size={15} /> Secure owner access</span>
        <span><Cloud size={15} /> Cloud-connected operations</span>
      </div>
    </aside>
    <section className="setup-workspace" aria-label="Desktop setup wizard">
    <header className="setup-header">
      <div className="setup-brand">
        <img src="/beboss-app-icon.png" alt="BeBoss" className="setup-brand-icon" />
        <div>
          <strong>BeBoss Desktop</strong>
          <small>RETAIL OPERATIONS PLATFORM</small>
        </div>
      </div>
      <div className="setup-header-status">
        <span><LockKeyhole size={13} /> PRIVATE CLOUD WORKSPACE</span>
        <div className="setup-progress">
          <span className="setup-progress-label">STEP {pageIndex + 1} <span className="setup-progress-total">/ 4</span></span>
          <div className="setup-progress-bar">
            <div className="setup-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </div>
    </header>

    <nav className="setup-stepper" aria-label="Setup progress">
      {t.stepNames.map((name, index) => {
        const isActive = pageIndex === index;
        const isComplete = pageIndex > index;
        return (
          <div key={name} className={`setup-stepper-item ${isActive ? "active" : isComplete ? "complete" : ""}`} aria-current={isActive ? "step" : undefined}>
            <div className="setup-stepper-badge">
              {isComplete ? <Check size={12} /> : <span>{index + 1}</span>}
            </div>
            <strong>{name}</strong>
          </div>
        );
      })}
    </nav>

    <main className="setup-main">
      <section className="setup-card">
        <div className="setup-content" key={page}>
          {page === "welcome" && (
            <>
              <div className="setup-heading">
                <span className="setup-icon"><Zap size={24} /></span>
                <div>
                  <small className="setup-eyebrow muted">{t.welcomeTag}</small>
                  <h1>{t.welcomeTitle}</h1>
                  <p>{t.welcomeBody}</p>
                </div>
              </div>
              <div className="setup-feature-grid">
                {t.features.map((feature, i) => {
                  const Icon = [Database, ShieldCheck, Smartphone, Cloud][i];
                  return (
                    <article key={i} className="setup-feature-card">
                      <div className="setup-feature-icon"><Icon size={20} /></div>
                      <div>
                        <strong>{feature.title}</strong>
                        <span>{feature.body}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="setup-install-note">
                <div className="setup-install-icon"><Monitor size={18} /></div>
                <div>
                  <strong>{t.installTitle}</strong>
                  <span>{t.installBody}</span>
                </div>
              </div>
            </>
          )}
          {page === "preferences" && (
            <>
              <div className="setup-heading">
                <span className="setup-icon"><Languages size={24} /></span>
                <div>
                  <small className="setup-eyebrow muted">{t.preferencesTag}</small>
                  <h1>{t.preferencesTitle}</h1>
                  <p>{t.preferencesBody}</p>
                </div>
              </div>
              <div className="setup-settings-grid">
                <div className="setup-settings-panel">
                  <div className="setup-preference-section">
                    <label className="setup-field-label">{t.language}</label>
                    <div className="setup-language-grid">
                      {DESKTOP_LANGUAGES.map(item => (
                        <button key={item.code} type="button" className={`setup-lang-btn ${preferences.language === item.code ? "selected" : ""}`} onClick={() => update("language", item.code)}>
                          <span>{item.short}</span><strong>{item.label}</strong>{preferences.language === item.code && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="setup-preference-section">
                    <label className="setup-field-label">{t.appearance}</label>
                    <div className="setup-choice-row">
                      <button type="button" className={`setup-choice-btn ${preferences.theme === "dark" ? "selected" : ""}`} onClick={() => update("theme", "dark")}><Moon size={17} />{t.dark}</button>
                      <button type="button" className={`setup-choice-btn ${preferences.theme === "light" ? "selected" : ""}`} onClick={() => update("theme", "light")}><Sun size={17} />{t.light}</button>
                      <button type="button" className={`setup-choice-btn ${preferences.theme === "system" ? "selected" : ""}`} onClick={() => update("theme", "system")}><Monitor size={17} />{t.system}</button>
                    </div>
                  </div>
                  <div className="setup-preference-section">
                    <label className="setup-field-label">{t.sync}</label>
                    <p className="setup-preference-desc">{t.syncBody}</p>
                    <div className="setup-toggle-row">
                      <span><strong>{t.sync}</strong><small>{t.syncBody}</small></span>
                      <input type="checkbox" checked={preferences.autoSync} onChange={e => update("autoSync", e.target.checked)} className="setup-checkbox" />
                    </div>
                    <div className="setup-toggle-row">
                      <span><strong>{t.frequency}</strong><small>{t.syncBody}</small></span>
                      <select value={preferences.refreshMinutes} onChange={e => update("refreshMinutes", Number(e.target.value) as DesktopPreferences["refreshMinutes"])} className="setup-select">
                        <option value={0}>Manual</option>
                        <option value={1}>1 minute</option>
                        <option value={5}>5 minutes</option>
                        <option value={15}>15 minutes</option>
                      </select>
                    </div>
                  </div>
                  <div className="setup-preference-section">
                    <label className="setup-field-label">{t.motion}</label>
                    <p className="setup-preference-desc">{t.motionBody}</p>
                    <div className="setup-toggle-row">
                      <span><strong>{t.motion}</strong><small>{t.motionBody}</small></span>
                      <input type="checkbox" checked={preferences.reducedMotion} onChange={e => update("reducedMotion", e.target.checked)} className="setup-checkbox" />
                    </div>
                  </div>
                  <div className="setup-preference-section">
                    <label className="setup-field-label">{t.startPage}</label>
                    <p className="setup-preference-desc">Choose the desktop page opened after sign-in.</p>
                    <select value={preferences.defaultView} onChange={e => update("defaultView", e.target.value as DesktopPreferences["defaultView"])} className="setup-select">
                      <option value="welcome">Welcome</option>
                      <option value="overview">Overview</option>
                      <option value="management">Management center</option>
                    </select>
                  </div>
                </div>
                <section className="setup-privacy-notice" aria-labelledby="setup-privacy-title">
                  <div className="setup-privacy-icon"><ShieldCheck size={20} /></div>
                  <div>
                    <strong id="setup-privacy-title">{t.privacyTitle}</strong>
                    <p>{t.privacyBody}</p>
                  </div>
                  <label className="setup-privacy-accept">
                    <input type="checkbox" checked={privacyAccepted} onChange={e => { setPrivacyAccepted(e.target.checked); if (e.target.checked) setFailure(""); }} className="setup-checkbox" />
                    <span>{t.privacyCheck}</span>
                  </label>
                  {failure && <p className="setup-error" role="alert">{failure}</p>}
                </section>
              </div>
            </>
          )}
          {page === "verification" && (
            <>
              <div className="setup-heading setup-heading-compact">
                <span className={`setup-icon ${completed ? "setup-icon-success" : ""}`}>{completed ? <CheckCircle2 size={24} /> : <Activity size={24} className="spin" />}</span>
                <div>
                  <small className="setup-eyebrow muted">{t.verificationTag}</small>
                  <h1>{completed ? t.finishTitle : t.verificationTitle}</h1>
                  <p>{t.verificationBody}</p>
                </div>
                <div className="setup-checks-progress">
                  <div className="setup-checks-progress-bar">
                    <div className="setup-checks-progress-fill" style={{ width: `${(completedChecks / 5) * 100}%` }} />
                  </div>
                  <span className="setup-checks-progress-text">{completedChecks} of 5 checks passed</span>
                </div>
              </div>
              <div className="setup-checks" aria-live="polite">
                {translatedSteps.map(step => {
                  const Icon = STEP_ICONS[step.id];
                  const statusCls = step.status === "failed" ? "failed" : step.status === "warning" ? "warning" : step.status === "complete" ? "ready" : "";
                  return (
                    <div className="setup-check" key={step.id}>
                      <div className={`setup-check-wrapper ${statusCls}`}>
                        <span className="setup-check-badge">{statusIcon(step.status)}</span>
                        <div className="setup-check-info">
                          <div className="setup-check-header">
                            <strong>{step.title}</strong>
                            <span className={`setup-check-status ${statusCls}`}>{t.statuses[step.status]}</span>
                          </div>
                          <small>{step.details}</small>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {databaseLocked && (
                <section className="setup-recovery-panel" aria-label={t.recoverLocalTitle}>
                  <div className="setup-recovery-icon"><Database size={20} /></div>
                  <div className="setup-recovery-copy">
                    <strong>{t.recoverLocalTitle}</strong>
                    <p>{t.recoverLocalBody}</p>
                    {databaseMessage && <small className="setup-database-message">{databaseMessage}</small>}
                    <small>{recoveryArchiveCount} recovery archive(s) · Windows DPAPI backup {dpapiBackupAvailable ? "available" : "not found"}</small>
                    <button type="button" className="setup-recovery-btn" disabled={!recoveryReady} onClick={() => void recoverLocalCache()}>
                      <RefreshCw size={14} /> {running ? t.checking : t.recoverLocalButton}
                    </button>
                    {!cloudReachable && <em>Cloud access must pass before replacing the local cache. Original files remain untouched.</em>}
                    {cloudReachable && (!vaultReady || !deviceReady) && <em>Device identity and Credential Manager checks must pass before recovery is enabled.</em>}
                  </div>
                </section>
              )}
              {failure && <p className="setup-error" role="alert">{failure}</p>}
              <details className="setup-log-panel" open={logsExpanded} onToggle={e => setLogsExpanded(e.currentTarget.open)}>
                <summary>
                  <strong>Installation log</strong>
                  <span>{logs.length} events</span>
                  <ArrowRight size={12} />
                </summary>
                <div>{logs.map((entry, index) => <p key={index}>{entry}</p>)}</div>
              </details>
            </>
          )}
          {page === "finish" && (
            <>
              <div className="setup-finish">
                <span className="setup-finish-icon"><CheckCircle2 size={32} /></span>
                <small className="setup-eyebrow muted">{t.finishTag}</small>
                <h1>{t.finishTitle}</h1>
                <p>{t.finishBody}</p>
              </div>
              {diagnostics && (
                <div className="setup-summary-grid">
                  <div className="setup-summary-card"><div className="setup-summary-icon"><Database size={16} /></div><div><span>{t.localDatabase}</span><strong>SQLCipher {diagnostics.databaseCipherVersion}</strong></div></div>
                  <div className="setup-summary-card"><div className="setup-summary-icon"><ShieldCheck size={16} /></div><div><span>Database integrity</span><strong>{diagnostics.databaseIntegrity === "ok" ? "Passed" : "Attention required"}</strong></div></div>
                  <div className="setup-summary-card"><div className="setup-summary-icon"><Activity size={16} /></div><div><span>Database journal</span><strong>{diagnostics.journalMode.toUpperCase()}</strong></div></div>
                  <div className="setup-summary-card"><div className="setup-summary-icon"><Monitor size={16} /></div><div><span>{t.installPath}</span><strong className="setup-summary-path">{diagnostics.dbPath}</strong></div></div>
                  <div className="setup-summary-card"><div className="setup-summary-icon"><Save size={16} /></div><div><span>{t.pending}</span><strong>{diagnostics.pendingOutboxCount}</strong></div></div>
                </div>
              )}
              {failure && <p className="setup-error" role="alert">{failure}</p>}
            </>
          )}
        </div>
      </section>
      <footer className="setup-actions">
        <span className="setup-action-hint">{page === "preferences" && !privacyAccepted ? t.privacyError : page === "verification" && !completed ? t.setupError : "You can change these preferences later in Settings."}</span>
        <div className="setup-action-buttons">
          {pageIndex > 0 && (
            <button type="button" className="setup-btn-back" onClick={() => { setPage(page === "welcome" ? "welcome" : page === "preferences" ? "welcome" : "verification"); setFailure(""); }}>
              <ArrowLeft size={15} /> {t.back}
            </button>
          )}
          <button type="button" className="setup-btn-primary" onClick={() => void next()} disabled={running || finishing || (page === "finish" && !completed) || (page === "preferences" && !privacyAccepted)}>
            {running || finishing ? <RefreshCw size={16} className="spin" /> : page === "finish" ? <Check size={16} /> : <ArrowRight size={16} />}
            {running ? t.checking : finishing ? t.working : page === "finish" ? t.finish : page === "verification" ? (completed ? t.next : t.runChecks) : t.next}
          </button>
          {page === "verification" && failure && !running && (
            <button type="button" className="setup-btn-retry" onClick={() => void runChecks()}>{t.retry}</button>
          )}
        </div>
      </footer>
    </main>
    <footer className="setup-global-foot">
      <span>BeBoss Desktop <b>{diagnostics?.appVersion || "Version unavailable"}</b></span>
      <span>Protected local recovery · Supabase cloud data</span>
    </footer>
    </section>
  </div>;
}
