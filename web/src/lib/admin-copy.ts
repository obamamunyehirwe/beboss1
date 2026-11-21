import { useI18n } from "./i18n";
const words: Record<string, readonly [string, string, string]> = {
  'Cloud sync monitor':['Igenzura ry’ihuza','Suivi de synchronisation','Ufuatiliaji wa usawazishaji'],
  'Business analytics':['Isesengura ry’ubucuruzi','Analyse de l’activité','Uchanganuzi wa biashara'],
  'Live health of every BeBoss shop, payment and device.':['Uko amaduka, ubwishyu n’ibikoresho bihagaze ubu.','État des boutiques, paiements et appareils BeBoss en direct.','Hali ya maduka, malipo na vifaa vya BeBoss kwa wakati halisi.'],
  'Every registered BeBoss shop, its license, quotas and remote controls.':['Amaduka yiyandikishije, impushya zayo n’ibipimo byayo.','Boutiques inscrites, licences, quotas et commandes à distance.','Maduka yaliyosajiliwa, leseni, vikomo na vidhibiti vyake.'],
  'Verify MTN MoMo and Airtel Money claims from the app and website, then unlock shops.':['Genzura ubwishyu bwa MTN MoMo na Airtel Money mbere yo gufungura amaduka.','Vérifiez les demandes MTN MoMo et Airtel Money avant d’activer les boutiques.','Hakiki madai ya MTN MoMo na Airtel Money kabla ya kufungua maduka.'],
  'Live configuration shared by the website and every BeBoss app.':['Igenamiterere rihuriweho n’urubuga na porogaramu za BeBoss.','Configuration partagée par le site et les applications BeBoss.','Mipangilio inayotumiwa na tovuti na programu zote za BeBoss.'],
  'Messages from the website contact form, updated live.':['Ubutumwa buvuye ku rubuga, buvugururwa ako kanya.','Messages du formulaire de contact, actualisés en direct.','Ujumbe kutoka kwenye fomu ya mawasiliano, husasishwa moja kwa moja.'],
  'Publish new Android APKs. The website, QR codes and the app\'s update check all point to the current release.':['Tangaza APK nshya za Android. Urubuga, kode QR na porogaramu bikoresha verisiyo iriho.','Publiez les APK Android. Le site, les QR codes et les mises à jour utilisent la version actuelle.','Chapisha APK za Android. Tovuti, misimbo ya QR na masasisho hurejelea toleo la sasa.'],
  Overview: ["Incamake", "Vue d’ensemble", "Muhtasari"],
  Analytics: ["Isesengura", "Analyses", "Uchanganuzi"],
  "AI Copilot": ["Umufasha wa AI", "Assistant IA", "Msaidizi wa AI"],
  "Payments queue": ["Ubwishyu butegereje", "Paiements à vérifier", "Malipo yanayosubiri"],
  Shops: ["Amaduka", "Boutiques", "Maduka"],
  Devices: ["Ibikoresho", "Appareils", "Vifaa"],
  "Shop staff": ["Abakozi b’amaduka", "Personnel des boutiques", "Wafanyakazi wa maduka"],
  "Unlock codes": ["Kode zo gufungura", "Codes d’activation", "Misimbo ya kufungua"],
  "Cloud sync": ["Guhuza amakuru", "Synchronisation cloud", "Usawazishaji wa wingu"],
  "App releases": ["Verisiyo za porogaramu", "Versions de l’application", "Matoleo ya programu"],
  Inbox: ["Ubutumwa", "Boîte de réception", "Kikasha"],
  Announcements: ["Amatangazo", "Annonces", "Matangazo"],
  "Audit log": ["Amateka y’ibikorwa", "Journal d’audit", "Kumbukumbu za ukaguzi"],
  "Admin team": ["Abayobozi", "Équipe d’administration", "Timu ya wasimamizi"],
  Settings: ["Igenamiterere", "Paramètres", "Mipangilio"],
  Workspace: ["Aho ukorera", "Espace de travail", "Eneo la kazi"],
  Operations: ["Ibikorwa", "Opérations", "Shughuli"],
  Administration: ["Ubuyobozi", "Administration", "Usimamizi"],
  "Search everything": ["Shakisha hose", "Rechercher partout", "Tafuta kila mahali"],
  "Go to": ["Jya kuri", "Accéder à", "Nenda kwa"],
  "No matches.": ["Nta bisubizo.", "Aucun résultat.", "Hakuna matokeo."],
  Search: ["Shakisha", "Rechercher", "Tafuta"],
  Refresh: ["Vugurura", "Actualiser", "Onyesha upya"],
  "View public site": ["Reba urubuga", "Voir le site public", "Tazama tovuti"],
  "Master admin": ["Umuyobozi mukuru", "Administrateur principal", "Msimamizi mkuu"],
  "Support (read-only)": [
    "Ubufasha (gusoma gusa)",
    "Assistance (lecture seule)",
    "Usaidizi (kusoma tu)",
  ],
  "Live cloud sync": [
    "Guhuza amakuru",
    "Synchronisation en direct",
    "Usawazishaji wa moja kwa moja",
  ],
  "Sign out": ["Sohoka", "Se déconnecter", "Ondoka"],
  "Restricted to the BeBoss admin team": [
    "Ku bayobozi ba BeBoss gusa",
    "Réservé à l’équipe BeBoss",
    "Kwa wasimamizi wa BeBoss pekee",
  ],
  "or with email": ["cyangwa ukoreshe imeri", "ou par e-mail", "au kwa barua pepe"],
  "Sign in": ["Injira", "Se connecter", "Ingia"],
  Password: ["Ijambo ry’ibanga", "Mot de passe", "Nenosiri"],
  "Forgot password?": ["Wibagiwe ijambo ry’ibanga?", "Mot de passe oublié ?", "Umesahau nenosiri?"],
  "Full name": ["Amazina yose", "Nom complet", "Jina kamili"],
  Email: ["Imeri", "E-mail", "Barua pepe"],
  "Admin access is granted by the master admin. New accounts see the admin center only after approval.":
    [
      "Umuyobozi mukuru ni we wemeza konti nshya mbere yo kwinjira.",
      "L’administrateur principal doit approuver les nouveaux comptes avant tout accès.",
      "Msimamizi mkuu lazima aidhinishe akaunti mpya kabla ya kuingia.",
    ],
};
export function useAdminText() {
  const { lang } = useI18n();
  return (s: string) =>
    lang === "en" ? s : (words[s]?.[lang === "rw" ? 0 : lang === "fr" ? 1 : 2] ?? s);
}
