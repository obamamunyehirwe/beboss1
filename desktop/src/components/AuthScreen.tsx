import type React from "react";
import { useEffect, useState } from "react";
import { AlertTriangle, LoaderCircle, ShieldCheck, Smartphone, Sparkles, Zap } from "lucide-react";
import { type OwnerCredentials, requestOwnerOtp, toOwnerPhoneE164, verifyOwnerOtp } from "../lib/cloud";
import { errorText } from "../lib/format";

type AuthLang = "EN" | "RW" | "FR" | "SW";

const AUTH_COPY: Record<AuthLang, {
  marketing: string; headline: string; headlineEm: string; headlineSub: string;
  showcaseTitle: string; cloudConnected: string; showcaseFoot: string[];
  pillEncrypted: string; pillSync: string; pillPlatforms: string; foot: string;
  formEyebrow: string; formTitle: string; formSubtitle: string;
  usernameLabel: string; phoneLabel: string; codeLabel: string;
  usernamePlaceholder: string; phonePlaceholder: string; codePlaceholder: string;
  sendBtn: string; verifyBtn: string; busy: string; changeOwner: string;
  secureNote: string; sentNotice: string; language: string;
}> = {
  EN: {
    marketing: "RETAIL OPERATIONS PLATFORM", headline: "Run your business.",
    headlineEm: "From one command centre.",
    headlineSub: "Sales, inventory, customers, branches and staff — in sync with your BeBoss shop.",
    showcaseTitle: "SHOP PERFORMANCE", cloudConnected: "CLOUD CONNECTED",
    showcaseFoot: ["Sales intelligence", "Inventory control", "Multi-branch sync"],
    pillEncrypted: "Encrypted", pillSync: "Real-time sync", pillPlatforms: "Mobile + Desktop",
    foot: "SECURE OWNER ACCESS · ENGLISH · IKINYARWANDA · FRANÇAIS · KISWAHILI",
    formEyebrow: "OWNER SIGN IN", formTitle: "Welcome to BeBoss",
    formSubtitle: "Verify the mobile number already registered to your shop. Desktop access is granted only to an active, verified shop owner.",
    usernameLabel: "Shop owner username", phoneLabel: "Registered mobile number", codeLabel: "SMS verification code",
    usernamePlaceholder: "your-shop-username", phonePlaceholder: "+250 7XX XXX XXX", codePlaceholder: "Enter the code received by SMS",
    sendBtn: "Send secure verification code", verifyBtn: "Verify owner and open desktop", busy: "Please wait…",
    changeOwner: "Change owner details", secureNote: "Your session is encrypted by the operating-system keyring.",
    sentNotice: "If the details match a registered shop owner, an SMS verification code has been sent to the registered phone.",
    language: "Language"
  },
  RW: {
    marketing: "URUBURO RWUBUTUNGA", headline: "Kora ubucuruzi bwawe.",
    headlineEm: "Kuva ku kigo kimwe cy'ubuyobozi.",
    headlineSub: "Gurisha, ibikoresho, abakiriya, amashami n'abakozi — bihuza n'ubucuruzi bwawe bwa BeBoss.",
    showcaseTitle: "IMIRINGA Y'IDUKA", cloudConnected: "IFIYE KU RUBUGIRIZA",
    showcaseFoot: ["Ubwenge bw'kugurisha", "Kugenzura ibikoresho", "Guhuza amashami"],
    pillEncrypted: "Byarinzwe", pillSync: "Igihe nyacyo", pillPlatforms: "Telefone + Mudasobwa",
    foot: "KWINJIRA KU MUKURU BYARINZWE · IGIKINYARWANDA · IGIFARANSA · IGISWAHILI · ICYONGEREZA",
    formEyebrow: "KWINJIRA KU MUKURU", formTitle: "Murakaza neza kuri BeBoss",
    formSubtitle: "Emeza numero ya telefone isanzwe yanditse ku iduka ryawe. Kwinjira kuri mudasobwa bikemerewe gusa ku mukuru nyobozi wemejwe.",
    usernameLabel: "Izina ry'umukuru w'iduka", phoneLabel: "Numero ya telefone yanditse", codeLabel: "Kode yo kwemeza kuri SMS",
    usernamePlaceholder: "izina-ry-iduka-ryawe", phonePlaceholder: "+250 7XX XXX XXX", codePlaceholder: "Andika kode yakiriwe kuri SMS",
    sendBtn: "Ohereza kode yo kwemeza", verifyBtn: "Emeza umukuru ufungure mudasobwa", busy: "Tegereza…",
    changeOwner: "Hindura amakuru y'umukuru", secureNote: "Igihe cyawe kirinzwe n'ububiko bw'umutekano wa sisitemu.",
    sentNotice: "Niba amakuru ahuza n'umukuru w'iduka wanditse, kode yo kwemeza yohererejwe kuri telefone yanditse.",
    language: "Ururimi"
  },
  FR: {
    marketing: "PLATEFORME D'EXPLOITATION COMMERCIALE", headline: "Gérez votre commerce.",
    headlineEm: "Depuis un poste de commandement unique.",
    headlineSub: "Ventes, stock, clients, succursales et personnel — synchronisés avec votre boutique BeBoss.",
    showcaseTitle: "PERFORMANCE DE LA BOUTIQUE", cloudConnected: "CONNECTE AU CLOUD",
    showcaseFoot: ["Analyse des ventes", "Gestion du stock", "Synchro multi-succursales"],
    pillEncrypted: "Chiffré", pillSync: "Temps réel", pillPlatforms: "Mobile + Bureau",
    foot: "ACCÈS PROPRIÉTAIRE SÉCURISÉ · FRANÇAIS · IKINYARWANDA · KISWAHILI · ANGLAIS",
    formEyebrow: "CONNEXION PROPRIÉTAIRE", formTitle: "Bienvenue sur BeBoss",
    formSubtitle: "Vérifiez le numéro de mobile déjà enregistré pour votre boutique. L'accès bureau est réservé à un propriétaire actif et vérifié.",
    usernameLabel: "Nom d'utilisateur du propriétaire", phoneLabel: "Numéro de mobile enregistré", codeLabel: "Code de vérification SMS",
    usernamePlaceholder: "nom-de-votre-boutique", phonePlaceholder: "+250 7XX XXX XXX", codePlaceholder: "Saisissez le code reçu par SMS",
    sendBtn: "Envoyer le code de vérification", verifyBtn: "Vérifier et ouvrir le bureau", busy: "Veuillez patienter…",
    changeOwner: "Modifier les coordonnées", secureNote: "Votre session est chiffrée par le coffre-fort du système.",
    sentNotice: "Si les informations correspondent à un propriétaire enregistré, un code de vérification a été envoyé par SMS au numéro enregistré.",
    language: "Langue"
  },
  SW: {
    marketing: "JUKWAA LA UENDESHAJI WA BIASHARA", headline: "Endesha biashara yako.",
    headlineEm: "Kutoka kituo kimoja cha udhibiti.",
    headlineSub: "Mauzo, bidhaa, wateja, matawi na wafanyakazi — vimeunganishwa na duka lako la BeBoss.",
    showcaseTitle: "UTENDAJI WA DUKA", cloudConnected: "UMEUNGANISHWA NA WINGU",
    showcaseFoot: ["Akili ya mauzo", "Udhibiti wa bidhaa", "Uunganishaji wa matawi"],
    pillEncrypted: "Imelindwa", pillSync: "Muda halisi", pillPlatforms: "Simu + Kompyuta",
    foot: "UFIKIAJI SALAMA WA MMILIKI · KISWAHILI · IKINYARWANDA · KIFARANSA · KIINGEREZA",
    formEyebrow: "KUINGIA KWA MMILIKI", formTitle: "Karibu kwenye BeBoss",
    formSubtitle: "Thibitisha namba ya simu iliyosajiliwa kwa duka lako. Kuingia kwenye kompyuta kunaruhusiwa kwa mmiliki hai na aliyethibitishwa tu.",
    usernameLabel: "Jina la mtumiaji wa mmiliki", phoneLabel: "Namba ya simu iliyosajiliwa", codeLabel: "Namba ya uthibitisho ya SMS",
    usernamePlaceholder: "jina-la-duka-lako", phonePlaceholder: "+250 7XX XXX XXX", codePlaceholder: "Weka namba uliyopokea kwa SMS",
    sendBtn: "Tuma namba ya uthibitisho", verifyBtn: "Thibitisha na ufungue kompyuta", busy: "Tafadhali subiri…",
    changeOwner: "Badilisha maelezo ya mmiliki", secureNote: "Kikao chako kimehifadhiwa kwa usalama na hifadhi ya mfumo.",
    sentNotice: "Ikiwa maelezo yanalingana na mmiliki aliyesajiliwa, namba ya uthibitisho imetumwa kwa namba iliyosajiliwa.",
    language: "Lugha"
  }
};

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (owner: OwnerCredentials) => Promise<void> }) {
  const [lang, setLang] = useState<AuthLang>("EN");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const t = AUTH_COPY[lang];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const storedLang = await window.beBossDesktop.secureStore.get("ui-language");
        if (alive && storedLang && storedLang in AUTH_COPY) setLang(storedLang as AuthLang);
        const identity = await window.beBossDesktop.secureStore.get("owner-identity");
        if (alive && identity) {
          const parsed = JSON.parse(identity) as OwnerCredentials;
          if (parsed.username) setUsername(parsed.username);
          if (parsed.phone) setPhone(parsed.phone);
        }
      } catch { /* prefill is best-effort */ }
    })();
    return () => { alive = false; };
  }, []);

  function chooseLang(next: AuthLang) {
    setLang(next);
    void window.beBossDesktop.secureStore.set("ui-language", next).catch(() => undefined);
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const normalized = toOwnerPhoneE164(phone);
      await requestOwnerOtp({ username: username.trim().toLowerCase(), phone: normalized });
      setPhone(normalized);
      setSent(true);
      setNotice(t.sentNotice);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const normalized = toOwnerPhoneE164(phone);
      await verifyOwnerOtp(normalized, code);
      await window.beBossDesktop.secureStore.set("owner-identity", JSON.stringify({ username: username.trim().toLowerCase(), phone: normalized }));
      await onAuthenticated({ username: username.trim().toLowerCase(), phone: normalized });
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return <div className="auth-shell">
    <div className="auth-art">
      <div className="auth-art-photo">
        <img src="/Friendly Modern Store Checkout.png" alt="BeBoss store" />
        <div className="auth-art-overlay" />
      </div>

      <div className="auth-brand">
        <span className="auth-logo-wrap">
          <img src="/beboss-app-icon.png" alt="BeBoss" className="auth-brand-icon" />
        </span>
        <span>BeBoss</span>
        <small>DESKTOP</small>
        <div className="auth-lang-switch" role="group" aria-label={t.language}>
          {(["EN", "RW", "FR", "SW"] as AuthLang[]).map((code) => (
            <button key={code} type="button" className={"auth-lang-btn " + (lang === code ? "active" : "")} onClick={() => chooseLang(code)} aria-pressed={lang === code}>{code}</button>
          ))}
        </div>
      </div>

      <div className="auth-headline">
        <span className="eyebrow"><Sparkles size={14} /> {t.marketing}</span>
        <h1>{t.headline}<br /><em>{t.headlineEm}</em></h1>
        <p>{t.headlineSub}</p>
      </div>

      <div className="auth-showcase">
        <div className="showcase-top"><span>{t.showcaseTitle}</span><span className="showcase-desktop-label"><span className="live-dot" />DESKTOP WORKSPACE</span></div>
        <div className="showcase-product">
          <img src="/beboss-app-logo.png" alt="BeBoss product logo" />
          <div className="showcase-product-copy"><strong>One command centre</strong><span>Sales · Inventory · Teams · Branches</span></div>
          <img className="showcase-wordmark" src="/beboss-wordmark-light.png" alt="BeBoss" />
        </div>
        <div className="showcase-bottom">{t.showcaseFoot.map((label) => <span key={label}>{label}</span>)}</div>
      </div>

      <div className="auth-feature-pills">
        <span><ShieldCheck size={12} /> {t.pillEncrypted}</span>
        <span><Zap size={12} /> {t.pillSync}</span>
        <span><Smartphone size={12} /> {t.pillPlatforms}</span>
      </div>

      <div className="auth-foot">{t.foot}</div>
    </div>

    <div className="auth-panel">
      <div className="auth-form-wrap">
        <div className="auth-form-brand">
          <img src="/beboss-wordmark-light.png" alt="BeBoss" className="auth-wordmark" />
        </div>
        <div className="auth-form-icon"><ShieldCheck size={23} /></div>
        <span className="eyebrow muted">{t.formEyebrow}</span>
        <h2>{t.formTitle}</h2>
        <p className="muted">{t.formSubtitle}</p>
        <form onSubmit={sent ? verifyCode : sendCode} className="auth-form">
          <label>{t.usernameLabel}
            <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={2} maxLength={80} autoComplete="username" required disabled={sent} placeholder={t.usernamePlaceholder} />
          </label>
          <label>{t.phoneLabel}
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" required disabled={sent} placeholder={t.phonePlaceholder} />
          </label>
          {sent && <label>{t.codeLabel}
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" minLength={4} maxLength={8} required placeholder={t.codePlaceholder} autoFocus />
          </label>}
          {error && <div className="inline-alert error"><AlertTriangle size={16} />{error}</div>}
          {notice && <div className="inline-alert info"><ShieldCheck size={16} />{notice}</div>}
          <button className="btn-primary full" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : sent ? <ShieldCheck size={18} /> : <Smartphone size={18} />}
            {busy ? t.busy : sent ? t.verifyBtn : t.sendBtn}
          </button>
          {sent && <button type="button" className="btn-quiet full" onClick={() => { setSent(false); setCode(""); setNotice(""); }}>{t.changeOwner}</button>}
        </form>
        <div className="auth-secure"><ShieldCheck size={15} /> {t.secureNote}</div>
      </div>
    </div>
  </div>;
}